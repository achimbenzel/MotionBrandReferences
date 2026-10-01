import { useEffect, useState } from 'react';
import { Plus, X, Check, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { DECK_TEMPLATES } from '../../lib/slides.js';
import { useToast } from '../Toast.jsx';
import Menu from '../Menu.jsx';
import { SlideView } from './Slide.jsx';

/**
 * A new presentation: what to start from — the built-in templates and your
 * own, each shown by its cover in its look — who it's for and its name.
 * `clientId` picks the client to begin with (the client's page).
 */
export default function NewPresentation({ defaults, clients, clientId: initialClient = '', onClose, onMade }) {
  const toast = useToast();
  const [template, setTemplate] = useState('proposal');
  const [clientId, setClientId] = useState(initialClient);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [own, setOwn] = useState([]);
  const [renaming, setRenaming] = useState(null); // { id, name }
  const client = clients.find((c) => c.id === clientId);
  useEffect(() => { api.presentationTemplates().then((r) => setOwn(r.own || [])).catch(() => {}); }, []);

  const fill = (v) => String(v || '').replaceAll('[Client]', client?.name || 'Client');
  const look = { brand: { ...(defaults?.brand || {}), logo: null, mark: null }, meta: { preparedFor: client?.name || '', preparedBy: defaults?.preparedBy || defaults?.brand?.name || '', version: 'v1.0' } };
  // The covers (pictures aside for the built-in ones): what a new deck from each will start like.
  const builtIn = Object.entries(DECK_TEMPLATES).map(([key, t]) => {
    const first = t.slides()[0];
    return { key, label: t.label, hint: t.hint, count: t.slides().length,
      deck: { id: 'preview', title: t.label, label: t.deckLabel, theme: defaults?.theme || {}, ...look },
      slide: { ...first, id: key, data: { ...first.data, title: fill(first.data.title) } } };
  });
  const mine = own.map((t) => ({ key: `own:${t.id}`, id: t.id, label: t.name, hint: t.hint || 'Your template', count: t.slides.length, own: true,
    deck: { id: t.id, base: `/data/presentation-template/${t.id}`, title: t.name, label: t.label, theme: t.theme, ...look },
    slide: t.slides[0] ? { ...t.slides[0], data: { ...t.slides[0].data, title: fill(t.slides[0].data?.title) } } : null }));
  const picked = [...builtIn, ...mine].find((t) => t.key === template) || builtIn[0];

  const make = async () => {
    setBusy(true);
    try { onMade(await api.createPresentation({ template: picked.key, clientId, title })); } catch (e) { toast(e.message, 'error'); setBusy(false); }
  };
  const rename = async () => {
    const r = renaming; setRenaming(null);
    if (!r?.name.trim()) return;
    try { const t = await api.updateDeckTemplate(r.id, { name: r.name }); setOwn((list) => list.map((x) => (x.id === t.id ? t : x))); } catch (e) { toast(e.message, 'error'); }
  };
  const remove = async (t) => {
    try {
      const { trashId } = await api.removeDeckTemplate(t.id);
      setOwn((list) => list.filter((x) => x.id !== t.id));
      if (template === t.key) setTemplate('proposal');
      toast(`Template “${t.label}” moved to Trash`, 'ok', { label: 'Undo', onClick: async () => { await api.restoreTrash(trashId); setOwn((await api.presentationTemplates()).own); } });
    } catch (e) { toast(e.message, 'error'); }
  };

  const card = (t) => {
    const editing = t.own && renaming?.id === t.id;
    return (
      <div key={t.key} className={`pz-template ${template === t.key ? 'on' : ''}`}>
        <button type="button" role="radio" aria-checked={template === t.key} className="pz-template-pick" onClick={() => setTemplate(t.key)}>
          {t.slide ? <SlideView deck={t.deck} slide={t.slide} index={0} total={t.count} /> : <div className="pz-view" />}
          {editing ? null : <b>{template === t.key && <Check size={14} />}<span>{t.label}</span> <em>{t.count} slide{t.count === 1 ? '' : 's'}</em></b>}
          {!editing && <small>{t.hint}</small>}
        </button>
        {editing && (
          <input className="input pz-template-rename" value={renaming.name} autoFocus aria-label="Name of the template"
            onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} onBlur={rename}
            onKeyDown={(e) => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') { e.stopPropagation(); setRenaming(null); } }} />
        )}
        {t.own && (
          <Menu align="right" trigger={<button type="button" className="icon-btn pz-template-menu" aria-label={`Template options: ${t.label}`}><MoreHorizontal size={15} /></button>} items={[
            { label: 'Rename', icon: <Pencil size={15} />, onClick: () => setRenaming({ id: t.id, name: t.label }) },
            { label: 'Delete', icon: <Trash2 size={15} />, danger: true, onClick: () => remove(t) },
          ]} />
        )}
      </div>
    );
  };

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal pz-new" role="dialog" aria-modal="true" aria-label="New presentation">
        <div className="modal-head">
          <h2>New presentation</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="pz-templates" role="radiogroup" aria-label="Start from">{builtIn.map(card)}</div>
          {mine.length > 0 && (
            <>
              <h3 className="pz-templates-h">Your templates</h3>
              <div className="pz-templates" role="radiogroup" aria-label="Your templates">{mine.map(card)}</div>
            </>
          )}
          <div className="pz-new-fields">
            <label className="field"><span>For <em>optional</em></span>
              <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">No client</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="field"><span>Name <em>optional</em></span>
              <input className="input" value={title} placeholder={`${picked.label}${client ? ` · ${client.name}` : ''}`} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') make(); }} />
            </label>
          </div>
          {!defaults?.brand?.name && <p className="hint">Your logo, name and contact go in once (Presentation → From) — “Use this look for new ones” keeps them for every new deck.</p>}
          {!mine.length && <p className="hint">A presentation of yours can become a template too: ⋯ → Save as template in its editor.</p>}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={make} disabled={busy}><Plus size={16} /> {busy ? 'Creating…' : 'Create'}</button>
        </div>
      </div>
    </div>
  );
}
