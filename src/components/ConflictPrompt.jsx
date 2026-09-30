import { useEffect, useRef, useState } from 'react';
import { MonitorSmartphone } from 'lucide-react';
import { setConflictHandler } from '../lib/api.js';
import ConfirmDialog from './ConfirmDialog.jsx';

// What was changed, in words: the first two parts of its key ('plans/abc').
const groupOf = (key) => String(key || '').split('/').slice(0, 2).join('/');
const THING = {
  plans: 'project', notes: 'note', software: 'software page', content: 'post', board: 'To-Do board', mockups: 'mockup',
  clients: 'client', settings: 'setting', expenses: 'expense', income: 'income', projects: 'reference', galleries: 'gallery',
  time: 'time entry', achievements: 'achievement',
};

/**
 * An edit that clashes with a change made meanwhile on another device (or in
 * another tab): keep yours — it overwrites theirs — or load theirs. Asked once
 * per thing, however many saves clash at that moment; the page shows their
 * version after "Load theirs". Mounted once.
 */
export default function ConflictPrompt() {
  const [queue, setQueue] = useState([]); // groups waiting for an answer
  const waiting = useRef(new Map());      // group → [resolve]
  const recent = useRef(new Map());       // group → { choice, until }: the same answer for the rest of that burst

  useEffect(() => setConflictHandler(({ key }) => new Promise((resolve) => {
    const group = groupOf(key);
    const r = recent.current.get(group);
    if (r && r.until > Date.now()) { resolve(r.choice); return; }
    if (waiting.current.has(group)) { waiting.current.get(group).push(resolve); return; }
    waiting.current.set(group, [resolve]);
    setQueue((q) => [...q, group]);
  })), []);

  const group = queue[0];
  if (!group) return null;
  let decided = false;
  const decide = (choice) => {
    if (decided) return;
    decided = true;
    recent.current.set(group, { choice, until: Date.now() + 4000 });
    for (const resolve of waiting.current.get(group) || []) resolve(choice);
    waiting.current.delete(group);
    setQueue((q) => q.slice(1));
    if (choice === 'theirs') {
      // The page shows their version (useRefreshOnReturn); a page that can't reload just this, reloads as a whole.
      const detail = { key: group, handled: false };
      window.dispatchEvent(new CustomEvent('confinium:theirs', { detail }));
      if (!detail.handled) setTimeout(() => window.location.reload(), 300);
    }
  };
  const thing = THING[group.split('/')[0]] || 'item';
  return (
    <ConfirmDialog
      key={group}
      icon={<MonitorSmartphone size={18} />}
      title="Changed on another device"
      message={`This ${thing} was changed on another device (or in another tab) while you were editing it here. Keep your change — it replaces theirs — or load their version instead of your last change?`}
      confirmLabel="Keep mine"
      cancelLabel="Load theirs"
      onConfirm={() => decide('mine')}
      onClose={() => decide('theirs')}
    />
  );
}
