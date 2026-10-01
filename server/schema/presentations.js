// Presentations (Work mode) — decks in the style of a project proposal: a
// look (theme, accent), who it's from (logo, contact) and for, and slides of
// set kinds (see src/lib/slides.js, which both the app and this file use).
// Pictures live in data/presentation/<id>/images/.
// Part of the record shapes (see ../schema.js, which re-exports all of it).
import { nanoid } from 'nanoid';
import { ID, isDay, num, str } from './base.js';
import { SLIDE_TYPES, THEMES, DEFAULT_ACCENT, DECK_KINDS } from '../../src/lib/slides.js';

const HEX = /^#[0-9a-f]{6}$/i;
const IMAGE_FILE = /^images\/[\w.\- ()]{1,160}$/;
export const hexOr = (v, fallback) => (typeof v === 'string' && HEX.test(v.trim()) ? v.trim().toLowerCase() : fallback);
/** A picture in the deck's folder → { file, fit, x, y } (where its centre sits, in %), or null. */
export function normalizeDeckImage(v) {
  const file = typeof v === 'string' ? v : v?.file;
  if (typeof file !== 'string' || !IMAGE_FILE.test(file)) return null;
  return { file, fit: v?.fit === 'contain' ? 'contain' : 'cover', x: Math.round(num(v?.x, 0, 100, 50)), y: Math.round(num(v?.y, 0, 100, 50)) };
}
const LIMITS = { text: 300, textarea: 4000 };

function cleanField(fd, v) {
  switch (fd.kind) {
    case 'text': case 'textarea': return str(v, fd.max || LIMITS[fd.kind]);
    case 'toggle': return !!v;
    case 'select': return fd.options.some((o) => o.key === v) ? v : fd.options[0].key;
    case 'color': return hexOr(v, DEFAULT_ACCENT);
    case 'image': return normalizeDeckImage(v);
    case 'list': return (Array.isArray(v) ? v : []).slice(0, fd.max || 12)
      .map((it) => ({ id: typeof it?.id === 'string' && ID.test(it.id) ? it.id : nanoid(6), ...cleanFields(fd.of, it) }));
    case 'table': {
      const columns = (Array.isArray(v?.columns) ? v.columns : []).slice(0, 6).map((c) => str(c, 60));
      if (!columns.length) columns.push('');
      const rows = (Array.isArray(v?.rows) ? v.rows : []).slice(0, 24)
        .map((r) => columns.map((_, i) => str(Array.isArray(r) ? r[i] : '', 140)));
      return { columns, rows, highlight: Math.round(num(v?.highlight, 0, columns.length - 1, 0)) };
    }
    default: return null;
  }
}
function cleanFields(fields, data) {
  return Object.fromEntries(fields.map((fd) => [fd.key, cleanField(fd, data?.[fd.key])]));
}

/** A slide: its kind, whether it's hidden (left out when presenting), the label in its footer, and what it holds. */
export function normalizeSlide(s) {
  const t = SLIDE_TYPES[s?.type];
  if (!t) return null;
  return {
    id: typeof s.id === 'string' && ID.test(s.id) ? s.id : nanoid(8),
    type: s.type,
    hidden: !!s.hidden,
    section: str(s.section, 60),
    data: cleanFields(t.fields, s.data),
  };
}
export const normalizeDeckTheme = (t) => ({ preset: THEMES[t?.preset] ? t.preset : 'dark', accent: hexOr(t?.accent, DEFAULT_ACCENT) });
/** Who it's from: a name, a logo (wordmark) and a mark (the small sign in each slide's corner), contact lines. */
export const normalizeDeckBrand = (b) => ({
  name: str(b?.name, 80),
  lines: (Array.isArray(b?.lines) ? b.lines : []).slice(0, 6).map((l) => str(l, 80)),
  logo: normalizeDeckImage(b?.logo)?.file || null,
  mark: normalizeDeckImage(b?.mark)?.file || null,
});
export const normalizeDeckMeta = (m) => ({
  preparedFor: str(m?.preparedFor, 80), preparedBy: str(m?.preparedBy, 80), version: str(m?.version, 30), date: isDay(m?.date) ? m.date : '',
});
export const DECK_KIND_KEYS = DECK_KINDS.map((k) => k.key);
export function normalizePresentation(p) {
  return {
    id: typeof p?.id === 'string' && ID.test(p.id) ? p.id : nanoid(10),
    title: str(p?.title, 200),
    kind: DECK_KIND_KEYS.includes(p?.kind) ? p.kind : 'other',
    clientId: typeof p?.clientId === 'string' && ID.test(p.clientId) ? p.clientId : '',
    planId: typeof p?.planId === 'string' && ID.test(p.planId) ? p.planId : '',
    label: str(p?.label, 60),                  // top right on every slide ("PROJECT PROPOSAL")
    theme: normalizeDeckTheme(p?.theme),
    brand: normalizeDeckBrand(p?.brand),
    meta: normalizeDeckMeta(p?.meta),
    slides: (Array.isArray(p?.slides) ? p.slides : []).slice(0, 200).map(normalizeSlide).filter(Boolean),
    pinned: !!p?.pinned,
    createdAt: num(p?.createdAt, 0, 1e14, 0) || Date.now(),
    updatedAt: num(p?.updatedAt, 0, 1e14, 0) || Date.now(),
  };
}
/** What new presentations start with (Settings): the look and who they're from; the pictures sit in data/dashboard/. */
export const normalizeDeckDefaults = (d) => ({
  theme: normalizeDeckTheme(d?.theme),
  brand: {
    name: str(d?.brand?.name, 80),
    lines: (Array.isArray(d?.brand?.lines) ? d.brand.lines : []).slice(0, 6).map((l) => str(l, 80)),
    logo: typeof d?.brand?.logo === 'string' && /^deck-[\w.\- ()]{1,160}$/.test(d.brand.logo) ? d.brand.logo : null,
    mark: typeof d?.brand?.mark === 'string' && /^deck-[\w.\- ()]{1,160}$/.test(d.brand.mark) ? d.brand.mark : null,
  },
  preparedBy: str(d?.preparedBy, 80),
});
