// Thin fetch wrapper around the local backend.
// All uploaded files are referenced by URLs under /data (proxied to the API
// in dev, same-origin in production).

// Every request carries this header; the server rejects state-changing calls
// without it, which stops other websites from posting to your library (CSRF).
const BASE_HEADERS = { 'X-Requested-With': 'confinium' };

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
async function request(url, { method = 'GET', json, body } = {}) {
  const headers = { ...BASE_HEADERS };
  let payload = body;
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
    const { project } = await request('/api/projects', { method: 'POST', body: formData });
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
  async createPlan({ name, client, template } = {}) {
    const { plan } = await request('/api/plans', { method: 'POST', json: { name, client, template } });
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
    const { items } = await request('/api/inbox', { method: 'POST', body: fd });
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
    const { mockup } = await request(`/api/mockups/${id}/content${item ? `?item=${encodeURIComponent(item)}` : ''}`, { method: 'POST', body: fd });
    return mockup;
  },
  async importMockupContent(id, source, item) { const { mockup } = await request(`/api/mockups/${id}/content/import${item ? `?item=${encodeURIComponent(item)}` : ''}`, { method: 'POST', json: { source } }); return mockup; },
  async clearMockupContent(id, item) { const { mockup } = await request(`/api/mockups/${id}/content${item ? `?item=${encodeURIComponent(item)}` : ''}`, { method: 'DELETE' }); return mockup; },
  // A picture in a 2D mockup's slot (avatar, banner, media-0 …).
  // (a 3D object's printed face: pass the device as `item`)
  async setMockupSlot(id, slot, file, item) {
    const fd = new FormData();
    fd.append('file', file, file.name || 'picture.png');
    const { mockup } = await request(`/api/mockups/${id}/content?${slotQuery(slot, item)}`, { method: 'POST', body: fd });
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
  async setPlanImage(id, kind, file) { // kind: 'banner' | 'avatar'
    const fd = new FormData();
    fd.append(kind, file, imageName(kind, file));
    const { plan } = await request(`/api/plans/${id}/${kind}`, { method: 'POST', body: fd });
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
  async uploadBlockFiles(id, blockId, fileList) {
    const fd = new FormData();
    Array.from(fileList).forEach((f) => fd.append('files', f));
    const { files } = await request(`/api/plans/${id}/blocks/${blockId}/uploads`, { method: 'POST', body: fd });
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
  // Moves the block (and its files) to Trash → { plan, trashId }.
  async removeBlock(id, blockId) {
    return request(`/api/plans/${id}/blocks/${blockId}`, { method: 'DELETE' });
  },
  async addBlockFiles(id, blockId, fileList) {
    const fd = new FormData();
    Array.from(fileList).forEach((f) => fd.append('files', f));
    const { plan } = await request(`/api/plans/${id}/blocks/${blockId}/files`, { method: 'POST', body: fd });
    return plan;
  },
  // Add one file to a files block, with an optional example image + title.
  async addBlockFile(id, blockId, { file, example, title }) {
    const fd = new FormData();
    fd.append('file', file);
    if (example) fd.append('example', example);
    if (title) fd.append('title', title);
    const { plan } = await request(`/api/plans/${id}/blocks/${blockId}/file`, { method: 'POST', body: fd });
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
    const fd = new FormData(); fd.append(kind, file, imageName(kind, file));
    const { software } = await request(`/api/software/${id}/${kind}`, { method: 'POST', body: fd });
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
    const fd = new FormData(); fd.append('image', file);
    const { software } = await request(`/api/software/${id}/plugins/${pluginId}/image`, { method: 'POST', body: fd });
    return software;
  },
  async removePluginImage(id, pluginId) {
    const { software } = await request(`/api/software/${id}/plugins/${pluginId}/image`, { method: 'DELETE' });
    return software;
  },
  // Expression-group preview image
  async setGroupImage(id, groupId, file) {
    const fd = new FormData(); fd.append('image', file);
    const { software } = await request(`/api/software/${id}/groups/${groupId}/image`, { method: 'POST', body: fd });
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
    return settings;
  },
  async updateSettings(patch) {
    const { settings } = await request('/api/settings', { method: 'PATCH', json: patch });
    return settings;
  },
  async setDashboardBanner(file) {
    const fd = new FormData(); fd.append('banner', file, imageName('banner', file));
    const { settings } = await request('/api/settings/dashboard-banner', { method: 'POST', body: fd });
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
