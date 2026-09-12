import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Trash2, Pencil, MoreHorizontal, Plus, X, ChevronDown, ChevronRight,
  Puzzle, FileCode, Braces, Youtube, ExternalLink, Copy, Eye, EyeOff, UploadCloud,
  Paperclip, Download,
} from 'lucide-react';
import { api, softwareFileUrl } from '../lib/api.js';
import { CURRENCIES, currencySymbol, normalizeUrl } from '../lib/types.js';
import { useToast } from '../components/Toast.jsx';
import Menu from '../components/Menu.jsx';

const rid = () => Math.random().toString(36).slice(2, 10);
const firstEmoji = (str) => {
  const t = String(str || '').trim(); if (!t) return '';
  try { const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' }); return [...seg.segment(t)][0].segment; }
  catch { return [...t][0]; }
};
const fmtBytes = (n) => {
  if (!n) return ''; const u = ['B', 'KB', 'MB', 'GB']; let v = n; let i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
};

const TABS = [
  { key: 'plugins', label: 'Plugins', icon: Puzzle },
  { key: 'scripts', label: 'Scripts', icon: FileCode },
  { key: 'expressions', label: 'Expressions', icon: Braces },
  { key: 'tutorials', label: 'Tutorials', icon: Youtube },
];

export default function SoftwareDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [soft, setSoft] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('plugins');
  const [q, setQ] = useState('');
  const softRef = useRef(null); softRef.current = soft;
  const pending = useRef({});
  const timer = useRef(null);
  const scriptRef = useRef(null);

  useEffect(() => {
    let alive = true;
    setSoft(null); setError(null);
    api.getSoftware(id).then((s) => { if (alive) setSoft(s); }).catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [id]);

  // Optimistic + merged-patch save (server response is ignored so fast typing
  // is never clobbered); file ops set state from their own responses.
  const save = (patch, immediate = false) => {
    setSoft((prev) => ({ ...prev, ...patch }));
    pending.current = { ...pending.current, ...patch };
    clearTimeout(timer.current);
    const send = () => { const p = pending.current; pending.current = {}; api.updateSoftware(id, p).catch((e) => toast(`Could not save: ${e.message}`, 'error')); };
    if (immediate) send(); else timer.current = setTimeout(send, 500);
  };
  const arr = (field) => softRef.current[field] || [];
  const addItem = (field, item) => save({ [field]: [...arr(field), item] }, true);
  const editItem = (field, itemId, patch) => save({ [field]: arr(field).map((x) => (x.id === itemId ? { ...x, ...patch } : x)) });
  const delItem = (field, itemId) => save({ [field]: arr(field).filter((x) => x.id !== itemId) }, true);

  const copy = async (text) => { if (!text) return; try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast('Copy failed', 'error'); } };

  const remove = async () => {
    try {
      const { trashId } = await api.removeSoftware(id);
      navigate('/software');
      toast('Moved to Trash', 'ok', { label: 'Undo', onClick: async () => { try { await api.restoreTrash(trashId); navigate(`/software/${id}`); } catch (e) { toast(`Undo failed: ${e.message}`, 'error'); } } });
    } catch (e) { toast(`Delete failed: ${e.message}`, 'error'); }
  };

  // Plugin file
  const attachPluginFile = async (pluginId, file) => { if (!file) return; try { setSoft(await api.setPluginFile(id, pluginId, file)); } catch (e) { toast(`Upload failed: ${e.message}`, 'error'); } };
  const removePluginFile = async (pluginId) => { try { setSoft(await api.removePluginFile(id, pluginId)); } catch (e) { toast(`Failed: ${e.message}`, 'error'); } };
  // Scripts
  const onScriptPick = async (file) => { if (!file) return; try { setSoft(await api.addScript(id, file, file.name)); } catch (e) { toast(`Upload failed: ${e.message}`, 'error'); } };
  const editScript = (scriptId, patch) => {
    setSoft((prev) => ({ ...prev, scripts: prev.scripts.map((x) => (x.id === scriptId ? { ...x, ...patch } : x)) }));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => api.updateScript(id, scriptId, patch).catch((e) => toast(`Could not save: ${e.message}`, 'error')), 500);
  };
  const removeScript = async (scriptId) => { try { setSoft(await api.removeScript(id, scriptId)); } catch (e) { toast(`Failed: ${e.message}`, 'error'); } };

  if (error) return <div className="detail"><BackBtn /> <div className="center-msg">Couldn’t load: {error}</div></div>;
  if (!soft) return <div className="detail"><div className="spinner" /></div>;

  const ql = q.trim().toLowerCase();
  const match = (...fields) => !ql || fields.filter(Boolean).some((f) => String(f).toLowerCase().includes(ql));
  const plugins = (soft.plugins || []).filter((p) => match(p.name, p.category, p.account, p.notes, p.version));
  const scripts = (soft.scripts || []).filter((s) => match(s.name, s.notes));
  const expressions = (soft.expressions || []).filter((e) => match(e.title, e.code, (e.tags || []).join(' ')));
  const tutorials = (soft.tutorials || []).filter((t) => match(t.title, t.channel, (t.tags || []).join(' ')));

  // Spend per currency
  const by = {};
  for (const p of (soft.plugins || [])) { const n = parseFloat(String(p.price || '').replace(',', '.')); if (Number.isFinite(n) && n > 0) by[p.currency || 'EUR'] = (by[p.currency || 'EUR'] || 0) + n; }
  const spend = Object.entries(by).map(([c, v]) => `${currencySymbol(c)} ${v % 1 ? v.toFixed(2) : v}`).join(' · ');

  const counts = { plugins: (soft.plugins || []).length, scripts: (soft.scripts || []).length, expressions: (soft.expressions || []).length, tutorials: (soft.tutorials || []).length };

  return (
    <div className="detail software-detail">
      <div className="plan-topbar">
        <BackBtn to="/software" label="Back to Software" />
        <Menu
          trigger={<button className="btn btn-sm"><Pencil size={15} /> Edit <MoreHorizontal size={15} /></button>}
          items={[{ label: 'Delete software', icon: <Trash2 size={15} />, danger: true, onClick: remove }]}
        />
      </div>

      <div className="soft-head">
        <input className="soft-icon-input" value={soft.icon || ''} placeholder="🎬" title="Emoji"
          onChange={(e) => save({ icon: firstEmoji(e.target.value) }, true)} />
        <div className="soft-head-main">
          <input className="soft-name" value={soft.name} placeholder="Software name" onChange={(e) => save({ name: e.target.value })} />
          <div className="soft-stats">
            {counts.plugins} plugin{counts.plugins === 1 ? '' : 's'}
            {spend && <> · <strong>{spend}</strong> spent</>}
          </div>
        </div>
      </div>

      <div className="soft-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`soft-tab ${tab === t.key ? 'on' : ''}`} onClick={() => setTab(t.key)}>
            <t.icon size={15} /> {t.label} <span className="count">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      <div className="soft-toolbar">
        <input className="input soft-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${tab}…`} />
        {tab === 'plugins' && <button className="btn btn-sm btn-primary" onClick={() => addItem('plugins', newPlugin())}><Plus size={15} /> Add plugin</button>}
        {tab === 'scripts' && <button className="btn btn-sm btn-primary" onClick={() => scriptRef.current?.click()}><UploadCloud size={15} /> Upload script</button>}
        {tab === 'expressions' && <button className="btn btn-sm btn-primary" onClick={() => addItem('expressions', { id: rid(), title: '', code: '', notes: '', tags: [] })}><Plus size={15} /> Add expression</button>}
        {tab === 'tutorials' && <button className="btn btn-sm btn-primary" onClick={() => addItem('tutorials', { id: rid(), title: '', url: '', channel: '', tags: [] })}><Plus size={15} /> Add tutorial</button>}
      </div>

      <input ref={scriptRef} type="file" className="visually-hidden-input" onChange={(e) => { onScriptPick(e.target.files?.[0]); e.target.value = ''; }} />

      {/* ---- Plugins ---- */}
      {tab === 'plugins' && (
        plugins.length ? (
          <div className="plugin-list">
            {plugins.map((p) => (
              <PluginCard key={p.id} soft={soft} plugin={p} copy={copy}
                onEdit={(patch) => editItem('plugins', p.id, patch)}
                onDelete={() => delItem('plugins', p.id)}
                onAttach={(f) => attachPluginFile(p.id, f)}
                onRemoveFile={() => removePluginFile(p.id)} />
            ))}
          </div>
        ) : <Empty icon={Puzzle} text={ql ? 'No plugins match your search.' : 'No plugins yet. Add one to start your database.'} />
      )}

      {/* ---- Scripts ---- */}
      {tab === 'scripts' && (
        scripts.length ? (
          <div className="filelist">
            {scripts.map((s) => (
              <div className="filerow" key={s.id}>
                <FileCode size={20} className="filerow-icon" />
                <div className="filerow-main">
                  <input className="script-name" value={s.name} onChange={(e) => editScript(s.id, { name: e.target.value })} placeholder="Script name" />
                  <input className="script-notes" value={s.notes} onChange={(e) => editScript(s.id, { notes: e.target.value })} placeholder="Note (optional)" />
                </div>
                <span className="filerow-size">{fmtBytes(s.size)}</span>
                <a className="icon-btn filerow-open" href={softwareFileUrl(id, s.file)} download={s.fileName} title="Download"><Download size={15} /></a>
                <button className="icon-btn filerow-del" onClick={() => removeScript(s.id)} title="Delete"><X size={15} /></button>
              </div>
            ))}
          </div>
        ) : <Empty icon={FileCode} text={ql ? 'No scripts match your search.' : 'Upload your own scripts / plugins (.jsx, .ffx, .zip…).'} />
      )}

      {/* ---- Expressions ---- */}
      {tab === 'expressions' && (
        expressions.length ? (
          <div className="expr-list">
            {expressions.map((e) => (
              <div className="expr-card" key={e.id}>
                <div className="expr-head">
                  <input className="expr-title" value={e.title} placeholder="Expression name" onChange={(ev) => editItem('expressions', e.id, { title: ev.target.value })} />
                  <button className="icon-btn" title="Copy code" onClick={() => copy(e.code)}><Copy size={15} /></button>
                  <button className="icon-btn expr-del" title="Delete" onClick={() => delItem('expressions', e.id)}><X size={15} /></button>
                </div>
                <CodeArea className="expr-code" value={e.code} spellCheck={false} placeholder="// paste the expression here" onChange={(ev) => editItem('expressions', e.id, { code: ev.target.value })} />
                <TagRow tags={e.tags} onChange={(tags) => editItem('expressions', e.id, { tags })} />
              </div>
            ))}
          </div>
        ) : <Empty icon={Braces} text={ql ? 'No expressions match your search.' : 'Add reusable expressions with a one-click copy.'} />
      )}

      {/* ---- Tutorials ---- */}
      {tab === 'tutorials' && (
        tutorials.length ? (
          <div className="tut-list">
            {tutorials.map((t) => (
              <div className="tut-row" key={t.id}>
                <Youtube size={18} className="tut-icon" />
                <div className="tut-main">
                  <input className="tut-title" value={t.title} placeholder="Tutorial title" onChange={(e) => editItem('tutorials', t.id, { title: e.target.value })} />
                  <div className="tut-fields">
                    <input className="input tut-url" value={t.url} placeholder="https://youtube.com/…" onChange={(e) => editItem('tutorials', t.id, { url: e.target.value })} />
                    <input className="input tut-channel" value={t.channel} placeholder="Channel / author" onChange={(e) => editItem('tutorials', t.id, { channel: e.target.value })} />
                  </div>
                  <TagRow tags={t.tags} onChange={(tags) => editItem('tutorials', t.id, { tags })} />
                </div>
                <a className={`icon-btn tut-open ${t.url ? '' : 'is-disabled'}`} href={t.url ? normalizeUrl(t.url) : undefined} target="_blank" rel="noopener noreferrer" title="Open"><ExternalLink size={15} /></a>
                <button className="icon-btn filerow-del" onClick={() => delItem('tutorials', t.id)} title="Delete"><X size={15} /></button>
              </div>
            ))}
          </div>
        ) : <Empty icon={Youtube} text={ql ? 'No tutorials match your search.' : 'Link useful YouTube tutorials and articles.'} />
      )}
    </div>
  );
}

function newPlugin() {
  return { id: rid(), name: '', category: '', url: '', account: '', key: '', price: '', currency: 'EUR', version: '', purchasedAt: '', notes: '', file: null, fileName: null };
}

function PluginCard({ soft, plugin: p, onEdit, onDelete, onAttach, onRemoveFile, copy }) {
  const [open, setOpen] = useState(!p.name);
  const [showKey, setShowKey] = useState(false);
  const fileRef = useRef(null);
  const set = (k) => (e) => onEdit({ [k]: e.target.value });

  return (
    <div className="plugin-card">
      <div className="plugin-top">
        <button className="plugin-toggle" onClick={() => setOpen((v) => !v)}>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
        <input className="plugin-name" value={p.name} placeholder="Plugin name" onChange={set('name')} />
        <input className="plugin-cat" value={p.category} placeholder="Category" onChange={set('category')} />
        <span className="plugin-price">{p.price ? `${currencySymbol(p.currency)} ${p.price}` : ''}</span>
        {p.url && <a className="icon-btn" href={normalizeUrl(p.url)} target="_blank" rel="noopener noreferrer" title="Open website"><ExternalLink size={15} /></a>}
        <Menu align="right" trigger={<button className="icon-btn" title="More"><MoreHorizontal size={16} /></button>}
          items={[{ label: 'Delete plugin', icon: <Trash2 size={15} />, danger: true, onClick: onDelete }]} />
      </div>

      {open && (
        <div className="plugin-body">
          <Field label="Website / source"><input className="input" value={p.url} placeholder="https://…" onChange={set('url')} /></Field>
          <Field label="Account (email / user)"><input className="input" value={p.account} placeholder="you@example.com" onChange={set('account')} /></Field>
          <Field label="License key / serial">
            <div className="secret">
              <input className="input" type={showKey ? 'text' : 'password'} value={p.key} placeholder="XXXX-XXXX-XXXX" autoComplete="off" onChange={set('key')} />
              <button className="icon-btn" title={showKey ? 'Hide' : 'Show'} onClick={() => setShowKey((v) => !v)}>{showKey ? <EyeOff size={15} /> : <Eye size={15} />}</button>
              <button className="icon-btn" title="Copy key" onClick={() => copy(p.key)}><Copy size={15} /></button>
            </div>
          </Field>
          <div className="plugin-row3">
            <Field label="Price"><input className="input" value={p.price} placeholder="49.99" onChange={set('price')} /></Field>
            <Field label="Currency">
              <select className="input" value={p.currency} onChange={set('currency')}>
                {CURRENCIES.map((c) => <option key={c.key} value={c.key}>{c.key}</option>)}
              </select>
            </Field>
            <Field label="Version"><input className="input" value={p.version} placeholder="v1.0" onChange={set('version')} /></Field>
            <Field label="Purchased"><input className="input" type="date" value={p.purchasedAt} onChange={set('purchasedAt')} /></Field>
          </div>
          <Field label="Notes"><textarea className="textarea" value={p.notes} placeholder="Install notes, seat count…" onChange={set('notes')} /></Field>
          <Field label="Installer / plugin file">
            {p.file ? (
              <div className="plugin-file">
                <Paperclip size={15} />
                <a className="plugin-file-name" href={softwareFileUrl(soft.id, p.file)} download={p.fileName}>{p.fileName}</a>
                <button className="icon-btn" title="Remove file" onClick={onRemoveFile}><X size={15} /></button>
              </div>
            ) : (
              <button className="btn btn-sm" onClick={() => fileRef.current?.click()}><UploadCloud size={14} /> Attach file</button>
            )}
            <input ref={fileRef} type="file" className="visually-hidden-input" onChange={(e) => { onAttach(e.target.files?.[0]); e.target.value = ''; }} />
          </Field>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return <label className="plugin-field"><span>{label}</span>{children}</label>;
}

// A textarea that grows to fit its content (no inner scrollbar). With
// box-sizing: border-box, scrollHeight excludes the border, so add it back.
function CodeArea({ value, onChange, ...rest }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    el.style.height = 'auto';
    const cs = getComputedStyle(el);
    const border = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
    el.style.height = `${el.scrollHeight + border}px`;
  }, [value]);
  return <textarea ref={ref} value={value} onChange={onChange} {...rest} />;
}

function TagRow({ tags = [], onChange }) {
  const [draft, setDraft] = useState('');
  const add = () => { const t = draft.trim(); if (!t || tags.includes(t)) { setDraft(''); return; } onChange([...tags, t]); setDraft(''); };
  return (
    <div className="tagrow">
      {tags.map((t) => (
        <span key={t} className="tagchip">{t}<button onClick={() => onChange(tags.filter((x) => x !== t))}><X size={11} /></button></span>
      ))}
      <input className="tagrow-input" value={draft} placeholder="tag…" onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} onBlur={add} />
    </div>
  );
}

function Empty({ icon: Icon, text }) {
  return <div className="empty" style={{ marginTop: 8 }}><Icon size={28} /><p style={{ marginTop: 8 }}>{text}</p></div>;
}

function BackBtn({ to, label = 'Back' }) {
  const navigate = useNavigate();
  return <button className="detail-back" style={{ margin: 0 }} onClick={() => (to ? navigate(to) : navigate(-1))}><ArrowLeft size={16} /> {label}</button>;
}
