import { useEffect, useMemo, useState } from 'react';
import { X, Clapperboard, Plus, Trash2, Bookmark, Pencil, Check } from 'lucide-react';
import { api } from '../../lib/api.js';
import { ASPECTS } from '../../lib/storyboard.js';
import { isTouch } from '../../lib/useMedia.js';
import { useConfirm } from '../ConfirmDialog.jsx';

const NEW_PLAN = '__new';

/**
 * New storyboard: for which plan (or a new one), from which template, in which
 * format. It's stored as a storyboard block of that plan.
 * onCreated({ planId, block }).
 */
export default function NewStoryboardModal({ plans, planId: initialPlan = '', onCreated, onClose }) {
  const open = useMemo(() => [...(plans || [])].sort((a, b) => Number(a.status === 'archived') - Number(b.status === 'archived')), [plans]);
  const [planId, setPlanId] = useState(initialPlan || open[0]?.id || NEW_PLAN);
  const [planName, setPlanName] = useState('');
  const [client, setClient] = useState('');
  const [templates, setTemplates] = useState([]);
  const [template, setTemplate] = useState('launch');
  const [aspect, setAspect] = useState(null); // null = the template's
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dialog, ask] = useConfirm();
  const [editing, setEditing] = useState(null); // { key, label, description } — one of yours being renamed

  useEffect(() => { api.listStoryboardTemplates().then(setTemplates).catch(() => setTemplates([])); }, []);
  useEffect(() => { if (!planId && open[0]) setPlanId(open[0].id); }, [open, planId]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const tpl = templates.find((t) => t.key === template) || null;
  const format = aspect || tpl?.aspect || '16:9';
  const isNew = planId === NEW_PLAN;
  const canCreate = !busy && (!isNew || planName.trim());

  const create = async () => {
    if (!canCreate) return;
    setBusy(true); setError('');
    try {
      let pid = planId;
      if (isNew) pid = (await api.createPlan({ name: planName.trim(), client: client.trim() })).id;
      const { block } = await api.createStoryboard(pid, { title: title.trim(), aspect: format, template: template || undefined });
      onCreated({ planId: pid, block });
    } catch (e) { setError(e.message); setBusy(false); }
  };

  const choices = [{ key: '', label: 'Empty', description: 'Start with no shots.' }, ...templates];
  const removeTemplate = (t) => ask({
    title: 'Delete this template?', message: `“${t.label}” goes from the list. Storyboards made from it stay as they are.`, confirmLabel: 'Delete', danger: true,
    onConfirm: async () => {
      try {
        await api.removeStoryboardTemplate(t.key);
        setTemplates((l) => l.filter((x) => x.key !== t.key));
        if (template === t.key) setTemplate('launch');
      } catch (e) { setError(e.message); }
    },
  });
  const saveTemplate = async () => {
    const e = editing;
    if (!e?.label.trim()) return;
    try {
      const t = await api.updateStoryboardTemplate(e.key, { label: e.label.trim(), description: e.description });
      setTemplates((l) => l.map((x) => (x.key === t.key ? t : x)));
      setEditing(null); setError('');
    } catch (err) { setError(err.message); }
  };
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal new-sb" role="dialog" aria-modal="true" aria-label="New storyboard">
        <div className="modal-head">
          <h2>New storyboard</h2>
          <button className="icon-btn" onClick={onClose} disabled={busy} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label htmlFor="nsb-plan">For the project</label>
            <select id="nsb-plan" className="input" value={planId} onChange={(e) => setPlanId(e.target.value)}>
              {open.map((p) => <option key={p.id} value={p.id}>{p.name}{p.client ? ` — ${p.client}` : ''}{p.status === 'archived' ? ' (archived)' : ''}</option>)}
              <option value={NEW_PLAN}>＋ New project…</option>
            </select>
          </div>
          {isNew && (
            <div className="row-2">
              <div className="field">
                <label htmlFor="nsb-pname">Project name</label>
                <input id="nsb-pname" className="input" value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="e.g. Nova launch" autoFocus={!isTouch()} />
              </div>
              <div className="field">
                <label htmlFor="nsb-client">Client</label>
                <input id="nsb-client" className="input" value={client} onChange={(e) => setClient(e.target.value)} placeholder="Optional" />
              </div>
            </div>
          )}
          <div className="field">
            <label>Start from</label>
            <div className="nsb-templates">
              {choices.map((t) => (editing?.key === t.key ? (
                <form key={t.key} className="nsb-tpl nsb-tpl-edit on" onSubmit={(e) => { e.preventDefault(); saveTemplate(); }}
                  onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEditing(null); } }}>
                  <input className="input" value={editing.label} maxLength={120} autoFocus placeholder="Name" aria-label="Template name"
                    onChange={(e) => setEditing({ ...editing, label: e.target.value })} />
                  <input className="input" value={editing.description} maxLength={400} placeholder="What it's for (optional)" aria-label="Description"
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
                  <span className="nsb-tpl-edit-foot">
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
                    <button type="submit" className="btn btn-sm btn-primary" disabled={!editing.label.trim()}><Check size={13} /> Save</button>
                  </span>
                </form>
              ) : (
                <div key={t.key || 'empty'} className="nsb-tpl-wrap">
                  <button type="button" className={`nsb-tpl ${template === t.key ? 'on' : ''} ${t.own ? 'own' : ''}`} onClick={() => { setTemplate(t.key); setAspect(null); }}>
                    <span className="nsb-tpl-title">{t.own ? <Bookmark size={14} /> : t.key ? <Clapperboard size={14} /> : <Plus size={14} />} {t.label}</span>
                    <span className="nsb-tpl-desc">{t.description}</span>
                    {t.shots ? <span className="nsb-tpl-meta">{t.own ? 'Yours · ' : ''}{t.shots} shots{t.target ? ` · ${t.target} s` : ''} · {t.aspect}</span> : null}
                  </button>
                  {t.own && (
                    <span className="nsb-tpl-tools">
                      <button type="button" className="icon-btn" onClick={() => setEditing({ key: t.key, label: t.label, description: t.description || '' })} aria-label={`Rename the template ${t.label}`} title="Rename"><Pencil size={13} /></button>
                      <button type="button" className="icon-btn" onClick={() => removeTemplate(t)} aria-label={`Delete the template ${t.label}`} title="Delete this template"><Trash2 size={13} /></button>
                    </span>
                  )}
                </div>
              )))}
            </div>
            <div className="hint">Your own: open a storyboard and choose <b>⋯ → Save as template</b> — its shots, texts and length, without pictures.</div>
          </div>
          <div className="row-2">
            <div className="field">
              <label>Format</label>
              <div className="seg-toggle sb-aspect" role="group" aria-label="Format">
                {ASPECTS.map((a) => <button key={a} type="button" className={format === a ? 'on' : ''} onClick={() => setAspect(a)}>{a}</button>)}
              </div>
            </div>
            <div className="field">
              <label htmlFor="nsb-title">Name</label>
              <input id="nsb-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tpl ? tpl.label.split(' · ')[0] : 'Storyboard'}
                onKeyDown={(e) => { if (e.key === 'Enter') create(); }} />
            </div>
          </div>
          {error && <div className="form-error">{error}</div>}
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={create} disabled={!canCreate}><Clapperboard size={15} /> {busy ? 'Creating…' : 'Create storyboard'}</button>
        </div>
      </div>
      {dialog}
    </div>
  );
}
