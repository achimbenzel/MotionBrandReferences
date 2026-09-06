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
  async addMoodboard(id, name) {
    const { plan } = await handle(await fetch(`/api/plans/${id}/moodboards`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    }));
    return plan;
  },
  async updateMoodboard(id, mbId, patch) {
    const { plan } = await handle(await fetch(`/api/plans/${id}/moodboards/${mbId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    }));
    return plan;
  },
  async removeMoodboard(id, mbId) {
    const { plan } = await handle(await fetch(`/api/plans/${id}/moodboards/${mbId}`, { method: 'DELETE' }));
    return plan;
  },
  async addMoodboardImages(id, mbId, fileList) {
    const fd = new FormData();
    Array.from(fileList).forEach((f) => fd.append('images', f));
    const { plan } = await handle(await fetch(`/api/plans/${id}/moodboards/${mbId}/images`, { method: 'POST', body: fd }));
    return plan;
  },
  async removeMoodboardImage(id, mbId, imgId) {
    const { plan } = await handle(await fetch(`/api/plans/${id}/moodboards/${mbId}/images/${imgId}`, { method: 'DELETE' }));
    return plan;
  },

  // --- Export / Import ---
  exportUrl: '/api/export',
  async importLibrary(file) {
    const fd = new FormData();
    fd.append('archive', file);
    return handle(await fetch('/api/import', { method: 'POST', body: fd }));
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
