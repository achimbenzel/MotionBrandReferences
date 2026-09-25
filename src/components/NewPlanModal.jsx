import { useEffect, useState } from 'react';
import { X, FilePlus2, LayoutTemplate, Check } from 'lucide-react';
import { api } from '../lib/api.js';
import { isTouch } from '../lib/useMedia.js';
import { useConfirm } from './ConfirmDialog.jsx';
import { useToast } from './Toast.jsx';

const BLANK = '';
const LAST_KEY = 'newPlanTemplate';

/**
 * "New plan": a name, an optional client and what to start from — an empty
 * page, a built-in template (launch video, branding) or one saved from a plan.
 */
export default function NewPlanModal({ onClose, onCreated }) {
  const toast = useToast();
  const [dialog, ask] = useConfirm();
  const [templates, setTemplates] = useState(null);
  const [choice, setChoice] = useState(() => { try { return localStorage.getItem(LAST_KEY) || BLANK; } catch { return BLANK; } });
  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api.listPlanTemplates().then((t) => { if (alive) setTemplates(t); }).catch(() => { if (alive) setTemplates([]); });
    return () => { alive = false; };
  }, []);
  // A remembered template that no longer exists falls back to an empty plan.
  useEffect(() => {
    if (templates && choice && !templates.some((t) => t.id === choice)) setChoice(BLANK);
  }, [templates, choice]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy && !dialog) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy, dialog]);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const plan = await api.createPlan({ name: name.trim() || undefined, client: client.trim(), template: choice || undefined });
      try { localStorage.setItem(LAST_KEY, choice); } catch { /* ignore */ }
      onCreated(plan);
    } catch (e) {
      toast(`Could not create plan: ${e.message}`, 'error');
      setBusy(false);
    }
  };

  const removeTemplate = (t) => ask({
    title: 'Delete template?',
    message: `“${t.name}” will be removed. Plans made from it stay as they are.`,
    confirmLabel: 'Delete', danger: true,
    onConfirm: async () => {
      try {
        await api.removePlanTemplate(t.id);
        setTemplates((list) => list.filter((x) => x.id !== t.id));
        if (choice === t.id) setChoice(BLANK);
      } catch (e) { toast(`Could not delete: ${e.message}`, 'error'); }
    },
  });

  const builtin = (templates || []).filter((t) => t.builtin);
  const own = (templates || []).filter((t) => !t.builtin);
  // A plain render helper (not a component), so choosing keeps keyboard focus.
  const option = ({ id, emoji, icon: Icon, title, text, outline, onRemove }) => (
    <div key={id || 'blank'} className={`tpl ${choice === id ? 'on' : ''}`} role="radio" aria-checked={choice === id} tabIndex={0}
      onClick={() => setChoice(id)}
      onDoubleClick={create}
      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (e.key === 'Enter' && choice === id) create(); else setChoice(id); } }}>
      <span className="tpl-icon">{emoji ? <span className="tpl-emoji">{emoji}</span> : <Icon size={20} />}</span>
      <span className="tpl-body">
        <span className="tpl-name">{title}</span>
        <span className="tpl-text">{text}</span>
        {outline?.length > 0 && <span className="tpl-outline">{outline.slice(0, 7).join(' · ')}{outline.length > 7 ? ' …' : ''}</span>}
      </span>
      {choice === id && <span className="tpl-check"><Check size={14} /></span>}
      {onRemove && (
        <button className="icon-btn tpl-del" title="Delete template" onClick={(e) => { e.stopPropagation(); onRemove(); }}><X size={14} /></button>
      )}
    </div>
  );

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal new-plan-modal" role="dialog" aria-modal="true" aria-label="New plan">
        <div className="modal-head">
          <h2>New plan</h2>
          <button className="icon-btn" onClick={onClose} disabled={busy} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="row-2">
            <div className="field">
              <label>Name</label>
              <input className="input" value={name} autoFocus={!isTouch()} placeholder="Untitled plan"
                onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') create(); }} />
            </div>
            <div className="field">
              <label>Client <span className="label-opt">optional</span></label>
              <input className="input" value={client} placeholder="e.g. Acme"
                onChange={(e) => setClient(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') create(); }} />
            </div>
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label>Start from</label>
            <div className="tpl-list" role="radiogroup" aria-label="Start from">
              {option({ id: BLANK, icon: FilePlus2, title: 'Empty plan', text: 'A blank page — add blocks as you go.' })}
              {templates === null && <div className="spinner" style={{ margin: '12px auto' }} />}
              {builtin.map((t) => option({ id: t.id, emoji: t.emoji, icon: LayoutTemplate, title: t.name, text: t.description, outline: t.outline }))}
              {own.length > 0 && <div className="tpl-group">Your templates</div>}
              {own.map((t) => option({
                id: t.id, emoji: t.emoji, icon: LayoutTemplate, title: t.name,
                text: `${t.outline.length} block${t.outline.length === 1 ? '' : 's'}`, outline: t.outline, onRemove: () => removeTemplate(t),
              }))}
            </div>
            <div className="hint" style={{ marginTop: 8 }}>Tip: save any plan as your own template from its <b>Edit</b> menu.</div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={create} disabled={busy}>{busy ? 'Creating…' : 'Create plan'}</button>
        </div>
      </div>
      {dialog}
    </div>
  );
}
