// The dashboard's widgets: which there are, their first order and size, and
// how your saved layout and new widgets fit together.

// The widgets below the hero, in their first order and size (yours is saved in settings).
export const WIDGETS = [
  { id: 'focus', label: 'Today’s focus', size: 'half' },
  { id: 'weekly', label: 'Weekly to-dos', size: 'half' },
  { id: 'timer', label: 'Focus timer', size: 'half' },
  { id: 'next', label: 'Next up & two weeks', size: 'full' },
  { id: 'continue', label: 'Continue where you left off', size: 'full' },
  { id: 'urgent', label: 'Urgent', size: 'full' },
  { id: 'tools', label: 'Your tools', size: 'full' },
  { id: 'pipeline', label: 'Pipeline', size: 'full' },
  { id: 'money', label: 'Money this month', size: 'full' },
  { id: 'rhythm', label: 'Your rhythm', size: 'full' },
  { id: 'inspiration', label: 'Inspiration', size: 'half' },
  { id: 'note', label: 'Quick note', size: 'half' },
  { id: 'achievements', label: 'Achievements', size: 'full' },
];
export const WIDGET = Object.fromEntries(WIDGETS.map((w) => [w.id, w]));
// Your saved order; a widget added since then joins right after the one it
// follows by default among those you show (Weekly to-dos next to Today's
// focus) — not behind one you've hidden, which could be at the very end —
// else before the next one you show, else first.
export function layoutOf(saved) {
  const list = (Array.isArray(saved) ? saved : []).filter((w) => WIDGET[w.id]);
  const shown = (id) => list.some((x) => x.id === id && !x.hidden);
  WIDGETS.forEach((w, i) => {
    if (list.some((x) => x.id === w.id)) return;
    const before = WIDGETS.slice(0, i).reverse().find((p) => shown(p.id));
    const after = !before && WIDGETS.slice(i + 1).find((p) => shown(p.id));
    const at = before ? list.findIndex((x) => x.id === before.id) + 1 : after ? list.findIndex((x) => x.id === after.id) : 0;
    list.splice(at, 0, { id: w.id, hidden: false, size: w.size });
  });
  return list;
}
// Half-width widgets sit side by side in pairs, in your order; one without a
// half-width neighbour to pair with takes the full row instead of leaving a gap.
export function lonelyHalves(ids, sizeOf) {
  const lone = new Set();
  let open = null;
  for (const id of ids) {
    if (sizeOf(id) !== 'half') { if (open) lone.add(open); open = null; } else if (open) open = null; else open = id;
  }
  if (open) lone.add(open);
  return lone;
}
