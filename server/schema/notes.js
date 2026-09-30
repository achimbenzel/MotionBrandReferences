// Notes and their pictures.
// Part of the record shapes (see ../schema.js, which re-exports all of it).
import { nanoid } from 'nanoid';
import { ID, TAG_KEYS, num, str } from './base.js';

// ---------------------------------------------------------------------------
// Notes — general notes: a title, text and pictures (in data/note/<id>/)
// ---------------------------------------------------------------------------
const noteFile = (v) => (typeof v === 'string' && v.startsWith('images/') && !v.includes('..') ? str(v, 300) : null);
export function normalizeNoteImage(i) {
  return {
    id: typeof i?.id === 'string' && ID.test(i.id) ? i.id : nanoid(8),
    file: noteFile(i?.file), name: str(i?.name, 200),
    width: num(i?.width, 0, 100000, 0), height: num(i?.height, 0, 100000, 0),
  };
}
export function normalizeNote(n) {
  return {
    id: typeof n?.id === 'string' && ID.test(n.id) ? n.id : nanoid(10),
    title: str(n?.title, 300),
    body: str(n?.body, 200000),
    color: TAG_KEYS.has(n?.color) ? n.color : null,
    pinned: !!n?.pinned,
    images: (Array.isArray(n?.images) ? n.images : []).slice(0, 500).map(normalizeNoteImage).filter((i) => i.file),
    createdAt: num(n?.createdAt, 0, 1e14, 0),
    updatedAt: num(n?.updatedAt, 0, 1e14, 0),
  };
}
