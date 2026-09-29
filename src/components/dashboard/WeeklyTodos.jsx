import { useEffect, useRef } from 'react';
import { Repeat, Check, Plus, X, Settings2 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useSaver } from '../../lib/autosave.js';
import { useToast } from '../Toast.jsx';

const keyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const MONDAY = new Date(2024, 0, 1); // a Monday: weekday names in your language, Monday first
const dayName = (i, weekday = 'long') => new Date(MONDAY.getFullYear(), 0, 1 + i).toLocaleDateString(undefined, { weekday });
const newId = () => `w${Math.random().toString(36).slice(2, 9)}`;

/**
 * Weekly to-dos — apart from the board: something for a weekday that comes
 * back every week (every Sunday: Backup). Today's ones big, to tick off;
 * the week underneath (done, missed, still to come). Set them up with
 * Customize: one or more for each weekday.
 */
export default function WeeklyTodos({ settings, setSettings, editing, onCustomize }) {
  const toast = useToast();
  const saver = useSaver(600);
  const todos = settings?.weeklyTodos || [];
  const now = new Date();
  const todayIdx = (now.getDay() + 6) % 7; // 0 = Monday
  const today = keyOf(now);
  const dateOf = (i) => { const d = new Date(now); d.setDate(now.getDate() - todayIdx + i); return keyOf(d); };
  const fresh = useRef(null); // the one just added (gets the focus)

  // Typing waits a moment; a tick saves right away.
  const save = (next, typing = false) => {
    setSettings((s) => ({ ...s, weeklyTodos: next }));
    saver.schedule('weekly', () => api.updateSettings({ weeklyTodos: next }).catch((e) => toast(`Could not save: ${e.message}`, 'error')), { immediate: !typing });
  };
  const toggle = (t, date) => save(todos.map((x) => (x.id === t.id ? { ...x, doneOn: x.doneOn === date ? '' : date } : x)));
  const update = (id, text) => save(todos.map((x) => (x.id === id ? { ...x, text } : x)), true);
  const remove = (id) => save(todos.filter((x) => x.id !== id));
  const add = (day) => { const t = { id: newId(), day, text: '', doneOn: '' }; fresh.current = t.id; save([...todos, t]); };

  // Leaving Customize: empty rows go.
  const wasEditing = useRef(editing);
  useEffect(() => {
    if (wasEditing.current && !editing && todos.some((t) => !t.text.trim())) save(todos.filter((t) => t.text.trim()));
    wasEditing.current = editing;
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!settings) return null;

  if (editing) {
    return (
      <section className="dash-weekly editing">
        <div className="dash-card-kicker"><Repeat size={14} /> Weekly to-dos <em>— for each weekday, back every week</em></div>
        <div className="dash-weekly-edit">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className={`dash-weekly-edit-row ${i === todayIdx ? 'today' : ''}`}>
              <span className="dash-weekly-edit-day">{dayName(i)}</span>
              <div className="dash-weekly-edit-items">
                {todos.filter((t) => t.day === i).map((t) => (
                  <span key={t.id} className="dash-weekly-edit-item">
                    <input className="input" value={t.text} maxLength={200} placeholder="e.g. Backup" aria-label={`${dayName(i)}: to-do`}
                      autoFocus={fresh.current === t.id} onChange={(e) => update(t.id, e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(i); } }} />
                    <button type="button" className="icon-btn" onClick={() => remove(t.id)} aria-label="Remove" title="Remove"><X size={14} /></button>
                  </span>
                ))}
                <button type="button" className="btn btn-sm btn-ghost dash-weekly-add" onClick={() => add(i)}><Plus size={14} /> Add</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  const all = todos.filter((t) => t.text.trim());
  const todays = all.filter((t) => t.day === todayIdx);
  let next = null;
  for (let k = 1; k < 7 && !next; k += 1) {
    const d = (todayIdx + k) % 7;
    const on = all.filter((t) => t.day === d);
    if (on.length) next = { day: d, k, list: on };
  }
  const open = todays.filter((t) => t.doneOn !== today).length;

  return (
    <section className="dash-weekly">
      <div className="dash-card-kicker">
        <Repeat size={14} /> Weekly <span className="dash-weekly-today-name">{dayName(todayIdx)}</span>
        {todays.length > 0 && <span className="dash-weekly-count">{open ? `${open} open` : <><Check size={12} /> all done</>}</span>}
      </div>
      {!all.length ? (
        <div className="dash-weekly-empty">
          <p>Things for a weekday that come back every week — every Sunday: <b>Backup</b>, every Friday: <b>invoices</b>.</p>
          <button type="button" className="btn btn-sm" onClick={onCustomize}><Settings2 size={14} /> Set them up</button>
        </div>
      ) : (
        <>
          <div className="dash-weekly-list">
            {todays.length ? todays.map((t) => {
              const done = t.doneOn === today;
              return (
                <button key={t.id} type="button" className={`dash-weekly-big ${done ? 'done' : ''}`} onClick={() => toggle(t, today)} aria-pressed={done}>
                  <span className="dash-weekly-check">{done && <Check size={18} strokeWidth={3} />}</span>
                  <span className="dash-weekly-text">{t.text}</span>
                  <small>every {dayName(t.day)}</small>
                </button>
              );
            }) : (
              <div className="dash-weekly-none">
                Nothing weekly today.
                {next && <> Next {next.k === 1 ? 'tomorrow' : `on ${dayName(next.day)}`}: <b>{next.list.map((t) => t.text).join(', ')}</b></>}
              </div>
            )}
          </div>
          <div className="dash-weekly-week" aria-label="This week">
            {Array.from({ length: 7 }, (_, i) => {
              const date = dateOf(i);
              const items = all.filter((t) => t.day === i);
              return (
                <div key={i} className={`dash-weekly-col ${i === todayIdx ? 'today' : i < todayIdx ? 'past' : ''}`}>
                  <span className="dash-weekly-col-day">{dayName(i, 'short')}</span>
                  {items.map((t) => {
                    const done = t.doneOn === date;
                    const missed = !done && i < todayIdx;
                    return (
                      <button key={t.id} type="button" className={`dash-weekly-chip ${done ? 'done' : missed ? 'missed' : ''}`} disabled={i > todayIdx}
                        onClick={() => toggle(t, date)} title={done ? `${t.text} — done` : missed ? `${t.text} — not done (tick it now)` : t.text}>
                        {done ? <Check size={11} strokeWidth={3} /> : missed ? <i>!</i> : null}<span>{t.text}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
