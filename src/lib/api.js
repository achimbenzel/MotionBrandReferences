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
};

// Resolve a stored relative file path to a servable URL.
export function fileUrl(project, relPath) {
  if (!relPath) return null;
  return `/data/${project.type}/${project.id}/${relPath}`;
}
