import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crosshair, Plus, X, Check, Search, ListTodo, PencilRuler, CornerDownLeft } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useToast } from '../Toast.jsx';
import { dayKey } from '../../lib/dates.js';

const MAX = 5;
const DONE_LIST = /^(done|erledigt|fertig|finished|complete(d)?)$/i;
const undated = ({ doneOn: _done, ...rest }) => rest;
const keyOf = (it) => (it.kind === 'card' ? `card:${it.id}` : `todo:${it.planId}:${it.blockId}:${it.itemId}`);

/**
 * Today's focus: up to five to-dos — board cards or a plan's to-dos — pinned
 * for the day and ticked off right here (a board card moves to your "Done"
 * list, a plan to-do gets its tick). Ticked ones stay struck through until the
 * next day. Type something new and it becomes a card on the board.
 */
export default function FocusToday({ board, setBoard, plans, setPlans, settings, setSettings }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');
  const pickRef = useRef(null);
  const items = useMemo(() => settings?.dashboardFocus?.items || [], [settings]);
  const cols = useMemo(() => board?.columns || [], [board]);
  const doneCol = cols.find((c) => DONE_LIST.test(c.name.trim())) || cols[cols.length - 1];

  // Each pinned to-do as it stands now (or null when it's gone).
  const resolve = (it) => {
    if (it.kind === 'card') {
      const col = cols.find((c) => c.cards.some((k) => k.id === it.id));
      const card = col?.cards.find((k) => k.id === it.id);
      if (!card) return null;
      const plan = (plans || []).find((p) => p.id === card.planId);
      return { it, title: card.title || 'Untitled card', done: DONE_LIST.test(col.name.trim()), where: [col.name || 'Board', plan?.name].filter(Boolean).join(' · '), href: card.planId ? `/board?plan=${card.planId}` : '/board', board: true };
    }
    const plan = (plans || []).find((p) => p.id === it.planId);
    const block = plan?.blocks?.find((b) => b.id === it.blockId);
    const todo = block?.items?.find((x) => x.id === it.itemId);
    if (!todo) return null;
    return { it, title: todo.text || 'To-do', done: !!todo.done, where: plan.name || 'Project', href: `/plan/${plan.id}?block=${block.id}`, board: false };
  };
  const rows = items.map(resolve);
  const ready = !!board && !!plans;

  const save = (next) => {
    setSettings((s) => ({ ...s, dashboardFocus: { items: next } }));
    api.updateSettings({ dashboardFocus: { items: next } }).then(setSettings).catch((e) => toast(`Could not save: ${e.message}`, 'error'));
  };
  // Tidy up once everything is loaded: gone ones out, yesterday's ticked ones out, today's ticks dated.
  useEffect(() => {
    if (!ready || !items.length) return;
    const today = dayKey();
    const next = [];
    items.forEach((it, i) => {
      const r = rows[i];
      if (!r) return;
      if (r.done && it.doneOn && it.doneOn < today) return;
      next.push(r.done && !it.doneOn ? { ...it, doneOn: today } : !r.done && it.doneOn ? undated(it) : it);
    });
    if (JSON.stringify(next) !== JSON.stringify(items)) save(next);
  }, [ready, board, plans]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (r) => {
    const done = !r.done;
    try {
      if (r.board) {
        const to = done ? doneCol : cols.find((c) => !DONE_LIST.test(c.name.trim())) || cols[0];
        if (to) setBoard(await api.updateBoardCard(r.it.id, { columnId: to.id }));
      } else {
        const plan = await api.setTodoDone(r.it.planId, r.it.blockId, r.it.itemId, done);
        setPlans((ps) => ps.map((p) => (p.id === plan.id ? plan : p)));
      }
      save(items.map((it) => (keyOf(it) === keyOf(r.it) ? (done ? { ...it, doneOn: dayKey() } : undated(it)) : it)));
    } catch (e) { toast(`Could not update it: ${e.message}`, 'error'); }
  };
  const unpin = (r) => save(items.filter((it) => keyOf(it) !== keyOf(r.it)));

  // Everything that could be pinned: open board cards and open plan to-dos.
  const candidates = useMemo(() => {
    const pinned = new Set(items.map(keyOf));
    const list = [];
    for (const c of cols) {
      if (DONE_LIST.test(c.name.trim())) continue;
      for (const k of c.cards) {
        const it = { kind: 'card', id: k.id };
        if (!pinned.has(keyOf(it))) list.push({ it, title: k.title || 'Untitled card', where: c.name || 'Board', board: true });
      }
    }
    for (const p of plans || []) {
      if (p.status === 'archived') continue;
      for (const b of p.blocks || []) {
        if (b.type !== 'todos') continue;
        for (const t of b.items || []) {
          const it = { kind: 'todo', planId: p.id, blockId: b.id, itemId: t.id };
          if (!t.done && String(t.text || '').trim() && !pinned.has(keyOf(it))) list.push({ it, title: t.text, where: p.name || 'Project', board: false, urgent: !!t.urgent });
        }
      }
    }
    const s = q.trim().toLowerCase();
    return (s ? list.filter((x) => `${x.title} ${x.where}`.toLowerCase().includes(s)) : list).slice(0, 40);
  }, [cols, plans, items, q]);

  const pin = (it) => { if (items.length < MAX) save([...items, it]); setQ(''); if (items.length + 1 >= MAX) setPicking(false); };
  const createAndPin = async () => {
    const title = q.trim();
    if (!title) return;
    try {
      const before = new Set(cols.flatMap((c) => c.cards.map((k) => k.id)));
      const b = await api.addBoardCard({ title });
      setBoard(b);
      const card = b.columns.flatMap((c) => c.cards).find((k) => !before.has(k.id));
      if (card) pin({ kind: 'card', id: card.id });
    } catch (e) { toast(`Could not add it: ${e.message}`, 'error'); }
  };

  useEffect(() => {
    if (!picking) return undefined;
    const onDoc = (e) => { if (!pickRef.current?.contains(e.target)) setPicking(false); };
    const onKey = (e) => { if (e.key === 'Escape') setPicking(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [picking]);

  const shown = rows.filter(Boolean);
  const doneN = shown.filter((r) => r.done).length;
  const p = shown.length ? doneN / shown.length : 0;
  const all = shown.length > 0 && doneN === shown.length;

  return (
    <section className={`dash-today ${all ? 'all-done' : ''}`}>
      <div className="dash-card-kicker">
        <Crosshair size={14} /> Today’s focus
        {shown.length > 0 && <span className="dash-today-count">{doneN}/{shown.length}</span>}
      </div>
      <div className="dash-today-body">
        <span className="dash-today-ring" style={{ '--p': p }} aria-hidden="true">{all ? <Check size={18} /> : <b>{shown.length - doneN}</b>}</span>
        <div className="dash-today-list">
          {!shown.length && <p className="dash-today-empty">What matters today? Pin up to five to-dos from the board or your projects — or write a new one.</p>}
          {shown.map((r) => (
            <div key={keyOf(r.it)} className={`dash-today-row ${r.done ? 'done' : ''}`}>
              <button type="button" className="dash-today-check" onClick={() => toggle(r)} aria-pressed={r.done} aria-label={r.done ? `Mark “${r.title}” as open` : `Tick “${r.title}”`}>
                {r.done && <Check size={13} />}
              </button>
              <button type="button" className="dash-today-text" onClick={() => navigate(r.href)} title="Open">
                <span className="dash-today-title">{r.title}</span>
                <span className="dash-today-where">{r.board ? <ListTodo size={11} /> : <PencilRuler size={11} />} {r.where}</span>
              </button>
              <button type="button" className="icon-btn dash-today-x" onClick={() => unpin(r)} aria-label={`Unpin “${r.title}”`}><X size={13} /></button>
            </div>
          ))}
          {items.length < MAX && (
            <div className="dash-today-add" ref={pickRef}>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPicking((v) => !v)}><Plus size={14} /> Add to today</button>
              {picking && (
                <div className="dash-today-pick" role="dialog" aria-label="Pin a to-do">
                  <label className="dash-today-search">
                    <Search size={14} />
                    <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a to-do or write a new one…"
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createAndPin(); } }} />
                  </label>
                  <div className="dash-today-cands">
                    {q.trim() && (
                      <button type="button" className="dash-today-cand new" onClick={createAndPin}>
                        <Plus size={13} /> <span>New card “{q.trim()}”</span> <CornerDownLeft size={12} className="dash-today-enter" />
                      </button>
                    )}
                    {candidates.map((c) => (
                      <button key={keyOf(c.it)} type="button" className="dash-today-cand" onClick={() => pin(c.it)}>
                        {c.board ? <ListTodo size={13} /> : <PencilRuler size={13} />}
                        <span className="dash-today-cand-title">{c.title}</span>
                        <span className="dash-today-cand-where">{c.where}</span>
                      </button>
                    ))}
                    {!candidates.length && !q.trim() && <p className="dash-today-none">No open to-dos yet — type one above.</p>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
