// Thin fetch wrapper around the local backend.
// All uploaded files are referenced by URLs under /data (proxied to the API
// in dev, same-origin in production).
import { optimizeForm, rememberPrefs } from './imageOptimize.js';

// Every request carries this header; the server rejects state-changing calls
// without it, which stops other websites from posting to your library (CSRF).
const BASE_HEADERS = { 'X-Requested-With': 'confinium' };

// ---- Several devices (see server/live.js) ------------------------------------
// This tab's name, sent with every request. For what the page loaded, the
// library revision it was loaded at (`X-Rev`), sent back with edits: the
// server refuses an edit of something another device has changed since.
export const CLIENT_ID = `tab-${Math.random().toString(36).slice(2, 12)}`;
const loadedAt = new Map(); // 'plans/abc' → revision
const keyOfUrl = (url) => new URL(url, 'http://app').pathname.replace(/^\/api\//, '');
function baseFor(url) {
  for (let k = keyOfUrl(url); k; k = k.includes('/') ? k.slice(0, k.lastIndexOf('/')) : '') {
    if (loadedAt.has(k)) return loadedAt.get(k);
  }
  return null;
}
/** The revision a page's copy of `key` stands on — kept when a background reload isn't shown. */
export const loadedRev = {
  get: (key) => loadedAt.get(key),
  set: (key, rev) => { if (rev == null) loadedAt.delete(key); else loadedAt.set(key, rev); },
};
// Asked what to do when an edit clashes: → 'mine' (save it anyway) or 'theirs'.
let conflictHandler = null;
export function setConflictHandler(fn) {
  conflictHandler = fn;
  return () => { if (conflictHandler === fn) conflictHandler = null; };
}
export class ConflictError extends Error {
  constructor() { super('it was changed on another device — showing that version now'); this.code = 'conflict'; }
}

// While true, requests are sent with `keepalive` so they survive the page
// being closed (used to flush pending autosaves on pagehide). Browsers cap
// keepalive bodies at 64 KB, so bigger ones go out as normal requests.
let keepaliveMode = false;
export function withKeepalive(fn) {
  keepaliveMode = true;
  try { return fn(); } finally { keepaliveMode = false; }
}

async function handle(res) {
  if (!res.ok) {
    let msg = res.statusText;
    try { const body = await res.json(); msg = body.message || body.error || msg; } catch { /* not JSON */ }
    throw new Error(`${res.status} ${msg}`);
  }
  return res.json();
}

// A moment where the server can't be reached — it is (re)starting after an
// update, or a proxy in front of it lost the connection — shows up as a
// network error, a 502 / 503 / 504 or a bare 500 from the proxy (our own
// errors are always JSON). Such requests are sent again a few times: reads
// and field updates always, anything else only when the proxy says the
// request never reached the server — so nothing is created twice.
// A banner / profile picture keeps its real extension (a cropped canvas blob has none → from its type).
const IMAGE_TYPES = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif', 'image/svg+xml': '.svg' };
const imageName = (kind, file) => {
  const ext = /\.(png|jpe?g|webp|gif|avif|svg)$/i.exec(file?.name || '')?.[0] || IMAGE_TYPES[file?.type] || '.png';
  return `${kind}${ext.toLowerCase()}`;
};
// A picture sent to the server: a file from the device, or `{ source }` — one
// that's already in the app (the server copies it; see MediaPicker).
const picBody = (field, pic, name) => {
  if (pic && !(pic instanceof Blob) && pic.source) return { json: { source: pic.source } };
  const fd = new FormData();
  if (name) fd.append(field, pic, name); else fd.append(field, pic);
  return { body: fd };
};
const slotQuery = (slot, item) => `slot=${encodeURIComponent(slot)}${item ? `&item=${encodeURIComponent(item)}` : ''}`;
const RETRY_DELAYS = [300, 800, 1600, 3000];
const REPEATABLE = new Set(['GET', 'HEAD', 'PATCH', 'PUT']);
const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });
const UNREACHABLE = 'Can’t reach the server right now — it may be restarting after an update. Try again in a moment.';

async function transientInfo(res) {
  const json = /json/.test(res.headers.get('content-type') || '');
  if (res.status === 500 && json) return null;                 // a real error of ours
  if (![500, 502, 503, 504].includes(res.status)) return null;
  const body = json ? await res.clone().json().catch(() => null) : null;
  return { notDelivered: body?.error === 'backend_unreachable' && body.delivered === false, ours: body?.error === 'db_unavailable' };
}

// fetch() + CSRF header + JSON encoding + error handling in one place.
async function request(url, { method = 'GET', json, body, pictures } = {}) {
  const headers = { ...BASE_HEADERS, 'X-Client-Id': CLIENT_ID };
  const base = method === 'PATCH' || method === 'PUT' ? baseFor(url) : null;
  if (base) headers['X-Base-Rev'] = String(base);
  // Picture uploads: made smaller first, as you set it (ask / always / never).
  let payload = pictures && body instanceof FormData ? await optimizeForm(body, pictures) : body;
  if (json !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(json); }
  const keepalive = keepaliveMode && (payload == null || (typeof payload === 'string' && payload.length < 60000));
  const repeatable = REPEATABLE.has(method) && !keepalive;
  for (let attempt = 0; ; attempt += 1) {
    const last = attempt >= RETRY_DELAYS.length || keepalive;
    let res;
    try {
      res = await fetch(url, { method, headers, body: payload, keepalive });
    } catch (err) {
      if (last || !repeatable) throw new Error(err?.name === 'TypeError' ? UNREACHABLE : err.message);
      await wait(RETRY_DELAYS[attempt]);
      continue;
    }
    const t = !res.ok && !last ? await transientInfo(res) : null;
    if (t && (t.notDelivered || (repeatable && !t.ours) || (t.ours && method === 'GET'))) {
      await wait(RETRY_DELAYS[attempt]);
      continue;
    }
    if (!res.ok && (res.status === 502 || res.status === 504 || (res.status === 500 && !/json/.test(res.headers.get('content-type') || '')))) {
      const b = await res.clone().json().catch(() => null);
      if (!b || b.error === 'backend_unreachable') throw new Error(UNREACHABLE);
    }
    if (res.status === 409 && !keepalive && (await res.clone().json().catch(() => null))?.error === 'conflict') {
      // Changed on another device since this page loaded it: yours, or theirs?
      if ((await conflictHandler?.({ url, key: keyOfUrl(url) })) !== 'mine') throw new ConflictError();
      headers['X-Force'] = '1';
      attempt -= 1; // not one of the retries
      continue;
    }
    const rev = Number(res.headers.get('X-Rev'));
    if (res.ok && rev) {
      if (method === 'GET') {
        const key = keyOfUrl(url);
        loadedAt.set(key, rev);
        for (const k of loadedAt.keys()) if (k.startsWith(`${key}/`)) loadedAt.delete(k); // loaded as a whole again
      }
      // Kept mine: this page now stands on what it just saved, not on the other device's older change.
      else if (headers['X-Force']) loadedAt.set(keyOfUrl(url), rev);
    }
    return handle(res);
  }
}

export const api = {
  async list(type) {
    const q = type ? `?type=${encodeURIComponent(type)}` : '';
    const { projects } = await request(`/api/projects${q}`);
    return projects;
  },

  async get(id) {
    const { project } = await request(`/api/projects/${id}`);
    return project;
  },

  async create(formData) {
    const { project } = await request('/api/projects', { method: 'POST', body: formData, pictures: true });
    return project;
  },

  async update(id, patch) {
    const { project } = await request(`/api/projects/${id}`, { method: 'PATCH', json: patch });
    return project;
  },

  async remove(id) {
    return request(`/api/projects/${id}`, { method: 'DELETE' });
  },

  // Store a moment's captured frame → 'markers/…' (saved into `markers` by the page).
  async uploadMarkerThumb(id, blob) {
    const fd = new FormData();
    fd.append('thumb', blob, 'moment.webp');
    const { file } = await request(`/api/projects/${id}/marker-thumb`, { method: 'POST', body: fd });
    return file;
  },
  // Technique tags used on motion moments → [{ label, count }], most used first.
  async listTechniques() {
    const { techniques } = await request('/api/motion/techniques');
    return techniques;
  },
  async addFrame(id, blob, t) {
    const fd = new FormData();
    fd.append('frame', blob, 'frame.webp');
    fd.append('t', String(t));
    const { project } = await request(`/api/projects/${id}/frames`, { method: 'POST', body: fd });
    return project;
  },

  // Add many captured frames in one request. `items` = [{ blob, t }, …].
  async addFrames(id, items) {
    const fd = new FormData();
    items.forEach((it, i) => fd.append('frames', it.blob, `frame${i}.webp`));
    fd.append('times', JSON.stringify(items.map((it) => it.t)));
    const { project } = await request(`/api/projects/${id}/frames/batch`, { method: 'POST', body: fd });
    return project;
  },

  async removeFrame(id, frameId) {
    const { project } = await request(`/api/projects/${id}/frames/${frameId}`, { method: 'DELETE' });
    return project;
  },

  async setThumb(id, blob, meta) {
    const fd = new FormData();
    fd.append('thumb', blob, 'thumb.webp');
    if (meta) fd.append('thumbMeta', JSON.stringify(meta));
    const { project } = await request(`/api/projects/${id}/thumb`, { method: 'POST', body: fd });
    return project;
  },

  // --- Galleries ---
  async listGalleries(type) {
    const q = type ? `?type=${encodeURIComponent(type)}` : '';
    const { galleries } = await request(`/api/galleries${q}`);
    return galleries;
  },
  async getGallery(id) {
    const { gallery } = await request(`/api/galleries/${id}`);
    return gallery;
  },
  async createGallery(type, name) {
    const { gallery } = await request('/api/galleries', { method: 'POST', json: { type, name } });
    return gallery;
  },
  async updateGallery(id, patch) {
    const { gallery } = await request(`/api/galleries/${id}`, { method: 'PATCH', json: patch });
    return gallery;
  },
  async removeGallery(id) {
    return request(`/api/galleries/${id}`, { method: 'DELETE' });
  },

  // --- Plans (Plan mode) ---
  async listPlans() {
    const { plans } = await request('/api/plans');
    return plans;
  },
  async getPlan(id) {
    const { plan } = await request(`/api/plans/${id}`);
    return plan;
  },
  // client: a client's id (clientId) or a name (an existing client, or a new one).
  async createPlan({ name, clientId, client, template } = {}) {
    const { plan } = await request('/api/plans', { method: 'POST', json: { name, clientId, client, template } });
    return plan;
  },
  // Put a library item into a plan's References → { plan, blockId, added }.
  async addPlanRef(planId, refKind, refId) {
    return request(`/api/plans/${planId}/refs`, { method: 'POST', json: { refKind, refId } });
  },
  // --- Inbox (shared from a phone, waiting to be sorted) ---
  async listInbox() {
    const { items } = await request('/api/inbox');
    return items;
  },
  async addToInbox({ files = [], url = '', text = '', title = '' } = {}) {
    const fd = new FormData();
    for (const f of files) fd.append('files', f, f.name);
    if (url) fd.append('url', url);
    if (text) fd.append('text', text);
    if (title) fd.append('title', title);
    const { items } = await request('/api/inbox', { method: 'POST', body: fd, pictures: true });
    return items;
  },
  // `used`: it now lives in the library, so it's deleted for good (else → Trash).
  async removeInboxItem(id, { used = false } = {}) {
    return request(`/api/inbox/${id}${used ? '?used=1' : ''}`, { method: 'DELETE' });
  },
  // → { plan, blockId, blockType }
  async inboxToPlan(id, planId) {
    return request(`/api/inbox/${id}/to-plan`, { method: 'POST', json: { planId } });
  },
  // Keep a finished plan's work in the library (copies of its files) → { plan, projects }.
  async archivePlan(planId, body) {
    return request(`/api/plans/${planId}/archive`, { method: 'POST', json: body });
  },
  // --- Mockups (3D device scenes) and imported 3D models ---
  async listMockups() { return request('/api/mockups'); }, // → { mockups, models }
  async getMockup(id) { const { mockup } = await request(`/api/mockups/${id}`); return mockup; },
  async createMockup(body) { const { mockup } = await request('/api/mockups', { method: 'POST', json: body }); return mockup; },
  async updateMockup(id, patch) { const { mockup } = await request(`/api/mockups/${id}`, { method: 'PATCH', json: patch }); return mockup; },
  async duplicateMockup(id) { const { mockup } = await request(`/api/mockups/${id}/duplicate`, { method: 'POST' }); return mockup; },
  async removeMockup(id) { return request(`/api/mockups/${id}`, { method: 'DELETE' }); },
  // Screen content of one device of the scene (`item` = its id; default: the first).
  async setMockupContent(id, file, item) {
    const fd = new FormData();
    fd.append('file', file, file.name || 'screen.png');
    const { mockup } = await request(`/api/mockups/${id}/content${item ? `?item=${encodeURIComponent(item)}` : ''}`, { method: 'POST', body: fd, pictures: true });
    return mockup;
  },
  async importMockupContent(id, source, item) { const { mockup } = await request(`/api/mockups/${id}/content/import${item ? `?item=${encodeURIComponent(item)}` : ''}`, { method: 'POST', json: { source } }); return mockup; },
  async clearMockupContent(id, item) { const { mockup } = await request(`/api/mockups/${id}/content${item ? `?item=${encodeURIComponent(item)}` : ''}`, { method: 'DELETE' }); return mockup; },
  // A picture in a 2D mockup's slot (avatar, banner, media-0 …).
  // (a 3D object's printed face: pass the device as `item`)
  async setMockupSlot(id, slot, file, item) {
    const fd = new FormData();
    fd.append('file', file, file.name || 'picture.png');
    const { mockup } = await request(`/api/mockups/${id}/content?${slotQuery(slot, item)}`, { method: 'POST', body: fd, pictures: true });
    return mockup;
  },
  async importMockupSlot(id, slot, source, item) { const { mockup } = await request(`/api/mockups/${id}/content/import?${slotQuery(slot, item)}`, { method: 'POST', json: { source } }); return mockup; },
  async clearMockupSlot(id, slot, item) { const { mockup } = await request(`/api/mockups/${id}/content?${slotQuery(slot, item)}`, { method: 'DELETE' }); return mockup; },
  async setMockupThumb(id, blob) {
    const fd = new FormData(); fd.append('thumb', blob, 'thumb.webp');
    const { mockup } = await request(`/api/mockups/${id}/thumb`, { method: 'POST', body: fd }); return mockup;
  },
  async addMockupModel(file, name) {
    const fd = new FormData(); fd.append('model', file, file.name); if (name) fd.append('name', name);
    const { model } = await request('/api/mockup-models', { method: 'POST', body: fd }); return model;
  },
  async updateMockupModel(id, patch) { const { model } = await request(`/api/mockup-models/${id}`, { method: 'PATCH', json: patch }); return model; },
  async removeMockupModel(id) { return request(`/api/mockup-models/${id}`, { method: 'DELETE' }); },
  // Your own HDRIs (.hdr / .exr / panorama picture) for the mockup light.
  async addMockupHdri(file, name) {
    const fd = new FormData(); fd.append('hdri', file, file.name || 'environment.hdr'); if (name) fd.append('name', name);
    const { hdri } = await request('/api/mockup-hdris', { method: 'POST', body: fd }); return hdri;
  },
  async setMockupHdriThumb(id, blob) {
    const fd = new FormData(); fd.append('thumb', blob, 'thumb.webp');
    const { hdri } = await request(`/api/mockup-hdris/${id}/thumb`, { method: 'POST', body: fd }); return hdri;
  },
  async updateMockupHdri(id, patch) { const { hdri } = await request(`/api/mockup-hdris/${id}`, { method: 'PATCH', json: patch }); return hdri; },
  async removeMockupHdri(id) { return request(`/api/mockup-hdris/${id}`, { method: 'DELETE' }); },

  // --- Storyboards (storyboard blocks of plans) ---
  async listStoryboardTemplates() {
    const { templates } = await request('/api/storyboard-templates');
    return templates;
  },
  // A storyboard saved as a template of your own (the same name replaces it) → { template, replaced }
  async saveStoryboardTemplate(planId, blockId, { label, description } = {}) {
    return request('/api/storyboard-templates', { method: 'POST', json: { planId, blockId, label, description } });
  },
  async updateStoryboardTemplate(key, patch) { const { template } = await request(`/api/storyboard-templates/${encodeURIComponent(key)}`, { method: 'PATCH', json: patch }); return template; },
  async removeStoryboardTemplate(key) { return request(`/api/storyboard-templates/${encodeURIComponent(key)}`, { method: 'DELETE' }); },
  // New storyboard in a plan: { title, aspect, template } or a copy { from: blockId, aspect } → { plan, block }
  async createStoryboard(planId, body) {
    return request(`/api/plans/${planId}/storyboards`, { method: 'POST', json: body });
  },
  // Copy plan images / motion frames / moments into a storyboard's folder → [{ file, name, label, key }]
  async importStoryboardFrames(planId, blockId, items) {
    const { files } = await request(`/api/plans/${planId}/blocks/${blockId}/import`, { method: 'POST', json: { items } });
    return files;
  },
  // Plan templates: built-in ones plus those saved from plans.
  async listPlanTemplates() {
    const { templates } = await request('/api/plan-templates');
    return templates;
  },
  // → { template, replaced } (saving under an existing template's name updates it)
  async savePlanTemplate(planId, name) {
    return request('/api/plan-templates', { method: 'POST', json: { planId, name } });
  },
  async removePlanTemplate(id) {
    return request(`/api/plan-templates/${id}`, { method: 'DELETE' });
  },
  async updatePlan(id, patch) {
    const { plan } = await request(`/api/plans/${id}`, { method: 'PATCH', json: patch });
    return plan;
  },
  async removePlan(id) {
    return request(`/api/plans/${id}`, { method: 'DELETE' });
  },
  async setPlanImage(id, kind, file) { // kind: 'banner' | 'avatar'; file: a File or { source }
    const { plan } = await request(`/api/plans/${id}/${kind}`, { method: 'POST', ...picBody(kind, file, imageName(kind, file)), pictures: true });
    return plan;
  },
  async removePlanImage(id, kind) {
    const { plan } = await request(`/api/plans/${id}/${kind}`, { method: 'DELETE' });
    return plan;
  },
  // --- Plan content blocks (moodboard / text / todos / files) ---
  // `after`: insert right after that block (default: at the end). → plan
  async addBlock(id, type, { after, tab } = {}) {
    const { plan } = await request(`/api/plans/${id}/blocks`, { method: 'POST', json: { type, after, tab } });
    return plan;
  },
  // Store files in a storyboard's folder → [{ file, name, size }] (the block
  // itself is saved by the page, with the paths added to its shots / track).
  // `pictures`: storyboard frames (made smaller as you set it) — not a review's versions.
  async uploadBlockFiles(id, blockId, fileList, { pictures = false } = {}) {
    const fd = new FormData();
    Array.from(fileList).forEach((f) => fd.append('files', f));
    const { files } = await request(`/api/plans/${id}/blocks/${blockId}/uploads`, { method: 'POST', body: fd, pictures });
    return files;
  },
  async updateBlock(id, blockId, patch) {
    const { plan } = await request(`/api/plans/${id}/blocks/${blockId}`, { method: 'PATCH', json: patch });
    return plan;
  },
  // Swap with the neighbour (`dir`: 'up' | 'down'), or with the block `withId`.
  async moveBlock(id, blockId, dir, withId) {
    const { plan } = await request(`/api/plans/${id}/blocks/${blockId}/move`, { method: 'POST', json: { dir, with: withId } });
    return plan;
  },
  // Put a block right before / after another one (drag and drop): { before } or { after },
  // plus `pin` ({ blockId: tab }) for blocks that only follow their neighbours.
  async placeBlock(id, blockId, where) {
    const { plan } = await request(`/api/plans/${id}/blocks/${blockId}/move`, { method: 'POST', json: where });
    return plan;
  },
  // Moves the block (and its files) to Trash → { plan, trashId }.
  async removeBlock(id, blockId) {
    return request(`/api/plans/${id}/blocks/${blockId}`, { method: 'DELETE' });
  },
  // files, or { source } — a picture already in the app. `pictures`: a moodboard's (made smaller as
  // you set it) — not the files of a files block.
  async addBlockFiles(id, blockId, fileList, { pictures = false } = {}) {
    let body;
    if (fileList?.source) body = { json: { source: fileList.source } };
    else { const fd = new FormData(); Array.from(fileList).forEach((f) => fd.append('files', f)); body = { body: fd, pictures }; }
    const { plan } = await request(`/api/plans/${id}/blocks/${blockId}/files`, { method: 'POST', ...body });
    return plan;
  },
  // Add one file to a files block, with an optional example image + title.
  async addBlockFile(id, blockId, { file, example, title }) {
    const fd = new FormData();
    fd.append('file', file);
    if (example) fd.append('example', example);
    if (title) fd.append('title', title);
    const { plan } = await request(`/api/plans/${id}/blocks/${blockId}/file`, { method: 'POST', body: fd, pictures: ['example'] }); // the file itself stays as it is
    return plan;
  },
  async removeBlockFile(id, blockId, fileId) {
    return request(`/api/plans/${id}/blocks/${blockId}/files/${fileId}`, { method: 'DELETE' });
  },

  // --- Software (plugin DB / expressions / tutorials) ---
  async listSoftware() {
    const { software } = await request('/api/software');
    return software;
  },
  async getSoftware(id) {
    const { software } = await request(`/api/software/${id}`);
    return software;
  },
  async createSoftware(name, avatarEmoji) {
    const { software } = await request('/api/software', { method: 'POST', json: { name, avatarEmoji } });
    return software;
  },
  async updateSoftware(id, patch) {
    const { software } = await request(`/api/software/${id}`, { method: 'PATCH', json: patch });
    return software;
  },
  async removeSoftware(id) {
    return request(`/api/software/${id}`, { method: 'DELETE' });
  },
  // Software banner / avatar images (like plans). kind: 'banner' | 'avatar'
  async setSoftwareImage(id, kind, file) {
    const { software } = await request(`/api/software/${id}/${kind}`, { method: 'POST', ...picBody(kind, file, imageName(kind, file)), pictures: true });
    return software;
  },
  async removeSoftwareImage(id, kind) {
    const { software } = await request(`/api/software/${id}/${kind}`, { method: 'DELETE' });
    return software;
  },
  // Plugin installer file
  async setPluginFile(id, pluginId, file) {
    const fd = new FormData(); fd.append('file', file);
    const { software } = await request(`/api/software/${id}/plugins/${pluginId}/file`, { method: 'POST', body: fd });
    return software;
  },
  async removePluginFile(id, pluginId) {
    const { software } = await request(`/api/software/${id}/plugins/${pluginId}/file`, { method: 'DELETE' });
    return software;
  },
  // Plugin preview image (shown in the card view)
  async setPluginImage(id, pluginId, file) {
    const { software } = await request(`/api/software/${id}/plugins/${pluginId}/image`, { method: 'POST', ...picBody('image', file), pictures: true });
    return software;
  },
  async removePluginImage(id, pluginId) {
    const { software } = await request(`/api/software/${id}/plugins/${pluginId}/image`, { method: 'DELETE' });
    return software;
  },
  // Expression-group preview image
  async setGroupImage(id, groupId, file) {
    const { software } = await request(`/api/software/${id}/groups/${groupId}/image`, { method: 'POST', ...picBody('image', file), pictures: true });
    return software;
  },
  async removeGroupImage(id, groupId) {
    const { software } = await request(`/api/software/${id}/groups/${groupId}/image`, { method: 'DELETE' });
    return software;
  },

  // --- To-Do board (global Kanban planner) ---
  // One card at a time (a plan's to-do list): → the whole board, fresh.
  async addBoardCard({ title, planId, columnId, urgent } = {}) {
    const { board } = await request('/api/board/cards', { method: 'POST', json: { title, planId, columnId, urgent } });
    return board;
  },
  async updateBoardCard(id, patch) {
    const { board } = await request(`/api/board/cards/${id}`, { method: 'PATCH', json: patch });
    return board;
  },
  async getBoard() {
    const { board } = await request('/api/board');
    return board;
  },
  async saveBoard(columns) {
    const { board } = await request('/api/board', { method: 'PUT', json: { columns } });
    return board;
  },

  // --- Search ---
  async search(q) {
    const { results } = await request(`/api/search?q=${encodeURIComponent(q)}`);
    return results;
  },

  // --- Trash (soft delete) ---
  async listTrash() {
    return request('/api/trash');
  },
  async restoreTrash(trashId) {
    return request(`/api/trash/${trashId}/restore`, { method: 'POST' });
  },
  async purgeTrash(trashId) {
    return request(`/api/trash/${trashId}`, { method: 'DELETE' });
  },
  async emptyTrash() {
    return request('/api/trash', { method: 'DELETE' });
  },

  // --- Export / Import ---
  exportUrl: '/api/export',
  async importLibrary(file) {
    const fd = new FormData();
    fd.append('archive', file);
    return request('/api/import', { method: 'POST', body: fd });
  },

  // --- App settings (dashboard banner, …) ---
  async getSettings() {
    const { settings } = await request('/api/settings');
    if (settings?.imageUploads) rememberPrefs(settings.imageUploads);
    return settings;
  },
  async updateSettings(patch) {
    const { settings } = await request('/api/settings', { method: 'PATCH', json: patch });
    if (settings?.imageUploads) rememberPrefs(settings.imageUploads);
    return settings;
  },
  // Saves and what was added per day (the dashboard's activity map) → [{ date, saves, refs, plans, mockups, inbox }].
  async getActivity(days = 182) {
    const { days: list } = await request(`/api/activity?days=${days}`);
    return list;
  },
  // --- Clients ---
  async listClients() { const { clients } = await request('/api/clients'); return clients; },
  async getClient(id) { const { client } = await request(`/api/clients/${id}`); return client; },
  async createClient(body) { return request('/api/clients', { method: 'POST', json: body }); }, // → { client, existed }
  async updateClient(id, patch) { const { client } = await request(`/api/clients/${id}`, { method: 'PATCH', json: patch }); return client; },
  async removeClient(id) { return request(`/api/clients/${id}`, { method: 'DELETE' }); }, // → { trashId }
  async setClientLogo(id, file) {
    const { client } = await request(`/api/clients/${id}/logo`, { method: 'POST', ...picBody('logo', file, imageName('logo', file)), pictures: true });
    return client;
  },
  async removeClientLogo(id) { const { client } = await request(`/api/clients/${id}/logo`, { method: 'DELETE' }); return client; },
  // Invoice PDFs; `fields` (number, date, amount, status, planId, note) go with a single file. → { client, invoices }
  async addInvoices(id, files, fields = {}) {
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    for (const [k, v] of Object.entries(fields)) if (v != null && v !== '') fd.append(k, v);
    return request(`/api/clients/${id}/invoices`, { method: 'POST', body: fd });
  },
  async updateInvoice(id, invoiceId, patch) { return request(`/api/clients/${id}/invoices/${invoiceId}`, { method: 'PATCH', json: patch }); }, // → { client, invoice }
  async removeInvoice(id, invoiceId) { return request(`/api/clients/${id}/invoices/${invoiceId}`, { method: 'DELETE' }); }, // → { client, trashId }

  // --- Notes ---
  async listNotes() { const { notes } = await request('/api/notes'); return notes; },
  async getNote(id) { const { note } = await request(`/api/notes/${id}`); return note; },
  async createNote(body = {}) { const { note } = await request('/api/notes', { method: 'POST', json: body }); return note; },
  async updateNote(id, patch) { const { note } = await request(`/api/notes/${id}`, { method: 'PATCH', json: patch }); return note; },
  async removeNote(id) { return request(`/api/notes/${id}`, { method: 'DELETE' }); }, // → { trashId }
  async removeNoteIfEmpty(id) { return request(`/api/notes/${id}?ifEmpty=1`, { method: 'DELETE' }); }, // no Trash; a note with anything in it stays
  // Pictures: Files, or { source } for one that's already in the app. → { note, images }
  async addNoteImages(id, files) {
    if (files && !Array.isArray(files) && files.source) return request(`/api/notes/${id}/images`, { method: 'POST', json: { source: files.source } });
    const fd = new FormData();
    for (const f of files) fd.append('images', f, f.name || 'pasted.png');
    return request(`/api/notes/${id}/images`, { method: 'POST', body: fd, pictures: true });
  },
  async removeNoteImage(id, imageId) { return request(`/api/notes/${id}/images/${imageId}`, { method: 'DELETE' }); }, // → { note, trashId }

  // --- Content (posts planned for social media) ---
  async listContent() { const { items } = await request('/api/content'); return items; },
  async getContent(id) { const { item } = await request(`/api/content/${id}`); return item; },
  async createContent(body = {}) { const { item } = await request('/api/content', { method: 'POST', json: body }); return item; },
  async updateContent(id, patch) { const { item } = await request(`/api/content/${id}`, { method: 'PATCH', json: patch }); return item; },
  async duplicateContent(id) { const { item } = await request(`/api/content/${id}/duplicate`, { method: 'POST' }); return item; },
  async removeContent(id) { return request(`/api/content/${id}`, { method: 'DELETE' }); }, // → { trashId }
  /** A post made from a project / storyboard / mockup / reference: { kind: 'plan' | 'storyboard' | 'mockup' | 'project', … } */
  async createContentFrom(from, extra = {}) { const { item } = await request('/api/content/from', { method: 'POST', json: { from, ...extra } }); return item; },
  async listContentLibrary() { const { items } = await request('/api/content-library'); return items; },
  async saveContentSnippet(body) { return request('/api/content-library', { method: 'POST', json: body }); }, // → { item, existed }
  async updateContentSnippet(id, patch) { const { item } = await request(`/api/content-library/${id}`, { method: 'PATCH', json: patch }); return item; },
  async removeContentSnippet(id) { return request(`/api/content-library/${id}`, { method: 'DELETE' }); }, // → { trashId }
  async removeContentIfEmpty(id) { return request(`/api/content/${id}?ifEmpty=1`, { method: 'DELETE' }); }, // no Trash; a post with anything in it stays
  // Pictures / videos: Files, or { source } for one that's already in the app. → { item, media }
  async addContentMedia(id, files) {
    if (files && !Array.isArray(files) && files.source) return request(`/api/content/${id}/media`, { method: 'POST', json: { source: files.source } });
    const fd = new FormData();
    for (const f of files) fd.append('media', f, f.name || 'pasted.png');
    return request(`/api/content/${id}/media`, { method: 'POST', body: fd, pictures: true });
  },
  async removeContentMedia(id, mediaId) { return request(`/api/content/${id}/media/${mediaId}`, { method: 'DELETE' }); }, // → { item, trashId }

  // --- Expenses (what the business costs) ---
  async listExpenses() { return request('/api/expenses'); }, // → { expenses, income, finance, invoices, clients, currency }
  async createExpense(body) { const { expense } = await request('/api/expenses', { method: 'POST', json: body }); return expense; },
  async updateExpense(id, patch) { const { expense } = await request(`/api/expenses/${id}`, { method: 'PATCH', json: patch }); return expense; },
  async removeExpense(id) { return request(`/api/expenses/${id}`, { method: 'DELETE' }); }, // → { trashId }
  // Receipts (kept as they are — not made smaller). Without `date` each finds its payment. → { expense, receipts }
  async addReceipts(id, files, date = null) {
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    if (date) fd.append('date', date);
    return request(`/api/expenses/${id}/receipts`, { method: 'POST', body: fd });
  },
  async updateReceipt(id, receiptId, patch) { return request(`/api/expenses/${id}/receipts/${receiptId}`, { method: 'PATCH', json: patch }); }, // → { expense }
  async removeReceipt(id, receiptId) { return request(`/api/expenses/${id}/receipts/${receiptId}`, { method: 'DELETE' }); }, // → { expense, trashId }
  expenseFileUrl: (e, rel) => `/data/expense/${e.id}/${rel}`,
  expenseReceiptsUrl: (year, lang = 'de') => `/api/expenses/receipts.zip?year=${year}&lang=${lang}`,
  async createIncome(body) { const { income } = await request('/api/income', { method: 'POST', json: body }); return income; },
  async updateIncome(id, patch) { const { income } = await request(`/api/income/${id}`, { method: 'PATCH', json: patch }); return income; },
  async removeIncome(id) { return request(`/api/income/${id}`, { method: 'DELETE' }); }, // → { trashId }
  expensesExportUrl: (year, lang = 'de') => `/api/expenses/export.xlsx?year=${year}&lang=${lang}`,
  // --- Presentations (decks: proposals, brand identities, case studies) ---
  async listPresentations() { return request('/api/presentations'); }, // → { presentations, defaults }
  async presentationTemplates() { return request('/api/presentations/templates'); }, // → { templates (built in), own }
  async saveDeckTemplate(id, body = {}) { const { template } = await request(`/api/presentations/${id}/template`, { method: 'POST', json: body }); return template; },
  async updateDeckTemplate(id, patch) { const { template } = await request(`/api/presentation-templates/${id}`, { method: 'PATCH', json: patch }); return template; },
  async removeDeckTemplate(id) { return request(`/api/presentation-templates/${id}`, { method: 'DELETE' }); }, // → { trashId }
  // A case study from a project ('plan') or a reference ('project'): → { title, text, facts, image, images }
  async caseFrom(id, kind, sourceId) { return request(`/api/presentations/${id}/case-from`, { method: 'POST', json: { kind, id: sourceId } }); },
  async getPresentation(id) { const { presentation } = await request(`/api/presentations/${id}`); return presentation; },
  async createPresentation(body) { const { presentation } = await request('/api/presentations', { method: 'POST', json: body }); return presentation; },
  async updatePresentation(id, patch) { const { presentation } = await request(`/api/presentations/${id}`, { method: 'PATCH', json: patch }); return presentation; },
  // A picture for a slide: a File, or { source } — one already in the app. → { file, name }
  async addPresentationImage(id, pic) {
    return request(`/api/presentations/${id}/images`, { method: 'POST', ...picBody('file', pic), pictures: true });
  },
  async duplicatePresentation(id) { const { presentation } = await request(`/api/presentations/${id}/duplicate`, { method: 'POST' }); return presentation; },
  async savePresentationDefaults(id) { const { defaults } = await request(`/api/presentations/${id}/defaults`, { method: 'POST' }); return defaults; },
  async removePresentation(id) { return request(`/api/presentations/${id}`, { method: 'DELETE' }); }, // → { trashId }
  // --- Achievements ---
  async getAchievements() { return request('/api/achievements'); }, // → { achievements, stats, metrics, unlocked, ideas }
  async createAchievement(body) { return request('/api/achievements', { method: 'POST', json: body }); }, // → { achievement, unlocked }
  async updateAchievement(id, patch) { return request(`/api/achievements/${id}`, { method: 'PATCH', json: patch }); }, // → { achievement, unlocked }
  async removeAchievement(id) { return request(`/api/achievements/${id}`, { method: 'DELETE' }); }, // → { trashId }
  // The icon picture or the sticker ('icon' | 'sticker'): a File or { source }. → { achievement }
  async setAchievementImage(id, slot, pic) {
    return request(`/api/achievements/${id}/image?slot=${slot}`, { method: 'POST', ...picBody('image', pic, imageName(slot, pic)), pictures: true });
  },
  async removeAchievementImage(id, slot) { return request(`/api/achievements/${id}/image?slot=${slot}`, { method: 'DELETE' }); },
  async updateAchievementStats(patch) { return request('/api/achievement-stats', { method: 'PATCH', json: patch }); }, // → like getAchievements
  async addQuestPack() { return request('/api/achievements/starter', { method: 'POST' }); }, // the Special Quests pack → like getAchievements + { added }
  async setAchievementDates(dates) { return request('/api/achievements/dates', { method: 'POST', json: { dates } }); }, // { id: 'YYYY-MM-DD' } → like getAchievements
  async arrangeAchievements(group, ids) { return request('/api/achievements/arrange', { method: 'POST', json: { group, ids } }); },
  async renameAchievementGroup(from, to) { return request('/api/achievements/group', { method: 'POST', json: { from, to } }); },
  async orderAchievementGroups(groups) { return request('/api/achievements/group-order', { method: 'POST', json: { groups } }); },
  async addAchievements(items) { return request('/api/achievements/batch', { method: 'POST', json: { items } }); }, // → like getAchievements + { added }

  // --- Time tracker ---
  // → { entries, running, activities } — all, or one project's / client's ({ plan } / { client }).
  async getTime(q) {
    const query = typeof q === 'string' ? { plan: q } : q || {};
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v)).toString();
    return request(`/api/time${qs ? `?${qs}` : ''}`);
  },
  async addTimeEntry(entry) { const { entry: e } = await request('/api/time/entries', { method: 'POST', json: entry }); return e; },
  async updateTimeEntry(id, patch) { const { entry } = await request(`/api/time/entries/${id}`, { method: 'PATCH', json: patch }); return entry; },
  async removeTimeEntry(id) { return request(`/api/time/entries/${id}`, { method: 'DELETE' }); }, // → { trashId }
  async timeStart(body) { return request('/api/time/start', { method: 'POST', json: body }); },
  async timeUpdateRunning(patch) { return request('/api/time/running', { method: 'PATCH', json: patch }); },
  async timePause(at) { return request('/api/time/pause', { method: 'POST', json: at ? { at } : {} }); },
  async timeResume() { return request('/api/time/resume', { method: 'POST' }); },
  async timeStop(body) { return request('/api/time/stop', { method: 'POST', json: body }); }, // → { entry, running, activities }
  async setTimeActivities(activities) { return request('/api/time/activities', { method: 'PUT', json: { activities } }); },
  timeExportUrl(q) { return `/api/time/export.xlsx?${new URLSearchParams(Object.entries(q).filter(([, v]) => v))}`; },
  // A finished focus-timer session → today's focus minutes.
  async addFocusMinutes(minutes) {
    return request('/api/activity/focus', { method: 'POST', json: { minutes } });
  },
  // What you changed last → [{ key, kind, title, sub, href, thumb, gradient, emoji, avatar, t }].
  async recent(limit = 8) {
    const { items } = await request(`/api/recent?limit=${limit}`);
    return items;
  },
  // Tick / untick one to-do of a plan's to-do block → plan.
  async setTodoDone(planId, blockId, itemId, done) {
    const { plan } = await request(`/api/plans/${planId}/blocks/${blockId}/items/${itemId}`, { method: 'PATCH', json: { done } });
    return plan;
  },
  async setDashboardBanner(file) {
    const { settings } = await request('/api/settings/dashboard-banner', { method: 'POST', ...picBody('banner', file, imageName('banner', file)), pictures: true });
    return settings;
  },
  async removeDashboardBanner() {
    const { settings } = await request('/api/settings/dashboard-banner', { method: 'DELETE' });
    return settings;
  },

  // --- Library maintenance (data format + unused files) ---
  async maintenanceStatus() {
    return request('/api/maintenance');
  },
  async migrate() {
    return request('/api/maintenance/migrate', { method: 'POST' });
  },
  // Stored pictures made smaller afterwards: the big ones, then one swapped for its smaller version.
  async scanPictures(minKB = 500) { return request(`/api/maintenance/pictures?min=${minKB}`); }, // → { count, bytes, items, areas }
  async replacePicture(rel, batch, file) {
    const fd = new FormData(); fd.append('rel', rel); fd.append('batch', batch); fd.append('file', file, file.name);
    return request('/api/maintenance/pictures/replace', { method: 'POST', body: fd }); // → { rel, before, after }
  },
  async scanUnused() {
    return request('/api/maintenance/unused');
  },
  async trashUnused(rels) {
    return request('/api/maintenance/unused', { method: 'POST', json: rels ? { rels } : {} });
  },

  // --- Storage ---
  async storage() {
    return request('/api/storage');
  },
  async setStorageLimit(limitBytes) {
    return request('/api/storage', { method: 'PATCH', json: { limitBytes } });
  },
};

// Resolve a stored relative file path to a servable URL.
export function fileUrl(project, relPath) {
  if (!relPath) return null;
  return `/data/${project.type}/${project.id}/${relPath}`;
}

// Plan files live under data/plan/<id>/…
export const mockupFileUrl = (m, rel) => (rel ? `/data/mockup/${m.id}/${rel}` : null);
export const mockupModelUrl = (model) => (model?.file ? `/data/mockup-model/${model.id}/${model.file}` : null);
export const mockupHdriUrl = (h, file = h?.file) => (file ? `/data/mockup-hdri/${h.id}/${file}` : null);

export const clientFileUrl = (c, rel) => (c && rel ? `/data/client/${c.id}/${rel}` : null);
export const noteFileUrl = (n, rel) => (n && rel ? `/data/note/${n.id}/${rel}` : null);
export const contentFileUrl = (c, rel) => (c && rel ? `/data/content/${c.id}/${rel}` : null);
export const achievementFileUrl = (a, rel) => (a && rel ? `/data/achievement/${a.id}/${rel}` : null);

export function planFileUrl(plan, relPath) {
  if (!relPath) return null;
  return `/data/plan/${plan.id}/${relPath}`;
}

// Software files (plugin installers, scripts) live under data/software/<id>/…
export function softwareFileUrl(softwareId, fileName) {
  if (!fileName) return null;
  return `/data/software/${softwareId}/${fileName}`;
}

// Dashboard banner lives under data/dashboard/…
export function dashboardFileUrl(fileName) {
  if (!fileName) return null;
  return `/data/dashboard/${fileName}`;
}
