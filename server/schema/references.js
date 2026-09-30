// References: motion segments, moments, waveform, business-card paper, logo renditions.
// Part of the record shapes (see ../schema.js, which re-exports all of it).
import { nanoid } from 'nanoid';
import { num, str } from './base.js';

// ---------------------------------------------------------------------------
// Motion segments — labeled sections of a video (Hook, Problem, Reveal …)
// ---------------------------------------------------------------------------
export const SEGMENT_KINDS = ['hook', 'problem', 'reveal', 'features', 'proof', 'cta', 'outro'];
// Segments written before section types existed only have a free-text label.
// A label that names a type is read as that type — an exact name moves into
// the type (the label would just repeat it), anything else stays as a note.
const SEGMENT_ALIASES = {
  hook: ['hook', 'opener', 'opening'],
  problem: ['problem', 'pain', 'pain point', 'challenge'],
  reveal: ['reveal', 'product reveal', 'solution', 'product', 'lösung', 'produkt'],
  features: ['features', 'feature', 'demo', 'product demo', 'showcase', 'benefits'],
  proof: ['social proof', 'proof', 'testimonial', 'testimonials', 'reviews', 'trust'],
  cta: ['cta', 'call to action', 'call-to-action'],
  outro: ['outro', 'logo outro', 'end card', 'endcard', 'end', 'abspann'],
};
export function inferSegmentKind(label) {
  const t = String(label || '').trim().toLowerCase();
  if (!t) return null;
  const base = t.replace(/[\s\d.:#()–-]+$/, '');
  for (const [kind, names] of Object.entries(SEGMENT_ALIASES)) {
    if (names.includes(t)) return { kind, exact: true };
    if (base && names.includes(base)) return { kind, exact: false };
  }
  return null;
}
// Moments: time markers on a motion video, tagged with a technique (Match
// cut, Speed ramp …), an optional note and a captured frame (markers/…).
export const normalizeMarker = (m) => ({
  id: m?.id ? str(m.id, 40) : nanoid(6),
  t: num(m?.t, 0, 86400, 0),
  label: str(m?.label, 60),
  note: str(m?.note, 4000),
  thumb: typeof m?.thumb === 'string' && m.thumb.startsWith('markers/') && !m.thumb.includes('..') ? str(m.thumb, 200) : null,
});
export const normalizeMarkers = (arr) => (Array.isArray(arr) ? arr : []).filter((m) => m && typeof m === 'object')
  .slice(0, 1000).map(normalizeMarker).sort((a, b) => a.t - b.t);
// Audio waveform of a motion video: peak levels (0–100) across its length.
// `none: true` records that the video has no (readable) audio, so it isn't re-read.
export const normalizeWaveform = (w) => {
  if (!w || typeof w !== 'object') return null;
  if (w.none) return { peaks: [], duration: 0, none: true };
  if (!Array.isArray(w.peaks) || !w.peaks.length) return null;
  return { peaks: w.peaks.slice(0, 4000).map((x) => Math.round(num(x, 0, 100, 0))), duration: num(w.duration, 0, 86400, 0) };
};
// A business card's paper in the 3D view: finish, thickness, edge colour, corners.
const PAPER = { finish: ['matte', 'silk', 'gloss'], thickness: ['std', 'thick', 'xthick'], edge: ['paper', 'black', 'gold', 'silver', 'design'], corners: ['square', 'round'] };
export const normalizeCardPaper = (p) => {
  if (!p || typeof p !== 'object') return null;
  return Object.fromEntries(Object.entries(PAPER).map(([k, ok]) => [k, ok.includes(p[k]) ? p[k] : ok[0]]));
};
export const videoDim = (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 && n <= 20000 ? n : null; };
export function normalizeSegments(arr) {
  const segs = (Array.isArray(arr) ? arr : []).filter((s) => s && typeof s === 'object').slice(0, 200).map((s) => {
    let kind = SEGMENT_KINDS.includes(s.kind) ? s.kind : '';
    let label = str(s.label, 80);
    if (!('kind' in s)) {
      const hit = inferSegmentKind(label);
      if (hit) { kind = hit.kind; if (hit.exact) label = ''; }
    }
    const start = Number(s.start);
    return { id: s.id ? str(s.id, 40) : nanoid(6), start: Number.isFinite(start) ? Math.max(0, start) : 0, kind, label };
  }).sort((a, b) => a.start - b.start);
  if (segs.length) segs[0].start = 0;
  return segs;
}
// ---------------------------------------------------------------------------
// Logos — older versions stored different shapes (see logoNeedsMigration).
// These mirror the frontend's display helpers in src/lib/types.js exactly, so
// a migrated logo looks the same as the unmigrated one did.
// ---------------------------------------------------------------------------
export const logoSource = (p) => p.image || p.logoDark || p.logoLight || p.assets?.[0]?.file || null;
export function logoRenditionList(p) {
  const raw = p.renditions;
  if (Array.isArray(raw) && raw.length && typeof raw[0] === 'object' && raw[0]) return raw;
  const bg = p.bg || '#FFFFFF';
  const list = (Array.isArray(raw) && raw.length ? raw.map((c) => ({ color: c, bg })) : [
    { color: '#111114', bg: '#FFFFFF' }, { color: '#FFFFFF', bg: '#111114' },
  ]);
  if (p.original !== false && !list.some((e) => e.color === 'original')) list.push({ color: 'original', bg });
  return list;
}
export function logoActive(p) {
  const list = logoRenditionList(p);
  const r = p.rendition;
  if (r && typeof r === 'object' && r.color) return r;
  if (typeof r === 'string') return list.find((e) => e.color === r) || list[0];
  return list[0] || { color: 'original', bg: '#FFFFFF' };
}
export const logoNeedsMigration = (p) => p.type === 'logo' && (
  !p.image
  || !(Array.isArray(p.renditions) && p.renditions.length && typeof p.renditions[0] === 'object' && p.renditions[0])
  || !(p.rendition && typeof p.rendition === 'object' && p.rendition.color)
);
