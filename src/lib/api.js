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

// fetch() + CSRF header + JSON encoding + error handling in one place.
function request(url, { method = 'GET', json, body } = {}) {
  const headers = { ...BASE_HEADERS };
  let payload = body;
  if (json !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(json); }
  const keepalive = keepaliveMode && (payload == null || (typeof payload === 'string' && payload.length < 60000));
  return fetch(url, { method, headers, body: payload, keepalive }).then(handle);
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
  async createPlan(name) {
    const { plan } = await request('/api/plans', { method: 'POST', json: { name } });
    return plan;
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
    fd.append(kind, file, `${kind}.img`);
    const { plan } = await request(`/api/plans/${id}/${kind}`, { method: 'POST', body: fd });
    return plan;
  },
  async removePlanImage(id, kind) {
    const { plan } = await request(`/api/plans/${id}/${kind}`, { method: 'DELETE' });
    return plan;
  },
  // --- Plan content blocks (moodboard / text / todos / files) ---
  async addBlock(id, type) {
    const { plan } = await request(`/api/plans/${id}/blocks`, { method: 'POST', json: { type } });
    return plan;
  },
  async updateBlock(id, blockId, patch) {
    const { plan } = await request(`/api/plans/${id}/blocks/${blockId}`, { method: 'PATCH', json: patch });
    return plan;
  },
  async moveBlock(id, blockId, dir) {
    const { plan } = await request(`/api/plans/${id}/blocks/${blockId}/move`, { method: 'POST', json: { dir } });
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
    const fd = new FormData(); fd.append(kind, file, `${kind}.img`);
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
    const fd = new FormData(); fd.append('banner', file, 'banner.img');
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
