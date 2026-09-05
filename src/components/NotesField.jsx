import { useEffect, useRef, useState } from 'react';
import { StickyNote } from 'lucide-react';
import { api } from '../lib/api.js';
import { useToast } from './Toast.jsx';

/**
 * Notes for any project type. Debounced autosave to project.notes.
 * Shown with a larger type size for comfortable reading/writing.
 */
export default function NotesField({ project, setProject }) {
  const toast = useToast();
  const [notes, setNotes] = useState(project.notes || '');
  const [state, setState] = useState('idle');
  const skip = useRef(true);

  // Reset when switching to a different project.
  useEffect(() => { setNotes(project.notes || ''); skip.current = true; }, [project.id]);

  useEffect(() => {
    if (skip.current) { skip.current = false; return; }
    setState('saving');
    const t = setTimeout(async () => {
      try {
        const updated = await api.update(project.id, { notes });
        setProject(updated);
        setState('saved');
        setTimeout(() => setState('idle'), 1500);
      } catch {
        setState('idle');
        toast('Could not save notes', 'error');
      }
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

  return (
    <div className="section">
      <div className="section-head"><h2><StickyNote size={16} /> Notes</h2></div>
      <div className="notes-area">
        <textarea
          className="textarea notes-textarea"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ideas, feedback, references, what worked…"
        />
        <span className="notes-status">{state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : ''}</span>
      </div>
    </div>
  );
}
