/**
 * Something that's already in the app, used again somewhere else (on a mockup
 * screen, as a plan's banner, in a moodboard …) — always named by ids, never
 * by a path, so nothing outside the data folder can be reached:
 *
 * { kind: 'plan', planId, blockId, itemId }      images / videos / storyboard frames of a plan
 * { kind: 'plan', planId, itemId: '@avatar' | '@banner' }   its profile picture / banner
 * { kind: 'project', projectId, itemId? }        a reference's video / image, or one of its frames, moments or assets
 * { kind: 'project', projectId, field }          one picture of a reference (a card's back, a logo's dark version …)
 * { kind: 'software', softwareId, field | itemId }  a software's banner / profile picture, a plugin's or group's picture
 * { kind: 'inbox', itemId }                      a shared file
 * { kind: 'dashboard' }                          the dashboard's banner
 * { kind: 'client', clientId }                   a client's logo
 * { kind: 'note', noteId, itemId }               a picture of a note
 * { kind: 'content', contentId, itemId }        a picture / video of a planned post
 * { kind: 'mockup', mockupId, file }             a mockup's rendered preview or one of its screen / print pictures
 *                                                (`file` only as the mockup itself names it)
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { DATA_DIR, TMP_DIR } from './config.js';
import { readDB } from './db.js';
import { extOf, sniffImageExt } from './files.js';
import { HttpError } from './http.js';

export const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg)$/i;
export const VIDEO_EXT = /\.(mp4|m4v|mov|webm|ogv)$/i;
export const mediaKind = (name, mime = '') => (VIDEO_EXT.test(name) || mime.startsWith('video/') ? 'video'
  : IMAGE_EXT.test(name) || mime.startsWith('image/') ? 'image' : null);

// The pictures a reference can have besides its main file (by type).
export const PROJECT_FIELDS = ['image', 'front', 'back', 'logoDark', 'logoLight', 'shot', 'example', 'thumb'];
const SOFTWARE_FIELDS = ['avatar', 'banner'];

/** → { abs, name } of the file a source names, or null. */
export function findSource(db, s) {
  if (s?.kind === 'plan') {
    const plan = db.plans.find((p) => p.id === s.planId);
    // The plan's own profile picture / banner (no block).
    if (plan && (s.itemId === '@avatar' || s.itemId === '@banner')) {
      const rel = s.itemId === '@avatar' ? plan.avatar : plan.banner;
      return rel ? { abs: path.join(DATA_DIR, 'plan', plan.id, rel), name: `${plan.name || 'Project'} · ${s.itemId === '@avatar' ? 'profile picture' : 'banner'}` } : null;
    }
    const b = plan?.blocks?.find((x) => x.id === s.blockId);
    if (!b) return null;
    const hit = (b.images || []).find((x) => x.id === s.itemId) || (b.files || []).find((x) => x.id === s.itemId)
      || (b.versions || []).find((x) => x.id === s.itemId);
    const shot = (b.shots || []).find((x) => x.id === s.itemId);
    const rel = hit?.file || shot?.image;
    const label = hit?.title || hit?.name || hit?.label || (shot ? `${b.title || 'Storyboard'} · shot ${b.shots.indexOf(shot) + 1}` : `${plan.name || 'Project'} · ${b.title || 'Moodboard'}`);
    return rel ? { abs: path.join(DATA_DIR, 'plan', plan.id, rel), name: label } : null;
  }
  if (s?.kind === 'project') {
    const p = db.projects.find((x) => x.id === s.projectId);
    if (!p) return null;
    let rel = null;
    if (s.field) rel = PROJECT_FIELDS.includes(s.field) && typeof p[s.field] === 'string' ? p[s.field] : null;
    else if (s.itemId) {
      rel = (p.frames || []).find((f) => f.id === s.itemId)?.file
        || (p.markers || []).find((f) => f.id === s.itemId)?.thumb
        || (p.assets || []).find((a) => a.id === s.itemId && a.kind === 'image')?.file;
    } else rel = p.video || p.image || p.front || p.shot || p.thumb;
    return rel ? { abs: path.join(DATA_DIR, p.type, p.id, rel), name: p.title || path.basename(rel) } : null;
  }
  if (s?.kind === 'software') {
    const sw = (db.software || []).find((x) => x.id === s.softwareId);
    if (!sw) return null;
    let rel = null;
    if (s.field) rel = SOFTWARE_FIELDS.includes(s.field) ? sw[s.field] : null;
    else if (s.itemId) {
      rel = (sw.plugins || []).find((x) => x.id === s.itemId)?.image
        || (sw.expressionGroups || []).find((x) => x.id === s.itemId)?.image;
    }
    return typeof rel === 'string' && rel ? { abs: path.join(DATA_DIR, 'software', sw.id, rel), name: sw.name || 'Software' } : null;
  }
  if (s?.kind === 'inbox') {
    const it = db.inbox.find((x) => x.id === s.itemId);
    return it?.file ? { abs: path.join(DATA_DIR, 'inbox', it.id, it.file), name: it.name || it.file } : null;
  }
  if (s?.kind === 'dashboard') {
    const rel = db.settings?.dashboardBanner;
    return typeof rel === 'string' && rel ? { abs: path.join(DATA_DIR, 'dashboard', path.basename(rel)), name: 'Dashboard banner' } : null;
  }
  if (s?.kind === 'client') {
    const c = (db.clients || []).find((x) => x.id === s.clientId);
    return c?.logo ? { abs: path.join(DATA_DIR, 'client', c.id, c.logo), name: `${c.name || 'Client'} · logo` } : null;
  }
  if (s?.kind === 'note') {
    const n = (db.notes || []).find((x) => x.id === s.noteId);
    const img = n?.images.find((x) => x.id === s.itemId);
    return img ? { abs: path.join(DATA_DIR, 'note', n.id, img.file), name: img.name || n.title || 'Note' } : null;
  }
  if (s?.kind === 'content') {
    const c = (db.content || []).find((x) => x.id === s.contentId);
    const m = c?.media.find((x) => x.id === s.itemId);
    return m ? { abs: path.join(DATA_DIR, 'content', c.id, m.file), name: m.name || c.title || 'Content' } : null;
  }
  if (s?.kind === 'mockup') {
    const m = (db.mockups || []).find((x) => x.id === s.mockupId);
    const rel = m && typeof s.file === 'string' && mockupFiles(m).includes(s.file) ? s.file : null;
    return rel ? { abs: path.join(DATA_DIR, 'mockup', m.id, rel), name: m.name || 'Mockup' } : null;
  }
  return null;
}

/** Every picture / video file a mockup names: its preview, what's on its screens, printed faces and 2D slots. */
export function mockupFiles(m) {
  const out = [m.thumb];
  for (const it of m.items || []) {
    out.push(it.content?.file);
    for (const f of Object.values(it.faces || {})) out.push(f?.file);
  }
  for (const s of Object.values(m.d2?.slots || {})) out.push(s?.file);
  return out.filter((f) => typeof f === 'string' && f);
}

/**
 * The file a source names, checked: it's there, inside the data folder and a
 * picture or video → { abs, name, ext, kind }, or null. A file without a
 * telling extension (older plan profile pictures were saved as `.img`) is
 * recognised by its first bytes.
 */
export async function resolveSource(db, s) {
  const src = findSource(db, s);
  if (!src) return null;
  const abs = path.resolve(src.abs);
  if (!abs.startsWith(path.resolve(DATA_DIR) + path.sep) || !fs.existsSync(abs)) return null;
  let ext = extOf(abs);
  if (!mediaKind(abs)) ext = await sniffImageExt(abs);
  const kind = mediaKind(`x${ext}`);
  return kind ? { abs, name: src.name, ext, kind } : null;
}

/**
 * For the routes that take an uploaded picture: when the JSON body names a
 * `source` instead, copy that picture into the request's tmp folder and hand
 * it over like an upload (`req.file`) — the route stays the same. Pictures
 * only (anything else is refused with a 400); → true when it did.
 */
export async function sourceAsUpload(req) {
  if (req.file || !req.body?.source || typeof req.body.source !== 'object') return false;
  const src = await resolveSource(await readDB(), req.body.source);
  if (!src || src.kind !== 'image') throw new HttpError(400, 'not_found', 'That picture is no longer there (or isn’t a picture).');
  if (!req.tmpDir) {
    req.tmpDir = path.join(TMP_DIR, nanoid());
    await fsp.mkdir(req.tmpDir, { recursive: true });
  }
  const tmp = path.join(req.tmpDir, `${nanoid(8)}${src.ext}`);
  await fsp.copyFile(src.abs, tmp);
  const base = String(src.name || 'picture').replace(/[^\w\- .]+/g, '').trim().slice(0, 80) || 'picture';
  req.file = { path: tmp, originalname: `${base}${src.ext}`, size: (await fsp.stat(tmp)).size, mimetype: '' };
  return true;
}
