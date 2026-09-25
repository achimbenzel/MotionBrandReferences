// Section types for a motion video's timeline — the typical structure of a
// launch video. The number is the keyboard shortcut in the player.
import { tagColor } from './types.js';

export const SEGMENT_KINDS = [
  { key: 'hook', label: 'Hook', color: 'red' },
  { key: 'problem', label: 'Problem', color: 'orange' },
  { key: 'reveal', label: 'Product reveal', short: 'Reveal', color: 'yellow' },
  { key: 'features', label: 'Features', color: 'green' },
  { key: 'proof', label: 'Social proof', short: 'Proof', color: 'blue' },
  { key: 'cta', label: 'Call to action', short: 'CTA', color: 'purple' },
  { key: 'outro', label: 'Logo outro', short: 'Outro', color: 'pink' },
];

export const segmentKind = (key) => SEGMENT_KINDS.find((k) => k.key === key) || null;

/** { bg, fg } chip colours for a section type (grey when it has none). */
export const segmentColor = (key) => tagColor(segmentKind(key)?.color || 'gray');

/** What a section is called: its type, else its own label, else "Section n". */
export function segmentName(seg, index) {
  const k = segmentKind(seg.kind);
  if (k) return k.label;
  return seg.label?.trim() || `Section ${index + 1}`;
}
