import { useEffect, useRef, useState } from 'react';
import { StickyNote } from 'lucide-react';
import { api } from '../lib/api.js';
import { useSaver } from '../lib/autosave.js';
import { useToast } from './Toast.jsx';

/**
 * Notes for any project type. Debounced autosave to project.notes — pending
 * text is still saved if you navigate away or close the tab right after typing.
 * Shown with a larger type size for comfortable reading/writing.
 */
export default function NotesField({ project, setProject, label = 'Notes', placeholder = 'Ideas, feedback, references, what worked…' }) {
  const toast = useToast();
  const saver = useSaver(700);
  const [notes, setNotes] = useState(project.notes || '');
  const [state, setState] = useState('idle');
  const idleTimer = useRef(null);
  const currentId = useRef(project.id);
  currentId.current = project.id;

  // Switching to a different project: save the previous one's pending text
  // first, then show the new project's notes.
  useEffect(() => {
    saver.flush();
    setNotes(project.notes || '');
    setState('idle');
  }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // A newer copy of this project arrived (e.g. reloaded after coming back to
  // the tab) — show its notes unless you're mid-edit.
  useEffect(() => {
    if (saver.idle()) setNotes(project.notes || '');
  }, [project.notes]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => clearTimeout(idleTimer.current), []);

  const onChange = (value) => {
    setNotes(value);
    setState('saving');
    const projectId = project.id;
    saver.schedule('notes', async () => {
      try {
        const updated = await api.update(projectId, { notes: value });
        if (currentId.current === projectId) setProject(updated); // still on this project
        setState('saved');
        clearTimeout(idleTimer.current);
        idleTimer.current = setTimeout(() => setState('idle'), 1500);
      } catch {
        setState('idle');
        toast('Could not save notes', 'error');
      }
    });
  };

  return (
    <div className="section">
      <div className="section-head"><h2><StickyNote size={16} /> {label}</h2></div>
      <div className="notes-area">
        <textarea
          className="textarea notes-textarea"
          value={notes}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
        <span className="notes-status">{state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : ''}</span>
      </div>
    </div>
  );
}
