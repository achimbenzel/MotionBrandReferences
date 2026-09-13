// Thin fetch wrapper around the local backend.
// All uploaded files are referenced by URLs under /data (proxied to the API
// in dev, same-origin in production).

async function handle(res) {
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).message || (await res.json()).error || msg; } catch { /* ignore */ }
    throw new Error(`${res.status} ${msg}`);
  }
  return res.json();
}

export const api = {
  async list(type) {
    const q = type ? `?type=${encodeURIComponent(type)}` : '';
    const { projects } = await handle(await fetch(`/api/projects${q}`));
    return projects;
  },

  async get(id) {
    const { project } = await handle(await fetch(`/api/projects/${id}`));
    return project;
  },

  async create(formData) {
    const { project } = await handle(await fetch('/api/projects', { method: 'POST', body: formData }));
    return project;
  },

  async update(id, patch) {
    const { project } = await handle(await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }));
    return project;
  },

  async remove(id) {
    return handle(await fetch(`/api/projects/${id}`, { method: 'DELETE' }));
  },

  async addFrame(id, blob, t) {
    const fd = new FormData();
    fd.append('frame', blob, 'frame.webp');
    fd.append('t', String(t));
    const { project } = await handle(await fetch(`/api/projects/${id}/frames`, { method: 'POST', body: fd }));
    return project;
  },

  async removeFrame(id, frameId) {
    const { project } = await handle(await fetch(`/api/projects/${id}/frames/${frameId}`, { method: 'DELETE' }));
    return project;
  },

  async setThumb(id, blob, meta) {
    const fd = new FormData();
    fd.append('thumb', blob, 'thumb.webp');
    if (meta) fd.append('thumbMeta', JSON.stringify(meta));
    const { project } = await handle(await fetch(`/api/projects/${id}/thumb`, { method: 'POST', body: fd }));
    return project;
  },

  // --- Galleries ---
  async listGalleries(type) {
    const q = type ? `?type=${encodeURIComponent(type)}` : '';
    const { galleries } = await handle(await fetch(`/api/galleries${q}`));
    return galleries;
  },
  async getGallery(id) {
    const { gallery } = await handle(await fetch(`/api/galleries/${id}`));
    return gallery;
  },
  async createGallery(type, name) {
    const { gallery } = await handle(await fetch('/api/galleries', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, name }),
    }));
    return gallery;
  },
  async updateGallery(id, patch) {
    const { gallery } = await handle(await fetch(`/api/galleries/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    }));
    return gallery;
  },
  async removeGallery(id) {
    return handle(await fetch(`/api/galleries/${id}`, { method: 'DELETE' }));
  },

  // --- Plans (Plan mode) ---
  async listPlans() {
    const { plans } = await handle(await fetch('/api/plans'));
    return plans;
  },
  async getPlan(id) {
    const { plan } = await handle(await fetch(`/api/plans/${id}`));
    return plan;
  },
  async createPlan(name) {
    const { plan } = await handle(await fetch('/api/plans', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    }));
    return plan;
  },
  async updatePlan(id, patch) {
    const { plan } = await handle(await fetch(`/api/plans/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    }));
    return plan;
  },
  async removePlan(id) {
    return handle(await fetch(`/api/plans/${id}`, { method: 'DELETE' }));
  },
  async setPlanImage(id, kind, file) { // kind: 'banner' | 'avatar'
    const fd = new FormData();
    fd.append(kind, file, `${kind}.img`);
    const { plan } = await handle(await fetch(`/api/plans/${id}/${kind}`, { method: 'POST', body: fd }));
    return plan;
  },
  async removePlanImage(id, kind) {
    const { plan } = await handle(await fetch(`/api/plans/${id}/${kind}`, { method: 'DELETE' }));
    return plan;
  },
  // --- Plan content blocks (moodboard / text / todos / files) ---
  async addBlock(id, type) {
    const { plan } = await handle(await fetch(`/api/plans/${id}/blocks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type }),
    }));
    return plan;
  },
  async updateBlock(id, blockId, patch) {
    const { plan } = await handle(await fetch(`/api/plans/${id}/blocks/${blockId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    }));
    return plan;
  },
  async moveBlock(id, blockId, dir) {
    const { plan } = await handle(await fetch(`/api/plans/${id}/blocks/${blockId}/move`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dir }),
    }));
    return plan;
  },
  async removeBlock(id, blockId) {
    const { plan } = await handle(await fetch(`/api/plans/${id}/blocks/${blockId}`, { method: 'DELETE' }));
    return plan;
  },
  async addBlockFiles(id, blockId, fileList) {
    const fd = new FormData();
    Array.from(fileList).forEach((f) => fd.append('files', f));
    const { plan } = await handle(await fetch(`/api/plans/${id}/blocks/${blockId}/files`, { method: 'POST', body: fd }));
    return plan;
  },
  // Add one file to a files block, with an optional example image + title.
  async addBlockFile(id, blockId, { file, example, title }) {
    const fd = new FormData();
    fd.append('file', file);
    if (example) fd.append('example', example);
    if (title) fd.append('title', title);
    const { plan } = await handle(await fetch(`/api/plans/${id}/blocks/${blockId}/file`, { method: 'POST', body: fd }));
    return plan;
  },
  async removeBlockFile(id, blockId, fileId) {
    return handle(await fetch(`/api/plans/${id}/blocks/${blockId}/files/${fileId}`, { method: 'DELETE' }));
  },

  // --- Software (plugin DB / expressions / tutorials) ---
  async listSoftware() {
    const { software } = await handle(await fetch('/api/software'));
    return software;
  },
  async getSoftware(id) {
    const { software } = await handle(await fetch(`/api/software/${id}`));
    return software;
  },
  async createSoftware(name, avatarEmoji) {
    const { software } = await handle(await fetch('/api/software', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, avatarEmoji }),
    }));
    return software;
  },
  async updateSoftware(id, patch) {
    const { software } = await handle(await fetch(`/api/software/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    }));
    return software;
  },
  async removeSoftware(id) {
    return handle(await fetch(`/api/software/${id}`, { method: 'DELETE' }));
  },
  // Software banner / avatar images (like plans). kind: 'banner' | 'avatar'
  async setSoftwareImage(id, kind, file) {
    const fd = new FormData(); fd.append(kind, file, `${kind}.img`);
    const { software } = await handle(await fetch(`/api/software/${id}/${kind}`, { method: 'POST', body: fd }));
    return software;
  },
  async removeSoftwareImage(id, kind) {
    const { software } = await handle(await fetch(`/api/software/${id}/${kind}`, { method: 'DELETE' }));
    return software;
  },
  // Plugin installer file
  async setPluginFile(id, pluginId, file) {
    const fd = new FormData(); fd.append('file', file);
    const { software } = await handle(await fetch(`/api/software/${id}/plugins/${pluginId}/file`, { method: 'POST', body: fd }));
    return software;
  },
  async removePluginFile(id, pluginId) {
    const { software } = await handle(await fetch(`/api/software/${id}/plugins/${pluginId}/file`, { method: 'DELETE' }));
    return software;
  },
  // Plugin preview image (shown in the card view)
  async setPluginImage(id, pluginId, file) {
    const fd = new FormData(); fd.append('image', file);
    const { software } = await handle(await fetch(`/api/software/${id}/plugins/${pluginId}/image`, { method: 'POST', body: fd }));
    return software;
  },
  async removePluginImage(id, pluginId) {
    const { software } = await handle(await fetch(`/api/software/${id}/plugins/${pluginId}/image`, { method: 'DELETE' }));
    return software;
  },
  // Expression-group preview image
  async setGroupImage(id, groupId, file) {
    const fd = new FormData(); fd.append('image', file);
    const { software } = await handle(await fetch(`/api/software/${id}/groups/${groupId}/image`, { method: 'POST', body: fd }));
    return software;
  },
  async removeGroupImage(id, groupId) {
    const { software } = await handle(await fetch(`/api/software/${id}/groups/${groupId}/image`, { method: 'DELETE' }));
    return software;
  },

  // --- To-Do board (global Kanban planner) ---
  async getBoard() {
    const { board } = await handle(await fetch('/api/board'));
    return board;
  },
  async saveBoard(columns) {
    const { board } = await handle(await fetch('/api/board', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ columns }),
    }));
    return board;
  },

  // --- Search ---
  async search(q) {
    const { results } = await handle(await fetch(`/api/search?q=${encodeURIComponent(q)}`));
    return results;
  },

  // --- Trash (soft delete) ---
  async listTrash() {
    return handle(await fetch('/api/trash'));
  },
  async restoreTrash(trashId) {
    return handle(await fetch(`/api/trash/${trashId}/restore`, { method: 'POST' }));
  },
  async purgeTrash(trashId) {
    return handle(await fetch(`/api/trash/${trashId}`, { method: 'DELETE' }));
  },
  async emptyTrash() {
    return handle(await fetch('/api/trash', { method: 'DELETE' }));
  },

  // --- Export / Import ---
  exportUrl: '/api/export',
  async importLibrary(file) {
    const fd = new FormData();
    fd.append('archive', file);
    return handle(await fetch('/api/import', { method: 'POST', body: fd }));
  },

  // --- App settings (dashboard banner, …) ---
  async getSettings() {
    const { settings } = await handle(await fetch('/api/settings'));
    return settings;
  },
  async updateSettings(patch) {
    const { settings } = await handle(await fetch('/api/settings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    }));
    return settings;
  },
  async setDashboardBanner(file) {
    const fd = new FormData(); fd.append('banner', file, 'banner.img');
    const { settings } = await handle(await fetch('/api/settings/dashboard-banner', { method: 'POST', body: fd }));
    return settings;
  },
  async removeDashboardBanner() {
    const { settings } = await handle(await fetch('/api/settings/dashboard-banner', { method: 'DELETE' }));
    return settings;
  },

  // --- Storage ---
  async storage() {
    return handle(await fetch('/api/storage'));
  },
  async setStorageLimit(limitBytes) {
    return handle(await fetch('/api/storage', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limitBytes }),
    }));
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
