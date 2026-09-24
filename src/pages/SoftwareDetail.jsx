import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Trash2, Pencil, MoreHorizontal, Plus, X, Check, Play,
  Puzzle, Braces, Youtube, ExternalLink, Copy, Eye, EyeOff, UploadCloud,
  Paperclip, Download, Image as ImageIcon, Camera, Circle, ChevronDown, ChevronRight,
  ArrowUp, ArrowDown,
} from 'lucide-react';
import { api, softwareFileUrl } from '../lib/api.js';
import { useSaver, useRefreshOnReturn } from '../lib/autosave.js';
import { CURRENCIES, currencySymbol, normalizeUrl, TAG_COLORS, tagColor, PLAN_GRADIENTS, gradientCss, youtubeThumb } from '../lib/types.js';
import { useToast } from '../components/Toast.jsx';
import Menu from '../components/Menu.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';

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
// Give a category a stable colour so the same word is always the same chip.
const catColor = (cat) => {
  const s = String(cat || '').trim(); if (!s) return null;
  let h = 0; for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
};

const SOFT_EMOJIS = ['🎬', '🎨', '✨', '🖌️', '🎥', '📹', '🧩', '🎞️', '🪄', '🔧',
  '💡', '🚀', '🔥', '⭐', '🌈', '📐', '📊', '🖥️', '🎧', '🎵', '📸', '🏗️', '🛠️', '💎'];

const TABS = [
  { key: 'plugins', label: 'Plugins & Scripts', icon: Puzzle },
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
  const [editingId, setEditingId] = useState(null); // plugin currently in the edit form
  const [editingTut, setEditingTut] = useState(null); // tutorial currently in the edit form
  const [bannerPicker, setBannerPicker] = useState(false);
  const [avatarPicker, setAvatarPicker] = useState(false);
  const [emojiInput, setEmojiInput] = useState('');
  const [confirm, setConfirm] = useState(null); // { title, message, confirmLabel, danger, onConfirm }
  const softRef = useRef(null); softRef.current = soft;
  const pending = useRef({});
  const saver = useSaver();
  const bannerRef = useRef(null);
  const avatarRef = useRef(null);
  const groupImgRef = useRef(null);
  const pendingGroup = useRef(null);

  useEffect(() => {
    let alive = true;
    saver.flush(); // another software's pending edits go out before we switch
    setSoft(null); setError(null); setEditingId(null); setEditingTut(null);
    api.getSoftware(id).then((s) => { if (alive) setSoft(s); }).catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [id, saver]);

  // Back on this tab after a while: pick up changes made on another device.
  useRefreshOnReturn(() => api.getSoftware(id), setSoft, saver);

  // Send any pending text edit now; resolves when it has landed (file ops
  // await this first so a debounced save can't arrive after the upload
  // response and lose the file).
  const flush = () => saver.flush('soft');
  // Optimistic + merged-patch save (server response ignored so fast typing is
  // never clobbered); file fields are server-authoritative and preserved by id.
  const save = (patch, immediate = false) => {
    setSoft((prev) => ({ ...prev, ...patch }));
    pending.current = { ...pending.current, ...patch };
    const softId = id;
    saver.schedule('soft', async () => {
      const p = pending.current; pending.current = {};
      if (!Object.keys(p).length) return;
      try { await api.updateSoftware(softId, p); } catch (e) { toast(`Could not save: ${e.message}`, 'error'); }
    }, { immediate });
  };
  const fileOp = async (fn) => { await flush(); try { setSoft(await fn()); } catch (e) { toast(`Failed: ${e.message}`, 'error'); } };
  const arr = (field) => softRef.current[field] || [];

  // Plugins
  const editPlugin = (pid, patch) => save({ plugins: arr('plugins').map((p) => (p.id === pid ? { ...p, ...patch } : p)) });
  const addPlugin = () => { const np = newPlugin(); save({ plugins: [...arr('plugins'), np] }, true); setTab('plugins'); setEditingId(np.id); };
  const delPlugin = (p) => ask({ title: 'Delete plugin?', message: `“${p.name || 'Untitled plugin'}” and its file will be removed.`, confirmLabel: 'Delete', danger: true, onConfirm: () => { if (editingId === p.id) setEditingId(null); save({ plugins: arr('plugins').filter((x) => x.id !== p.id) }, true); } });

  // Expression groups + expressions
  const editGroup = (gid, patch, immediate = false) => save({ expressionGroups: arr('expressionGroups').map((g) => (g.id === gid ? { ...g, ...patch } : g)) }, immediate);
  const addGroup = () => { setTab('expressions'); save({ expressionGroups: [...arr('expressionGroups'), { id: rid(), name: '', image: null, imageName: null, items: [] }] }, true); };
  const delGroup = (g) => ask({ title: 'Delete expression group?', message: `“${g.name || 'Untitled group'}” and its ${(g.items || []).length} expression(s) will be removed.`, confirmLabel: 'Delete', danger: true, onConfirm: () => save({ expressionGroups: arr('expressionGroups').filter((x) => x.id !== g.id) }, true) });
  const addExpr = (gid) => editGroup(gid, { items: [...(arr('expressionGroups').find((g) => g.id === gid)?.items || []), { id: rid(), title: '', code: '', notes: '', color: null, tags: [] }] });
  const editExpr = (gid, eid, patch) => { const g = arr('expressionGroups').find((x) => x.id === gid); if (!g) return; editGroup(gid, { items: (g.items || []).map((e) => (e.id === eid ? { ...e, ...patch } : e)) }); };
  const moveExpr = (gid, eid, dir) => { const g = arr('expressionGroups').find((x) => x.id === gid); if (!g) return; const items = [...(g.items || [])]; const i = items.findIndex((e) => e.id === eid); const j = i + dir; if (i < 0 || j < 0 || j >= items.length) return; [items[i], items[j]] = [items[j], items[i]]; editGroup(gid, { items }, true); };
  const delExpr = (gid, e) => ask({ title: 'Delete expression?', message: `“${e.title || 'Untitled expression'}” will be removed.`, confirmLabel: 'Delete', danger: true, onConfirm: () => { const g = arr('expressionGroups').find((x) => x.id === gid); if (!g) return; editGroup(gid, { items: (g.items || []).filter((x) => x.id !== e.id) }, true); } });

  // Tutorials
  const addTutorial = () => { const nt = { id: rid(), title: '', url: '', channel: '', tags: [] }; save({ tutorials: [...arr('tutorials'), nt] }, true); setTab('tutorials'); setEditingTut(nt.id); };
  const editTutorial = (tid, patch) => save({ tutorials: arr('tutorials').map((t) => (t.id === tid ? { ...t, ...patch } : t)) });
  const delTutorial = (t) => ask({ title: 'Delete tutorial?', message: `“${t.title || 'Untitled tutorial'}” will be removed.`, confirmLabel: 'Delete', danger: true, onConfirm: () => { if (editingTut === t.id) setEditingTut(null); save({ tutorials: arr('tutorials').filter((x) => x.id !== t.id) }, true); } });

  const ask = (opts) => setConfirm(opts);
  const copy = async (text) => { if (!text) return; try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast('Copy failed', 'error'); } };
  const download = (url, name) => { const a = document.createElement('a'); a.href = url; if (name) a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
  const askDownload = (p) => ask({ title: 'Download file?', message: `Download “${p.fileName}”${p.size ? ` (${fmtBytes(p.size)})` : ''}?`, confirmLabel: 'Download', icon: <Download size={17} />, onConfirm: () => download(softwareFileUrl(id, p.file), p.fileName) });

  // Header images (banner / avatar) — mirror Plan mode.
  const setImage = (kind, file) => { if (file) fileOp(() => api.setSoftwareImage(id, kind, file)); };
  const pickGradient = async (gid) => { await flush(); try { if (soft.banner) await api.removeSoftwareImage(id, 'banner'); setSoft(await api.updateSoftware(id, { bannerGradient: gid })); setBannerPicker(false); } catch (e) { toast(`Failed: ${e.message}`, 'error'); } };
  const removeBanner = () => { if (soft.banner) fileOp(() => api.removeSoftwareImage(id, 'banner')); else save({ bannerGradient: null }, true); };
  const pickEmoji = async (raw) => { const emoji = firstEmoji(raw); if (!emoji) return; await flush(); try { if (soft.avatar) await api.removeSoftwareImage(id, 'avatar'); setSoft(await api.updateSoftware(id, { avatarEmoji: emoji })); setEmojiInput(''); setAvatarPicker(false); } catch (e) { toast(`Failed: ${e.message}`, 'error'); } };
  const removeAvatar = () => { setAvatarPicker(false); if (soft.avatar) fileOp(() => api.removeSoftwareImage(id, 'avatar')); else save({ avatarEmoji: '' }, true); };

  // Expression-group image (uses a shared hidden input + a pending group id).
  const pickGroupImage = (gid) => { pendingGroup.current = gid; groupImgRef.current?.click(); };
  const onGroupImage = (file) => { const gid = pendingGroup.current; if (file && gid) fileOp(() => api.setGroupImage(id, gid, file)); };
  const removeGroupImage = (gid) => fileOp(() => api.removeGroupImage(id, gid));

  const remove = () => ask({
    title: 'Delete software?', message: `“${soft.name}” and everything in it will be moved to Trash.`, confirmLabel: 'Delete', danger: true,
    onConfirm: async () => {
      try {
        const { trashId } = await api.removeSoftware(id);
        navigate('/software');
        toast('Moved to Trash', 'ok', { label: 'Undo', onClick: async () => { try { await api.restoreTrash(trashId); navigate(`/software/${id}`); } catch (e) { toast(`Undo failed: ${e.message}`, 'error'); } } });
      } catch (e) { toast(`Delete failed: ${e.message}`, 'error'); }
    },
  });

  if (error) return <div className="detail"><BackBtn /> <div className="center-msg">Couldn’t load: {error}</div></div>;
  if (!soft) return <div className="detail"><div className="spinner" /></div>;

  const ql = q.trim().toLowerCase();
  const match = (...fields) => !ql || fields.filter(Boolean).some((f) => String(f).toLowerCase().includes(ql));
  const plugins = (soft.plugins || []).filter((p) => match(p.name, p.category, p.account, p.notes, p.version));
  const groups = (soft.expressionGroups || []).filter((g) => match(g.name) || (g.items || []).some((e) => match(e.title, e.code, (e.tags || []).join(' '))));
  const tutorials = (soft.tutorials || []).filter((t) => match(t.title, t.channel, (t.tags || []).join(' ')));

  // Spend per currency
  const by = {};
  for (const p of (soft.plugins || [])) { const n = parseFloat(String(p.price || '').replace(',', '.')); if (Number.isFinite(n) && n > 0) by[p.currency || 'EUR'] = (by[p.currency || 'EUR'] || 0) + n; }
  const spend = Object.entries(by).map(([c, v]) => `${currencySymbol(c)} ${v % 1 ? v.toFixed(2) : v}`).join(' · ');
  const exprCount = (soft.expressionGroups || []).reduce((n, g) => n + (g.items || []).length, 0);
  const counts = { plugins: (soft.plugins || []).length, expressions: exprCount, tutorials: (soft.tutorials || []).length };

  const bannerUrl = soft.banner ? softwareFileUrl(id, soft.banner) : null;
  const bannerGrad = !bannerUrl ? gradientCss(soft.bannerGradient) : null;
  const hasBanner = !!(bannerUrl || bannerGrad);
  const bannerStyle = bannerUrl ? { backgroundImage: `url("${bannerUrl}")` } : bannerGrad ? { backgroundImage: bannerGrad } : undefined;
  const avatarUrl = soft.avatar ? softwareFileUrl(id, soft.avatar) : null;
  const avatarEmoji = !avatarUrl ? (soft.avatarEmoji || null) : null;
  const editingPlugin = editingId ? (soft.plugins || []).find((p) => p.id === editingId) : null;
  const editingTutorial = editingTut ? (soft.tutorials || []).find((t) => t.id === editingTut) : null;

  return (
    <div className="detail software-detail">
      <div className="plan-topbar">
        <BackBtn to="/software" label="Back to Software" />
        <Menu
          trigger={<button className="btn btn-sm"><Pencil size={15} /> Edit <MoreHorizontal size={15} /></button>}
          items={[{ label: 'Delete software', icon: <Trash2 size={15} />, danger: true, onClick: remove }]}
        />
      </div>

      {/* Banner + avatar (like plans) */}
      <div className={`plan-banner ${hasBanner ? '' : 'empty'}`} style={bannerStyle}>
        <div className="plan-banner-actions">
          <button className="btn btn-sm" onClick={() => setBannerPicker((v) => !v)}><ImageIcon size={15} /> {hasBanner ? 'Change banner' : 'Add banner'}</button>
          {hasBanner && <button className="btn btn-sm btn-ghost" onClick={removeBanner}>Remove</button>}
        </div>
        {bannerPicker && <div className="banner-picker-backdrop" onClick={() => setBannerPicker(false)} />}
        {bannerPicker && (
          <div className="banner-picker" onMouseDown={(e) => e.stopPropagation()}>
            <div className="banner-picker-head">Gradients</div>
            <div className="banner-picker-grid">
              {PLAN_GRADIENTS.map((g) => (
                <button key={g.id} className={`banner-swatch ${soft.bannerGradient === g.id && !bannerUrl ? 'on' : ''}`}
                  style={{ backgroundImage: g.css }} title={g.id} onClick={() => pickGradient(g.id)} />
              ))}
            </div>
            <button className="btn btn-sm banner-picker-upload" onClick={() => { setBannerPicker(false); bannerRef.current?.click(); }}>
              <UploadCloud size={14} /> Upload custom image…
            </button>
          </div>
        )}
      </div>
      <div className="plan-idrow soft-idrow">
        <div className="plan-avatar-wrap">
          <button className="plan-avatar" onClick={() => setAvatarPicker((v) => !v)} title="Change image">
            {avatarUrl ? <img src={avatarUrl} alt="" />
              : avatarEmoji ? <span className="plan-avatar-emoji">{avatarEmoji}</span>
                : <span>{(soft.name || '?').charAt(0).toUpperCase()}</span>}
            <span className="plan-avatar-edit"><Camera size={15} /></span>
          </button>
          {avatarPicker && <div className="avatar-picker-backdrop" onClick={() => setAvatarPicker(false)} />}
          {avatarPicker && (
            <div className="avatar-picker" onMouseDown={(e) => e.stopPropagation()}>
              <div className="avatar-picker-emojis">
                {SOFT_EMOJIS.map((e) => (
                  <button key={e} className={`ap-emoji ${soft.avatarEmoji === e && !avatarUrl ? 'on' : ''}`} onClick={() => pickEmoji(e)}>{e}</button>
                ))}
              </div>
              <input className="input ap-input" value={emojiInput} placeholder="Type or paste an emoji…"
                onChange={(ev) => setEmojiInput(ev.target.value)}
                onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); pickEmoji(emojiInput); } }} />
              <div className="ap-actions">
                <button className="btn btn-sm" onClick={() => { setAvatarPicker(false); avatarRef.current?.click(); }}><UploadCloud size={14} /> Upload image…</button>
                {(avatarUrl || soft.avatarEmoji) && <button className="btn btn-sm btn-ghost" onClick={removeAvatar}>Remove</button>}
              </div>
            </div>
          )}
        </div>
        <div className="soft-idrow-main">
          <input className="soft-name" value={soft.name} placeholder="Software name" onChange={(e) => save({ name: e.target.value })} />
          <div className="soft-stats">
            {counts.plugins} plugin{counts.plugins === 1 ? '' : 's'} · {counts.expressions} expression{counts.expressions === 1 ? '' : 's'}
            {spend && <> · <strong>{spend}</strong> spent</>}
          </div>
        </div>
      </div>

      <input ref={bannerRef} type="file" accept="image/*" className="visually-hidden-input" onChange={(e) => { setImage('banner', e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={avatarRef} type="file" accept="image/*" className="visually-hidden-input" onChange={(e) => { setImage('avatar', e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={groupImgRef} type="file" accept="image/*" className="visually-hidden-input" onChange={(e) => { onGroupImage(e.target.files?.[0]); e.target.value = ''; }} />

      <div className="soft-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`soft-tab ${tab === t.key ? 'on' : ''}`} onClick={() => { setTab(t.key); setEditingId(null); setEditingTut(null); }}>
            <t.icon size={15} /> {t.label} <span className="count">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      {!editingPlugin && !editingTutorial && (
        <div className="soft-toolbar">
          <input className="input soft-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${tab === 'plugins' ? 'plugins' : tab}…`} />
          {tab === 'plugins' && <button className="btn btn-sm btn-primary" onClick={addPlugin}><Plus size={15} /> Add plugin</button>}
          {tab === 'expressions' && <button className="btn btn-sm btn-primary" onClick={addGroup}><Plus size={15} /> Add group</button>}
          {tab === 'tutorials' && <button className="btn btn-sm btn-primary" onClick={addTutorial}><Plus size={15} /> Add tutorial</button>}
        </div>
      )}

      {/* ---- Plugins & Scripts ---- */}
      {tab === 'plugins' && (editingPlugin ? (
        <PluginEditor
          key={editingPlugin.id} soft={soft} plugin={editingPlugin} copy={copy}
          onEdit={(patch) => editPlugin(editingPlugin.id, patch)}
          onSetImage={(f) => { if (f) fileOp(() => api.setPluginImage(id, editingPlugin.id, f)); }}
          onRemoveImage={() => ask({ title: 'Remove image?', message: 'Remove the preview image from this plugin?', confirmLabel: 'Remove', danger: true, onConfirm: () => fileOp(() => api.removePluginImage(id, editingPlugin.id)) })}
          onSetFile={(f) => { if (f) fileOp(() => api.setPluginFile(id, editingPlugin.id, f)); }}
          onRemoveFile={() => ask({ title: 'Remove file?', message: `Remove the installer “${editingPlugin.fileName}” from this plugin?`, confirmLabel: 'Remove', danger: true, onConfirm: () => fileOp(() => api.removePluginFile(id, editingPlugin.id)) })}
          onDelete={() => delPlugin(editingPlugin)}
          onDone={() => { flush(); setEditingId(null); }}
        />
      ) : (
        plugins.length ? (
          <div className="pcard-grid">
            {plugins.map((p) => (
              <PluginCard key={p.id} soft={soft} plugin={p}
                onOpen={() => setEditingId(p.id)} onDelete={() => delPlugin(p)} onDownload={() => askDownload(p)} />
            ))}
            <button className="pcard-add" onClick={addPlugin}><Plus size={22} /><span>Add plugin</span></button>
          </div>
        ) : <Empty icon={Puzzle} text={ql ? 'No plugins match your search.' : 'No plugins yet. Add one — a bought plugin or your own script.'} />
      ))}

      {/* ---- Expressions (grouped, colour-markable) ---- */}
      {tab === 'expressions' && (
        groups.length ? (
          <div className="expr-groups">
            {groups.map((g) => {
              const items = (g.items || []).filter((e) => match(e.title, e.code, (e.tags || []).join(' ')) || match(g.name));
              const imgUrl = g.image ? softwareFileUrl(id, g.image) : null;
              const collapsed = !!g.collapsed;
              return (
                <div className={`expr-group ${collapsed ? 'collapsed' : ''}`} key={g.id}>
                  <div className="expr-group-head">
                    <button className="expr-group-collapse" title={collapsed ? 'Expand' : 'Collapse'} onClick={() => editGroup(g.id, { collapsed: !collapsed }, true)}>
                      {collapsed ? <ChevronRight size={17} /> : <ChevronDown size={17} />}
                    </button>
                    <input className="expr-group-name" value={g.name} placeholder="Group name (e.g. Wiggle & bounce)" onChange={(e) => editGroup(g.id, { name: e.target.value })} />
                    <span className="count">{(g.items || []).length}</span>
                    {!collapsed && <button className="btn btn-sm" onClick={() => addExpr(g.id)}><Plus size={14} /> Expression</button>}
                    <Menu align="right" trigger={<button className="icon-btn" title="More"><MoreHorizontal size={16} /></button>}
                      items={[{ label: 'Delete group', icon: <Trash2 size={15} />, danger: true, onClick: () => delGroup(g) }]} />
                  </div>

                  {imgUrl ? (
                    <div className="expr-group-img">
                      <img src={imgUrl} alt={g.imageName || ''} loading="lazy" />
                      {!collapsed && (
                        <div className="expr-group-img-actions">
                          <button className="btn btn-sm" onClick={() => pickGroupImage(g.id)}><ImageIcon size={13} /> Change</button>
                          <button className="btn btn-sm btn-ghost" onClick={() => removeGroupImage(g.id)}>Remove</button>
                        </div>
                      )}
                    </div>
                  ) : (!collapsed && (
                    <button className="expr-group-addimg" onClick={() => pickGroupImage(g.id)}>
                      <ImageIcon size={16} /> Add a preview image (show what these expressions do)
                    </button>
                  ))}

                  {!collapsed && (items.length ? (
                    <div className="expr-list">
                      {items.map((e) => {
                        const col = e.color ? tagColor(e.color) : null;
                        const gi = (g.items || []).findIndex((x) => x.id === e.id);
                        const glen = (g.items || []).length;
                        return (
                          <div className="expr-card" key={e.id} style={col ? { borderLeft: `3px solid ${col.fg}` } : undefined}>
                            <div className="expr-head">
                              <ColorDot value={e.color} onChange={(c) => editExpr(g.id, e.id, { color: c })} />
                              <input className="expr-title" value={e.title} placeholder="Expression name" onChange={(ev) => editExpr(g.id, e.id, { title: ev.target.value })} />
                              <button className="icon-btn" title="Copy code" onClick={() => copy(e.code)}><Copy size={15} /></button>
                              <Menu align="right" trigger={<button className="icon-btn" title="More"><MoreHorizontal size={16} /></button>}
                                items={[
                                  ...(gi > 0 ? [{ label: 'Move up', icon: <ArrowUp size={15} />, onClick: () => moveExpr(g.id, e.id, -1) }] : []),
                                  ...(gi < glen - 1 ? [{ label: 'Move down', icon: <ArrowDown size={15} />, onClick: () => moveExpr(g.id, e.id, 1) }] : []),
                                  { separator: true },
                                  { label: 'Delete', icon: <Trash2 size={15} />, danger: true, onClick: () => delExpr(g.id, e) },
                                ]} />
                            </div>
                            <CodeArea className="expr-code" value={e.code} spellCheck={false} placeholder="// paste the expression here" onChange={(ev) => editExpr(g.id, e.id, { code: ev.target.value })} />
                            <TagRow tags={e.tags} onChange={(tags) => editExpr(g.id, e.id, { tags })} />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <button className="expr-empty-add" onClick={() => addExpr(g.id)}><Plus size={15} /> Add the first expression</button>
                  ))}
                </div>
              );
            })}
          </div>
        ) : <Empty icon={Braces} text={ql ? 'No expressions match your search.' : 'Group your expressions by setup, colour-mark them and add a preview image.'} />
      )}

      {/* ---- Tutorials ---- */}
      {tab === 'tutorials' && (editingTutorial ? (
        <TutorialEditor
          key={editingTutorial.id} tut={editingTutorial}
          onEdit={(patch) => editTutorial(editingTutorial.id, patch)}
          onDelete={() => delTutorial(editingTutorial)}
          onDone={() => { flush(); setEditingTut(null); }}
        />
      ) : (
        tutorials.length ? (
          <div className="pcard-grid">
            {tutorials.map((t) => (
              <TutorialCard key={t.id} tut={t} onOpen={() => setEditingTut(t.id)} onDelete={() => delTutorial(t)} />
            ))}
            <button className="pcard-add" onClick={addTutorial}><Plus size={22} /><span>Add tutorial</span></button>
          </div>
        ) : <Empty icon={Youtube} text={ql ? 'No tutorials match your search.' : 'Link useful YouTube tutorials — they show up as cards with the thumbnail.'} />
      ))}

      {confirm && (
        <ConfirmDialog {...confirm} onConfirm={confirm.onConfirm} onClose={() => setConfirm(null)} />
      )}
    </div>
  );
}

function newPlugin() {
  return { id: rid(), name: '', category: '', url: '', account: '', key: '', price: '', currency: 'EUR', version: '', purchasedAt: '', notes: '', file: null, fileName: null, size: 0, image: null, imageName: null };
}

/** Compact card shown in the plugins grid (image, name + size, category tag). */
function PluginCard({ soft, plugin: p, onOpen, onDelete, onDownload }) {
  const imgUrl = p.image ? softwareFileUrl(soft.id, p.image) : null;
  const col = catColor(p.category);
  const title = p.name || 'Untitled plugin';
  return (
    <div className="pcard">
      <button className="pcard-cover" onClick={onOpen} title="Edit">
        {imgUrl ? <img src={imgUrl} alt="" loading="lazy" /> : <Puzzle size={30} />}
      </button>
      <div className="pcard-menu" onClick={(e) => e.stopPropagation()}>
        <Menu align="right" trigger={<button className="icon-btn pcard-menu-btn" title="More"><MoreHorizontal size={16} /></button>}
          items={[
            { label: 'Edit', icon: <Pencil size={15} />, onClick: onOpen },
            ...(p.file ? [{ label: 'Download', icon: <Download size={15} />, onClick: onDownload }] : []),
            { separator: true },
            { label: 'Delete', icon: <Trash2 size={15} />, danger: true, onClick: onDelete },
          ]} />
      </div>
      <div className="pcard-body" onClick={onOpen}>
        <div className="pcard-title">{title}{p.size ? <span className="pcard-size"> ({fmtBytes(p.size)})</span> : null}</div>
        {p.category && <span className="pcard-cat" style={{ background: col.bg, color: col.fg }}>{p.category}</span>}
      </div>
      {p.file && (
        <button className="btn btn-sm pcard-dl" onClick={onDownload}><Download size={14} /> Download</button>
      )}
    </div>
  );
}

/** Full edit form for a single plugin (the “add / edit” view). */
function PluginEditor({ soft, plugin: p, onEdit, onSetImage, onRemoveImage, onSetFile, onRemoveFile, onDelete, onDone, copy }) {
  const [showKey, setShowKey] = useState(false);
  const imgRef = useRef(null);
  const fileRef = useRef(null);
  const set = (k) => (e) => onEdit({ [k]: e.target.value });
  const imgUrl = p.image ? softwareFileUrl(soft.id, p.image) : null;

  return (
    <div className="plugin-editor">
      <div className="plugin-editor-head">
        <button className="btn btn-sm" onClick={onDone}><ArrowLeft size={15} /> Back to cards</button>
        <div className="plugin-editor-head-r">
          <button className="btn btn-sm btn-primary" onClick={onDone}><Check size={15} /> Done</button>
          <button className="btn btn-sm btn-danger" onClick={onDelete}><Trash2 size={15} /> Delete</button>
        </div>
      </div>

      <div className="plugin-editor-grid">
        <div className="plugin-editor-image">
          {imgUrl ? (
            <div className="pe-img">
              <img src={imgUrl} alt="" />
              <div className="pe-img-actions">
                <button className="btn btn-sm" onClick={() => imgRef.current?.click()}><ImageIcon size={13} /> Change</button>
                <button className="btn btn-sm btn-ghost" onClick={onRemoveImage}>Remove</button>
              </div>
            </div>
          ) : (
            <button className="pe-img-add" onClick={() => imgRef.current?.click()}>
              <ImageIcon size={22} /><span>Add preview image</span><small>Shown on the plugin card</small>
            </button>
          )}
          <input ref={imgRef} type="file" accept="image/*" className="visually-hidden-input" onChange={(e) => { onSetImage(e.target.files?.[0]); e.target.value = ''; }} />
        </div>

        <div className="plugin-editor-fields">
          <div className="plugin-row2">
            <Field label="Name"><input className="input" value={p.name} placeholder="Plugin / script name" onChange={set('name')} /></Field>
            <Field label="Category"><input className="input" value={p.category} placeholder="e.g. Mockup, Script, VFX" onChange={set('category')} /></Field>
          </div>
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
                {p.size ? <span className="plugin-file-size">{fmtBytes(p.size)}</span> : null}
                <button className="icon-btn" title="Remove file" onClick={onRemoveFile}><X size={15} /></button>
              </div>
            ) : (
              <button className="btn btn-sm" onClick={() => fileRef.current?.click()}><UploadCloud size={14} /> Attach file</button>
            )}
            <input ref={fileRef} type="file" className="visually-hidden-input" onChange={(e) => { onSetFile(e.target.files?.[0]); e.target.value = ''; }} />
          </Field>
        </div>
      </div>
    </div>
  );
}

/** Compact tutorial card with the YouTube thumbnail. */
function TutorialCard({ tut: t, onOpen, onDelete }) {
  const thumb = youtubeThumb(t.url);
  const [broken, setBroken] = useState(false);
  const showThumb = thumb && !broken;
  return (
    <div className="pcard tcard">
      <button className="pcard-cover tcard-cover" onClick={onOpen} title="Edit">
        {showThumb ? <img src={thumb} alt="" loading="lazy" onError={() => setBroken(true)} /> : <Youtube size={30} />}
        {showThumb && <span className="tcard-play"><Play size={18} /></span>}
      </button>
      <div className="pcard-menu" onClick={(e) => e.stopPropagation()}>
        <Menu align="right" trigger={<button className="icon-btn pcard-menu-btn" title="More"><MoreHorizontal size={16} /></button>}
          items={[
            { label: 'Edit', icon: <Pencil size={15} />, onClick: onOpen },
            ...(t.url ? [{ label: 'Open', icon: <ExternalLink size={15} />, onClick: () => window.open(normalizeUrl(t.url), '_blank', 'noopener') }] : []),
            { separator: true },
            { label: 'Delete', icon: <Trash2 size={15} />, danger: true, onClick: onDelete },
          ]} />
      </div>
      <div className="pcard-body" onClick={onOpen}>
        <div className="pcard-title">{t.title || 'Untitled tutorial'}</div>
        {t.channel && <div className="pcard-channel">{t.channel}</div>}
      </div>
      {t.url && (
        <a className="btn btn-sm pcard-dl" href={normalizeUrl(t.url)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
          <Youtube size={14} /> Watch
        </a>
      )}
    </div>
  );
}

/** Add / edit form for a tutorial, with a live YouTube thumbnail preview. */
function TutorialEditor({ tut: t, onEdit, onDelete, onDone }) {
  const set = (k) => (e) => onEdit({ [k]: e.target.value });
  const thumb = youtubeThumb(t.url);
  return (
    <div className="plugin-editor">
      <div className="plugin-editor-head">
        <button className="btn btn-sm" onClick={onDone}><ArrowLeft size={15} /> Back to cards</button>
        <div className="plugin-editor-head-r">
          <button className="btn btn-sm btn-primary" onClick={onDone}><Check size={15} /> Confirm</button>
          <button className="btn btn-sm btn-danger" onClick={onDelete}><Trash2 size={15} /> Delete</button>
        </div>
      </div>

      <div className="plugin-editor-grid">
        <div className="plugin-editor-image">
          {thumb ? (
            <div className="pe-img"><img src={thumb} alt="" /></div>
          ) : (
            <div className="pe-img-add" style={{ cursor: 'default' }}>
              <Youtube size={22} /><span>YouTube preview</span><small>Paste a link to see the thumbnail</small>
            </div>
          )}
        </div>
        <div className="plugin-editor-fields">
          <Field label="Title"><input className="input" value={t.title} placeholder="Tutorial title" onChange={set('title')} /></Field>
          <Field label="YouTube / video URL"><input className="input" value={t.url} placeholder="https://youtube.com/watch?v=…" onChange={set('url')} /></Field>
          <Field label="Channel / author"><input className="input" value={t.channel} placeholder="e.g. ECAbrams" onChange={set('channel')} /></Field>
          <Field label="Tags"><TagRow tags={t.tags} onChange={(tags) => onEdit({ tags })} /></Field>
        </div>
      </div>
    </div>
  );
}

/** Small colour-dot popover for marking an expression. */
function ColorDot({ value, onChange }) {
  const col = value ? tagColor(value) : null;
  return (
    <Menu align="left" trigger={
      <button className="expr-color-dot" title="Colour" style={col ? { background: col.fg, borderColor: col.fg } : undefined}>
        {!col && <Circle size={13} />}
      </button>
    } items={[
      { label: 'No colour', icon: <span className="cdot cdot-none" />, onClick: () => onChange(null) },
      ...TAG_COLORS.map((c) => ({ label: c.key.charAt(0).toUpperCase() + c.key.slice(1), icon: <span className="cdot" style={{ background: c.fg }} />, onClick: () => onChange(c.key) })),
    ]} />
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
