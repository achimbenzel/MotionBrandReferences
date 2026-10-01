// Presentations (Work mode): decks — a project proposal, a brand identity, a
// case study … — made of slides in the style of your proposal template, with
// pictures in data/presentation/<id>/images/.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { DATA_DIR, TRASH_DIR } from '../config.js';
import { readDB, mutateDB } from '../db.js';
import { moveInto, safeRm, sanitize, extOf, sniffImageExt } from '../files.js';
import { trashFiles } from '../trashMoves.js';
import { upload } from '../upload.js';
import {
  normalizePresentation, normalizeDeckTheme, normalizeDeckBrand, normalizeDeckMeta, normalizeDeckDefaults, normalizeSlide, localDay, isDay, str, DECK_KIND_KEYS,
} from '../schema.js';
import { createRouter, HttpError } from '../http.js';
import { sourceAsUpload, IMAGE_EXT } from '../sources.js';
import { DECK_TEMPLATES } from '../../src/lib/slides.js';

const router = createRouter();
export default router;

export const presentationDir = (id) => path.join(DATA_DIR, 'presentation', id);
const dashboardDir = () => path.join(DATA_DIR, 'dashboard');
// Pinned first, then the one changed last.
const ordered = (list) => [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.updatedAt || 0) - (a.updatedAt || 0));

router.get('/api/presentations', async (_req, res) => {
  const db = await readDB();
  res.json({ presentations: ordered(db.presentations), defaults: db.settings.presentationDefaults });
});

router.get('/api/presentations/templates', (_req, res) => {
  res.json({ templates: Object.entries(DECK_TEMPLATES).map(([key, t]) => ({ key, label: t.label, hint: t.hint, kind: t.kind, count: t.slides().length })) });
});

router.get('/api/presentations/:id', async (req, res) => {
  const db = await readDB();
  const presentation = db.presentations.find((p) => p.id === req.params.id);
  if (!presentation) return res.status(404).json({ error: 'not_found' });
  res.json({ presentation });
});

// "[Client]" and "[Name]" in a template's text become the client's and your name.
function fillIn(slides, names) {
  const fill = (v) => (typeof v === 'string' ? v.replaceAll('[Client]', names.client || '[Client]').replaceAll('[Name]', names.me || '[Name]')
    : Array.isArray(v) ? v.map(fill) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)])) : v);
  return fill(slides);
}

// A new deck from a template (default: a project proposal), with the look and
// details saved for new decks — their pictures are copied into its folder.
router.post('/api/presentations', async (req, res) => {
  const b = req.body || {};
  const key = DECK_TEMPLATES[b.template] ? b.template : 'proposal';
  const tpl = DECK_TEMPLATES[key];
  const id = nanoid(10);
  const db = await readDB();
  const d = db.settings.presentationDefaults;
  const client = (db.clients || []).find((c) => c.id === b.clientId);
  const brand = { name: d.brand.name, lines: d.brand.lines, logo: null, mark: null };
  for (const k of ['logo', 'mark']) {
    const from = d.brand[k] && path.join(dashboardDir(), d.brand[k]);
    if (!from || !fs.existsSync(from)) continue;
    const name = `images/${nanoid(6)}-${k}${path.extname(from).toLowerCase()}`;
    await fsp.mkdir(path.join(presentationDir(id), 'images'), { recursive: true });
    await fsp.copyFile(from, path.join(presentationDir(id), name));
    brand[k] = name;
  }
  const first = (brand.name || '').split(' ')[0];
  const presentation = await mutateDB((dbw) => {
    const now = Date.now();
    const p = normalizePresentation({
      id, title: str(b.title, 200).trim() || (client ? `${tpl.label} · ${client.name}` : tpl.label), kind: tpl.kind,
      clientId: client?.id || '', planId: typeof b.planId === 'string' ? b.planId : '', label: tpl.deckLabel,
      theme: d.theme, brand, meta: { preparedFor: client?.name || '', preparedBy: d.preparedBy || brand.name, version: 'v1.0', date: localDay() },
      slides: fillIn(tpl.slides(), { client: client?.name, me: first }), createdAt: now, updatedAt: now,
    });
    dbw.presentations.push(p);
    return p;
  });
  res.status(201).json({ presentation });
});

// What's sent, saved: title, kind, client, project, label, look, details, slides (as a whole), pinned.
router.patch('/api/presentations/:id', async (req, res) => {
  const b = req.body || {};
  const presentation = await mutateDB((db) => {
    const p = db.presentations.find((x) => x.id === req.params.id);
    if (!p) return null;
    if ('title' in b) p.title = str(b.title, 200);
    if ('kind' in b && DECK_KIND_KEYS.includes(b.kind)) p.kind = b.kind;
    if ('clientId' in b) p.clientId = typeof b.clientId === 'string' && (db.clients || []).some((c) => c.id === b.clientId) ? b.clientId : '';
    if ('planId' in b) p.planId = typeof b.planId === 'string' && db.plans.some((x) => x.id === b.planId) ? b.planId : '';
    if ('label' in b) p.label = str(b.label, 60);
    if (b.theme && typeof b.theme === 'object') p.theme = normalizeDeckTheme({ ...p.theme, ...b.theme });
    if (b.brand && typeof b.brand === 'object') p.brand = normalizeDeckBrand({ ...p.brand, ...b.brand });
    if (b.meta && typeof b.meta === 'object') { // a date that isn't one leaves the one there ('' clears it)
      p.meta = normalizeDeckMeta({ ...p.meta, ...b.meta, date: 'date' in b.meta && (isDay(b.meta.date) || b.meta.date === '') ? b.meta.date : p.meta.date });
    }
    if (Array.isArray(b.slides)) p.slides = b.slides.slice(0, 200).map(normalizeSlide).filter(Boolean);
    if ('pinned' in b) p.pinned = !!b.pinned;
    p.updatedAt = Date.now();
    return p;
  });
  if (!presentation) return res.status(404).json({ error: 'not_found' });
  res.json({ presentation });
});

// A picture for a slide (or the logo): an upload, or one that's already in the app ({ source }). → { file, name }
router.post('/api/presentations/:id/images', upload.single('file'), async (req, res) => {
  await sourceAsUpload(req);
  const f = req.file;
  if (!f || !(IMAGE_EXT.test(f.originalname) || (f.mimetype || '').startsWith('image/'))) throw new HttpError(400, 'file_required', 'Pick a picture (PNG, JPG, GIF, WebP, AVIF or SVG).');
  const db = await readDB();
  if (!db.presentations.some((p) => p.id === req.params.id)) return res.status(404).json({ error: 'not_found' });
  const dir = path.join(presentationDir(req.params.id), 'images');
  await fsp.mkdir(dir, { recursive: true });
  const ext = extOf(f.originalname) || await sniffImageExt(f.path).catch(() => '') || '.png';
  const base = sanitize(path.basename(f.originalname, path.extname(f.originalname))).slice(0, 60) || 'picture';
  const stored = await moveInto(dir, f.path, `${nanoid(6)}-${base}${ext}`);
  res.status(201).json({ file: `images/${stored}`, name: str(f.originalname, 200) });
});

// A copy: the record and its pictures.
router.post('/api/presentations/:id/duplicate', async (req, res) => {
  const db = await readDB();
  const src = db.presentations.find((p) => p.id === req.params.id);
  if (!src) return res.status(404).json({ error: 'not_found' });
  const id = nanoid(10);
  if (fs.existsSync(presentationDir(src.id))) await fsp.cp(presentationDir(src.id), presentationDir(id), { recursive: true });
  const presentation = await mutateDB((dbw) => {
    const now = Date.now();
    const p = normalizePresentation({ ...src, id, title: `${src.title || 'Presentation'} (copy)`, pinned: false, createdAt: now, updatedAt: now,
      slides: src.slides.map((s) => ({ ...s, id: undefined })) });
    dbw.presentations.push(p);
    return p;
  });
  res.status(201).json({ presentation });
});

// This deck's look and details for every new deck (its logo and mark copied to data/dashboard/).
router.post('/api/presentations/:id/defaults', async (req, res) => {
  const db = await readDB();
  const p = db.presentations.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'not_found' });
  const old = db.settings.presentationDefaults;
  const brand = { name: p.brand.name, lines: p.brand.lines, logo: null, mark: null };
  for (const k of ['logo', 'mark']) {
    const from = p.brand[k] && path.join(presentationDir(p.id), p.brand[k]);
    if (!from || !fs.existsSync(from)) continue;
    await fsp.mkdir(dashboardDir(), { recursive: true });
    brand[k] = `deck-${k}-${nanoid(6)}${path.extname(from).toLowerCase()}`;
    await fsp.copyFile(from, path.join(dashboardDir(), brand[k]));
  }
  const defaults = await mutateDB((dbw) => {
    dbw.settings.presentationDefaults = normalizeDeckDefaults({ theme: p.theme, brand, preparedBy: p.meta.preparedBy });
    return dbw.settings.presentationDefaults;
  });
  for (const k of ['logo', 'mark']) if (old.brand[k] && old.brand[k] !== defaults.brand[k]) await safeRm(path.join(dashboardDir(), old.brand[k]), { force: true }).catch(() => {});
  res.json({ defaults });
});

// → Trash, with its pictures.
router.delete('/api/presentations/:id', async (req, res) => {
  const trashId = nanoid(10);
  const ok = await mutateDB((db) => {
    const i = db.presentations.findIndex((x) => x.id === req.params.id);
    if (i === -1) return false;
    const [p] = db.presentations.splice(i, 1);
    db.trash.unshift({ trashId, kind: 'presentation', deletedAt: Date.now(), data: p });
    return true;
  });
  if (!ok) return res.status(404).json({ error: 'not_found' });
  await trashFiles(trashId, [{ from: presentationDir(req.params.id), to: path.join(TRASH_DIR, trashId) }]);
  res.json({ trashId });
});
