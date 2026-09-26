// Storyboard vocabulary and helpers, shared by the editor, the plan preview,
// the Storyboards page and the print sheet.
import { SEGMENT_KINDS, segmentColor } from './segments.js';
import { tagColor } from './types.js';

export const ASPECTS = ['16:9', '9:16', '1:1', '4:5'];
export const ratioOf = (a) => { const [w, h] = String(a || '16:9').split(':').map(Number); return w / h || 16 / 9; };

const rid = () => Math.random().toString(36).slice(2, 8);
export const newShot = (p = {}) => ({
  id: rid(), image: null, duration: 2, visual: '', vo: '', onscreen: '', sfx: '', notes: '',
  size: '', camera: '', transition: '', section: '', status: '', ...p,
});

// Film language, as short labels. Values are stored as written, so anything
// saved outside these lists still shows.
export const SHOT_SIZES = ['Extreme wide', 'Wide', 'Full', 'Medium', 'Close-up', 'Extreme close-up', 'Detail', 'Top-down', 'Screen / UI', 'POV'];
export const CAMERA_MOVES = ['Static', 'Pan', 'Tilt', 'Push in', 'Pull out', 'Zoom in', 'Zoom out', 'Truck', 'Orbit', 'Crane', 'Handheld', 'Rack focus', 'Parallax'];
export const TRANSITIONS = ['Cut', 'Match cut', 'Smash cut', 'Whip pan', 'Morph', 'Mask reveal', 'Zoom through', 'Dissolve', 'Fade', 'Wipe', 'Glitch', 'Light leak'];

export const SHOT_STATUS = [
  { key: 'sketch', label: 'Sketch', color: 'gray' },
  { key: 'styleframe', label: 'Styleframe', color: 'blue' },
  { key: 'animated', label: 'Animated', color: 'purple' },
  { key: 'approved', label: 'Approved', color: 'green' },
];
export const shotStatus = (key) => SHOT_STATUS.find((s) => s.key === key) || null;
export const statusColor = (key) => tagColor(shotStatus(key)?.color || 'gray');

export { SEGMENT_KINDS, segmentColor };
export const sectionLabel = (key) => {
  const k = SEGMENT_KINDS.find((x) => x.key === key);
  return k ? (k.short || k.label) : '';
};

/** Start of every shot and the total length. */
export function timing(shots) {
  const starts = [];
  let total = 0;
  for (const s of shots || []) { starts.push(total); total += Number(s.duration) || 0; }
  return { starts, total };
}

/** Consecutive shots of the same section → [{ section, from, to, start, length }]. */
export function sectionRuns(shots) {
  const { starts } = timing(shots);
  const runs = [];
  (shots || []).forEach((s, i) => {
    const key = s.section || '';
    const last = runs[runs.length - 1];
    const d = Number(s.duration) || 0;
    if (last && last.section === key) { last.to = i; last.length += d; }
    else runs.push({ section: key, from: i, to: i, start: starts[i], length: d });
  });
  return runs;
}

/** { total, done: approved, counts: { sketch: n, … } } */
export function progress(shots) {
  const counts = {};
  for (const s of shots || []) if (s.status) counts[s.status] = (counts[s.status] || 0) + 1;
  return { total: (shots || []).length, done: counts.approved || 0, counts };
}

/** Every storyboard block across plans → [{ plan, block }] (plans newest first). */
export function allStoryboards(plans) {
  return (plans || []).flatMap((plan) => (plan.blocks || []).filter((b) => b.type === 'storyboard').map((block) => ({ plan, block })));
}

export const storyboardPath = (planId, blockId, shotId) => `/storyboards/${planId}/${blockId}${shotId ? `?shot=${shotId}` : ''}`;
