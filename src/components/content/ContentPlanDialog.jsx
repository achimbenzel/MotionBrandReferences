import { useEffect, useRef, useState } from 'react';
import { X, Plus, Minus, Layers, CalendarClock, Trash2 } from 'lucide-react';
import { TAG_COLORS, tagColor } from '../../lib/types.js';
import { useSaver } from '../../lib/autosave.js';
import { PILLAR_IDEAS, WEEKDAY_LONG, goalOf } from '../../lib/content.js';
import { useToast } from '../Toast.jsx';
import Menu from '../Menu.jsx';
import useContentSettings from './useContentSettings.js';

const rid = (p) => `${p}${Math.random().toString(36).slice(2, 9)}`;
const NEXT_COLOR = ['purple', 'blue', 'pink', 'orange', 'green', 'yellow', 'red', 'gray'];

/**
 * Your content pillars (the themes you post about, each with a colour) and
 * your rhythm: how many posts a week, and fixed slots (a weekday, a time,
 * maybe a pillar) that the calendar and the feed keep free for you.
 */
export default function ContentPlanDialog({ items = [], onClose }) {
  const toast = useToast();
  const saver = useSaver(500);
  const [settings, update] = useContentSettings();
  const [pillars, setPillars] = useState(settings.contentPillars);
  const [rhythm, setRhythm] = useState(settings.contentRhythm);
  const fresh = useRef(null);
  useEffect(() => () => { saver.flush(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const savePillars = (next, typing = false) => {
    setPillars(next);
    saver.schedule('pillars', () => update({ contentPillars: next }).catch((e) => toast(`Could not save: ${e.message}`, 'error')), { immediate: !typing });
  };
  const saveRhythm = (next) => {
    setRhythm(next);
    saver.schedule('rhythm', () => update({ contentRhythm: next }).catch((e) => toast(`Could not save: ${e.message}`, 'error')), { immediate: true });
  };
  const addPillar = (name = '') => {
    const used = new Set(pillars.map((p) => p.color));
    const p = { id: rid('p'), name, color: NEXT_COLOR.find((c) => !used.has(c)) || 'blue' };
    if (!name) fresh.current = p.id;
    savePillars([...pillars, p]);
  };
  const removePillar = (p) => {
    const before = pillars;
    savePillars(pillars.filter((x) => x.id !== p.id));
    const n = items.filter((c) => c.pillar === p.id).length;
    toast(`“${p.name || 'Pillar'}” removed${n ? ` — its ${n} post${n === 1 ? ' keeps' : 's keep'} it, should you bring it back` : ''}`, 'ok', { label: 'Undo', onClick: () => savePillars(before) });
  };
  const setSlot = (id, f) => saveRhythm({ ...rhythm, slots: rhythm.slots.map((s) => (s.id === id ? { ...s, ...f } : s)) });
  const addSlot = () => {
    const last = rhythm.slots[rhythm.slots.length - 1];
    const slot = { id: rid('s'), day: last ? (last.day + 2) % 7 : 1, time: last?.time || '18:00', pillar: null };
    const slots = [...rhythm.slots, slot];
    saveRhythm({ ...rhythm, slots, goal: Math.max(rhythm.goal, slots.length) });
  };
  const removeSlot = (id) => saveRhythm({ ...rhythm, slots: rhythm.slots.filter((s) => s.id !== id) });
  const setGoal = (g) => saveRhythm({ ...rhythm, goal: Math.max(0, Math.min(21, g)) });
  const ideas = PILLAR_IDEAS.filter((n) => !pillars.some((p) => p.name.trim().toLowerCase() === n.toLowerCase()));
  const goal = goalOf(rhythm);

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal ctx-plan" role="dialog" aria-modal="true" aria-label="Rhythm and pillars">
        <div className="modal-head">
          <h2><CalendarClock size={18} /> Rhythm &amp; pillars</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <section className="ctx-part">
            <div className="ctx-part-head"><Layers size={15} /> <b>Pillars</b> <em>— the themes you post about; give each post one to keep the mix</em></div>
            <div className="ctx-pillars">
              {pillars.map((p) => {
                const col = tagColor(p.color);
                const n = items.filter((c) => c.pillar === p.id).length;
                return (
                  <div key={p.id} className="ctx-pillar" style={{ '--pc': col.fg }}>
                    <Menu title="Colour" trigger={<button type="button" className="ctx-dot" aria-label="Colour" title="Colour" />}
                      items={TAG_COLORS.map((t) => ({ label: t.key[0].toUpperCase() + t.key.slice(1), checked: p.color === t.key, icon: <span className="status-dot" style={{ background: t.fg }} />, onClick: () => savePillars(pillars.map((x) => (x.id === p.id ? { ...x, color: t.key } : x))) }))} />
                    <input className="input" value={p.name} maxLength={40} placeholder="e.g. Breakdowns" autoFocus={fresh.current === p.id} aria-label="Pillar name"
                      onChange={(e) => savePillars(pillars.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)), true)} />
                    <span className="ctx-count">{n ? `${n} post${n === 1 ? '' : 's'}` : ''}</span>
                    <button type="button" className="icon-btn" onClick={() => removePillar(p)} aria-label="Remove" title="Remove"><Trash2 size={14} /></button>
                  </div>
                );
              })}
            </div>
            <div className="ctx-add">
              <button type="button" className="btn btn-sm" onClick={() => addPillar()} disabled={pillars.length >= 12}><Plus size={14} /> Pillar</button>
              {pillars.length < 12 && ideas.slice(0, 6).map((n) => <button key={n} type="button" className="chip" onClick={() => addPillar(n)}>+ {n}</button>)}
            </div>
          </section>

          <section className="ctx-part">
            <div className="ctx-part-head"><CalendarClock size={15} /> <b>Rhythm</b> <em>— free slots show in the calendar and as “Next post” in the feed</em></div>
            <div className="ctx-goal">
              <span>Posts a week</span>
              <div className="ctx-stepper">
                <button type="button" className="icon-btn" onClick={() => setGoal((rhythm.goal || goal) - 1)} disabled={!goal} aria-label="Fewer"><Minus size={14} /></button>
                <b>{goal || '—'}</b>
                <button type="button" className="icon-btn" onClick={() => setGoal((rhythm.goal || goal) + 1)} disabled={goal >= 21} aria-label="More"><Plus size={14} /></button>
              </div>
              <em>{goal ? `${goal} a week${rhythm.slots.length ? ` · ${rhythm.slots.length} on fixed days` : ''}` : 'No goal'}</em>
            </div>
            <div className="ctx-slots">
              {rhythm.slots.map((s) => (
                <div key={s.id} className="ctx-slot">
                  <select className="input" value={s.day} onChange={(e) => setSlot(s.id, { day: Number(e.target.value) })} aria-label="Weekday">
                    {WEEKDAY_LONG.map((w, i) => <option key={i} value={i}>{w}</option>)}
                  </select>
                  <input className="input" type="time" value={s.time} onChange={(e) => setSlot(s.id, { time: e.target.value })} aria-label="Time" />
                  <select className="input" value={s.pillar || ''} onChange={(e) => setSlot(s.id, { pillar: e.target.value || null })} aria-label="Pillar">
                    <option value="">Any pillar</option>
                    {pillars.map((p) => <option key={p.id} value={p.id}>{p.name || 'Untitled pillar'}</option>)}
                  </select>
                  <button type="button" className="icon-btn" onClick={() => removeSlot(s.id)} aria-label="Remove slot" title="Remove"><X size={14} /></button>
                </div>
              ))}
            </div>
            <div className="ctx-add">
              <button type="button" className="btn btn-sm" onClick={addSlot} disabled={rhythm.slots.length >= 21}><Plus size={14} /> Fixed slot</button>
              {!rhythm.slots.length && <span className="hint">e.g. Tuesday 18:00 · Breakdowns, Friday 12:00 · Behind the scenes</span>}
            </div>
          </section>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
