import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../lib/api.js';
import { useToast } from './Toast.jsx';

/**
 * Save a picture into a plan: into one of its moodboards, or a new one named
 * `boardName` (made in the plan's Concept tab). `makeFile()` renders the file.
 * Used by the Brand Tester (test sheet) and the Mockups (renders).
 */
export default function SaveToPlanModal({ title, boardName, boardMatch, hint, submitLabel = 'Save', makeFile, onSaved, onClose }) {
  const toast = useToast();
  const [plans, setPlans] = useState(null);
  const [planId, setPlanId] = useState('');
  const [plan, setPlan] = useState(null);
  const [target, setTarget] = useState('new');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.listPlans().then((ps) => { setPlans(ps); if (ps[0]) setPlanId(ps.find((p) => p.status !== 'archived')?.id || ps[0].id); }).catch(() => setPlans([])); }, []);
  useEffect(() => {
    setPlan(null);
    if (!planId) return;
    api.getPlan(planId).then((p) => {
      setPlan(p);
      const boards = p.blocks.filter((b) => b.type === 'moodboard');
      setTarget(boards.find((b) => boardMatch?.test(b.title))?.id || 'new');
    }).catch(() => {});
  }, [planId, boardMatch]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const save = async () => {
    if (!plan || busy) return;
    setBusy(true);
    try {
      const file = await makeFile();
      let blockId = target;
      if (target === 'new') {
        const before = new Set(plan.blocks.map((b) => b.id));
        const next = await api.addBlock(plan.id, 'moodboard', { tab: 'concept' });
        blockId = next.blocks.find((b) => !before.has(b.id))?.id;
        await api.updateBlock(plan.id, blockId, { title: boardName });
      }
      await api.addBlockFiles(plan.id, blockId, [file]);
      onSaved(plan);
    } catch (e) { toast(`Could not save: ${e.message}`, 'error'); setBusy(false); }
  };

  const boards = (plan?.blocks || []).filter((b) => b.type === 'moodboard');
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth: 440 }}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} disabled={busy} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">
          {plans === null ? <div className="spinner" /> : !plans.length ? (
            <div className="hint">No plans yet — create one under Plans first.</div>
          ) : (
            <>
              <div className="field">
                <label>Plan</label>
                <select className="input" value={planId} onChange={(e) => setPlanId(e.target.value)}>
                  {plans.map((p) => <option key={p.id} value={p.id}>{p.avatarEmoji ? `${p.avatarEmoji} ` : ''}{p.name}{p.status === 'archived' ? ' (archived)' : ''}</option>)}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Moodboard</label>
                <select className="input" value={target} onChange={(e) => setTarget(e.target.value)} disabled={!plan}>
                  <option value="new">New moodboard “{boardName}”</option>
                  {boards.map((b) => <option key={b.id} value={b.id}>{b.title || 'Moodboard'}</option>)}
                </select>
              </div>
              {hint && <div className="hint" style={{ marginTop: 10 }}>{hint}</div>}
            </>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={!plan || busy}>{busy ? 'Saving…' : submitLabel}</button>
        </div>
      </div>
    </div>
  );
}
