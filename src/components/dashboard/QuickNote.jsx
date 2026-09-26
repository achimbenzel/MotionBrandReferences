import { useEffect, useRef, useState } from 'react';
import { StickyNote, Check } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useSaver } from '../../lib/autosave.js';

/**
 * A scratchpad on the dashboard: ideas, a call to make, today's focus.
 * Saved as you type (in the app's settings).
 */
export default function QuickNote({ initial = '' }) {
  const saver = useSaver(700);
  const [text, setText] = useState(initial);
  const [state, setState] = useState('saved'); // saved | typing | error
  const ref = useRef(null);
  const typed = useRef(false);
  useEffect(() => { if (!typed.current) setText(initial); }, [initial]);

  const change = (v) => {
    typed.current = true;
    setText(v);
    setState('typing');
    saver.schedule('dashboard-note', () => api.updateSettings({ dashboardNote: v })
      .then(() => setState('saved')).catch(() => setState('error')));
  };
  const lines = text.split('\n').length;
  return (
    <section className="dash-note">
      <div className="dash-card-kicker">
        <StickyNote size={14} /> Quick note
        <span className={`dash-note-state ${state}`}>{state === 'typing' ? 'Saving…' : state === 'error' ? 'Not saved' : text ? <><Check size={12} /> Saved</> : ''}</span>
      </div>
      <textarea ref={ref} className="dash-note-text" value={text} onChange={(e) => change(e.target.value)} rows={Math.min(12, Math.max(6, lines + 1))}
        placeholder={'Today’s focus, a call to make, an idea for later…'} aria-label="Quick note" spellCheck />
    </section>
  );
}
