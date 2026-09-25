import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListTodo, ArrowRight, ChevronDown, AlertTriangle, Unlink, Plus } from 'lucide-react';
import { api } from '../../lib/api.js';
import Menu from '../Menu.jsx';

const DONE = /\b(done|erledigt|fertig|complete[d]?|finished|delivered|geliefert)\b/i;

/**
 * The To-Do board's cards that belong to this plan, each with the list it
 * sits in (tap the list to move the card). Cards added here
 * land on the board too, linked to the plan. Every change is one card at a
 * time, so nothing else on the board is touched.
 */
export default function PlanTodos({ planId, toast }) {
  const navigate = useNavigate();
  const [board, setBoard] = useState(null);
  const [draft, setDraft] = useState('');
  const [titles, setTitles] = useState({}); // card id → title being typed
  const pending = useRef({}); // card id → { timer, title } not sent yet

  useEffect(() => {
    let alive = true;
    api.getBoard().then((b) => { if (alive) setBoard(b); }).catch(() => { if (alive) setBoard({ columns: [] }); });
    const refresh = () => { if (document.visibilityState === 'visible') api.getBoard().then((b) => { if (alive) setBoard(b); }).catch(() => {}); };
    document.addEventListener('visibilitychange', refresh);
    const waiting = pending.current;
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', refresh);
      // Leaving the page: send titles still waiting for their debounce.
      for (const [id, p] of Object.entries(waiting)) { clearTimeout(p.timer); api.updateBoardCard(id, { title: p.title }).catch(() => {}); }
      for (const id of Object.keys(waiting)) delete waiting[id];
    };
  }, [planId]);

  if (!board) return null;
  const columns = board.columns || [];
  const cards = columns.flatMap((c, ci) => c.cards.filter((k) => k.planId === planId).map((k) => ({ ...k, col: c, ci })));
  const isDone = (c) => DONE.test(c.name || ''); // a list called Done / Erledigt / Fertig …
  const open = cards.filter((k) => !isDone(k.col)).length;

  const run = async (fn, msg) => { try { setBoard(await fn()); if (msg) toast(msg); } catch (e) { toast(`Could not save: ${e.message}`, 'error'); } };
  const add = async () => {
    const title = draft.trim();
    if (!title) return;
    setDraft('');
    await run(() => api.addBoardCard({ title, planId }));
  };
  // Titles save shortly after typing stops; the response isn't applied (it
  // could predate a later keystroke) — the local text stays the source.
  const editTitle = (id, title) => {
    setTitles((t) => ({ ...t, [id]: title }));
    clearTimeout(pending.current[id]?.timer);
    pending.current[id] = {
      title,
      timer: setTimeout(() => {
        delete pending.current[id];
        api.updateBoardCard(id, { title }).catch((e) => toast(`Could not save: ${e.message}`, 'error'));
      }, 500),
    };
  };

  return (
    <div className="section plan-todos">
      <div className="section-head">
        <h2><ListTodo size={16} /> To-dos on the board {cards.length > 0 && <span className="count">{open} open</span>}</h2>
        <button className="btn btn-sm btn-ghost" onClick={() => navigate(`/board?plan=${planId}`)}>Open board <ArrowRight size={14} /></button>
      </div>
      {cards.length > 0 && (
        <div className="pt-list">
          {cards.map((k) => {
            const done = isDone(k.col);
            return (
              <div key={k.id} className={`pt-row ${done ? 'done' : ''} ${k.urgent ? 'urgent' : ''}`}>
                <Menu align="left" title="Move to list"
                  trigger={<button className={`pt-col ${done ? 'done' : ''}`} title="Move to another list">{k.col.name || 'Untitled'} <ChevronDown size={12} /></button>}
                  items={columns.map((c) => ({ label: c.name || 'Untitled', icon: c.id === k.col.id ? <span className="status-dot" style={{ background: 'var(--accent)' }} /> : <span className="status-dot" style={{ background: 'var(--text-faint)' }} />, onClick: () => { if (c.id !== k.col.id) run(() => api.updateBoardCard(k.id, { columnId: c.id }), `Moved to “${c.name || 'Untitled'}”`); } }))} />
                <input className="pt-title" value={titles[k.id] ?? k.title} placeholder="Untitled to-do" aria-label="To-do"
                  onChange={(e) => editTitle(k.id, e.target.value)} />
                <button className={`icon-btn pt-urgent ${k.urgent ? 'on' : ''}`} title={k.urgent ? 'Unmark urgent' : 'Mark urgent'}
                  onClick={() => run(() => api.updateBoardCard(k.id, { urgent: !k.urgent }))}><AlertTriangle size={14} /></button>
                <button className="icon-btn pt-unlink" title="Unlink from this plan (stays on the board)"
                  onClick={() => run(() => api.updateBoardCard(k.id, { planId: null }), 'Unlinked — the card stays on the board')}><Unlink size={14} /></button>
              </div>
            );
          })}
        </div>
      )}
      <form className="pt-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <Plus size={15} />
        <input className="input" value={draft} onChange={(e) => setDraft(e.target.value)}
          placeholder={`Add a to-do — it goes to “${columns[0]?.name || 'the board'}”, linked to this plan`} aria-label="New to-do" />
        {draft.trim() && <button className="btn btn-sm btn-primary">Add</button>}
      </form>
    </div>
  );
}
