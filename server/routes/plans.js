// Plans (Work mode) — a header + timeframe, plus a list of content blocks.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { DATA_DIR, TRASH_DIR, TYPE_LABEL } from '../config.js';
import { readDB, mutateDB } from '../db.js';
import { moveInto, replaceImage, safeRm, moveToTrash, moveRelPaths, extOf } from '../files.js';
import { upload } from '../upload.js';
import {
  BLOCK_TYPES, BLOCK_TITLES, BLOCK_TABS, PLAN_STATUSES, STORYBOARD_ASPECTS, normalizeField, normalizeShot, normalizeAudio,
  normalizeLine, normalizeTarget, normalizePace, normalizeVersion, normalizeDeliverable, normTags, str,
} from '../schema.js';
import { STORYBOARD_TEMPLATES, storyboardTemplate, templateInfo } from '../storyboards.js';
import { BUILTIN_TEMPLATES, builtinTemplate, planFromTemplate, templateFromPlan, templateSummary } from '../templates.js';
import { createRouter } from '../http.js';

const router = createRouter();
export default router;

const planDir = (planId) => path.join(DATA_DIR, 'plan', planId);
const blockDir = (planId, blockId) => path.join(planDir(planId), 'blocks', blockId);
const findBlock = (plan, blockId) => (plan && Array.isArray(plan.blocks)) ? plan.blocks.find((b) => b.id === blockId) : null;

const PLAN_EDITABLE = ['name', 'start', 'end', 'milestones', 'bannerGradient', 'avatarEmoji', 'status', 'client'];

// Fields a briefing block starts with when added by hand.
const DEFAULT_BRIEFING = ['Product / company', 'Target audience', 'Key message', 'Call to action',
  'Deliverables', 'Must-haves / no-gos', 'Budget'];

router.get('/api/plans', async (_req, res) => {
  const db = await readDB();
  const plans = [...db.plans].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json({ plans });
});

router.get('/api/plans/:id', async (req, res) => {
  const db = await readDB();
  const plan = db.plans.find((p) => p.id === req.params.id);
  if (!plan) return res.status(404).json({ error: 'not_found' });
  res.json({ plan });
});

// A new plan is empty, or starts from a template (built-in or saved).
router.post('/api/plans', async (req, res) => {
  const templateId = req.body.template ? String(req.body.template) : '';
  const plan = await mutateDB((db) => {
    const t = templateId ? (builtinTemplate(templateId) || db.planTemplates.find((x) => x.id === templateId)) : null;
    if (templateId && !t) return null;
    const p = {
      id: nanoid(10),
      name: str(req.body.name || 'Untitled plan', 200).trim() || 'Untitled plan',
      client: str(req.body.client, 200).trim(),
      status: '',
      start: '',
      end: '',
      banner: null,
      bannerGradient: null,
      avatar: null,
      avatarEmoji: null,
      milestones: [],
      blocks: [],
      ...(t ? planFromTemplate(t) : {}),
      createdAt: Date.now(),
    };
    db.plans.push(p);
    return p;
  });
  if (!plan) return res.status(400).json({ error: 'unknown_template', message: 'That template no longer exists.' });
  res.status(201).json({ plan });
});

// --- Templates ---
router.get('/api/plan-templates', async (_req, res) => {
  const db = await readDB();
  res.json({
    templates: [
      ...BUILTIN_TEMPLATES.map((t) => templateSummary(t, true)),
      ...[...db.planTemplates].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).map((t) => templateSummary(t, false)),
    ],
  });
});

// Save a plan as a template. Saving under the name of one of your templates
// replaces it (that's how a template is updated).
router.post('/api/plan-templates', async (req, res) => {
  const name = str(req.body.name, 120).trim();
  if (!name) return res.status(400).json({ error: 'name_required', message: 'Give the template a name.' });
  const result = await mutateDB((db) => {
    const plan = db.plans.find((p) => p.id === req.body.planId);
    if (!plan) return null;
    const t = templateFromPlan(plan, name);
    const i = db.planTemplates.findIndex((x) => x.name.trim().toLowerCase() === name.toLowerCase());
    if (i === -1) db.planTemplates.push(t);
    else { t.id = db.planTemplates[i].id; t.createdAt = db.planTemplates[i].createdAt || t.createdAt; db.planTemplates[i] = t; }
    return { template: templateSummary(t, false), replaced: i !== -1 };
  });
  if (!result) return res.status(404).json({ error: 'not_found' });
  res.status(result.replaced ? 200 : 201).json(result);
});

router.delete('/api/plan-templates/:id', async (req, res) => {
  if (builtinTemplate(req.params.id)) return res.status(400).json({ error: 'builtin_template', message: 'Built-in templates can’t be deleted.' });
  const ok = await mutateDB((db) => {
    const i = db.planTemplates.findIndex((t) => t.id === req.params.id);
    if (i === -1) return false;
    db.planTemplates.splice(i, 1);
    return true;
  });
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

router.patch('/api/plans/:id', async (req, res) => {
  const updated = await mutateDB((db) => {
    const plan = db.plans.find((p) => p.id === req.params.id);
    if (!plan) return null;
    for (const k of PLAN_EDITABLE) {
      if (!(k in req.body)) continue;
      const v = req.body[k];
      if (k === 'milestones') { if (Array.isArray(v)) plan.milestones = v; }
      else if (k === 'status') { if (v === '' || v == null || PLAN_STATUSES.includes(v)) plan.status = v || ''; }
      else if (k === 'client') plan.client = str(v, 200);
      else plan[k] = v;
    }
    return plan;
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json({ plan: updated });
});

// Banner / avatar (Notion-style header images)
for (const kind of ['banner', 'avatar']) {
  router.post(`/api/plans/:id/${kind}`, upload.single(kind), async (req, res) => {
    const db = await readDB();
    const plan = db.plans.find((p) => p.id === req.params.id);
    if (!plan) return res.status(404).json({ error: 'not_found' });
    if (!req.file) return res.status(400).json({ error: 'file_required' });
    const stored = await replaceImage(planDir(plan.id), req.file.path, kind, req.file.originalname, plan[kind], '.png');
    const updated = await mutateDB((d) => {
      const p = d.plans.find((x) => x.id === plan.id);
      if (!p) return null;
      p[kind] = stored;
      if (kind === 'banner') p.bannerGradient = null;
      if (kind === 'avatar') p.avatarEmoji = null;
      return p;
    });
    if (!updated) return res.status(404).json({ error: 'not_found' });
    res.json({ plan: updated });
  });
  router.delete(`/api/plans/:id/${kind}`, async (req, res) => {
    let file = null;
    const updated = await mutateDB((db) => {
      const p = db.plans.find((x) => x.id === req.params.id);
      if (!p) return null;
      file = p[kind]; p[kind] = null;
      if (kind === 'banner') p.bannerGradient = null;
      if (kind === 'avatar') p.avatarEmoji = null;
      return p;
    });
    if (!updated) return res.status(404).json({ error: 'not_found' });
    if (file) await safeRm(path.join(planDir(req.params.id), path.basename(file)), { force: true }).catch(() => {});
    res.json({ plan: updated });
  });
}

// Add a library item (project or gallery) to a plan's references: into its
// first References block, or a new one at the end. Already there → unchanged.
router.post('/api/plans/:id/refs', async (req, res) => {
  const refKind = req.body.refKind === 'gallery' ? 'gallery' : 'project';
  const refId = str(req.body.refId, 40);
  const out = await mutateDB((db) => {
    const p = db.plans.find((x) => x.id === req.params.id);
    if (!p) return { status: 404 };
    const item = refKind === 'gallery' ? db.galleries.find((g) => g.id === refId) : db.projects.find((x) => x.id === refId);
    if (!item) return { status: 400 };
    let b = p.blocks.find((x) => x.type === 'refs');
    if (!b) { b = { id: nanoid(8), type: 'refs', title: 'References', items: [] }; p.blocks.push(b); }
    if (!Array.isArray(b.items)) b.items = [];
    if (b.items.some((r) => r.refKind === refKind && r.refId === refId)) return { plan: p, block: b, added: false };
    b.items.push({
      id: nanoid(6), refKind, refId, refType: item.type || null,
      title: (refKind === 'gallery' ? item.name : item.title) || 'Untitled',
      subtitle: refKind === 'gallery' ? `Gallery · ${TYPE_LABEL[item.type] || item.type}` : (item.category || TYPE_LABEL[item.type] || ''),
      thumb: refKind === 'project' && item.thumb ? `/data/${item.type}/${item.id}/${item.thumb}` : null,
    });
    return { plan: p, block: b, added: true };
  });
  if (out.status === 404) return res.status(404).json({ error: 'not_found' });
  if (out.status === 400) return res.status(400).json({ error: 'unknown_item', message: 'That item is no longer in your library.' });
  res.status(out.added ? 201 : 200).json({ plan: out.plan, blockId: out.block.id, added: out.added });
});

// Archive a finished plan into the library: the final video becomes a Motion
// project, chosen images / PDFs a Branding project, the palette a Colors
// project. Files are copied — the plan keeps everything. Each new project
// remembers its plan (fromPlan), the plan its projects (archivedAs).
const HEX = /^#[0-9a-f]{6}$/i;
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|ogv)$/i;
const ARCHIVE_ASSET_EXT = /\.(png|jpe?g|gif|webp|avif|svg|pdf)$/i;
router.post('/api/plans/:id/archive', async (req, res) => {
  const db = await readDB();
  const plan = db.plans.find((p) => p.id === req.params.id);
  if (!plan) return res.status(404).json({ error: 'not_found' });
  const pdir = planDir(plan.id);
  // Files are found by block + item id in the plan, never by a path from the request.
  const fileOf = (blockId, itemId) => {
    const b = findBlock(plan, blockId);
    if (!b) return null;
    const hit = (b.versions || []).find((x) => x.id === itemId) || (b.images || []).find((x) => x.id === itemId) || (b.files || []).find((x) => x.id === itemId);
    const rel = hit?.file;
    if (typeof rel !== 'string' || rel.includes('..') || !fs.existsSync(path.join(pdir, rel))) return null;
    return { rel, name: hit.name || hit.title || path.basename(rel) };
  };
  const base = {
    year: str(req.body.year || String(new Date().getFullYear()), 10),
    tags: normTags(req.body.tags),
    notes: `From the plan “${plan.name}”${plan.client ? ` for ${plan.client}` : ''}.`,
    fromPlan: plan.id,
    createdAt: Date.now(),
  };
  const created = [];
  const dirs = [];
  const newDir = async (type, id) => { const d = path.join(DATA_DIR, type, id); await fsp.mkdir(d, { recursive: true }); dirs.push(d); return d; };
  try {
    const m = req.body.motion;
    if (m) {
      const src = fileOf(m.blockId, m.itemId);
      if (!src || !VIDEO_EXT.test(src.rel)) return res.status(400).json({ error: 'file_missing', message: 'That video is no longer in the plan.' });
      const id = nanoid(10);
      const ext = extOf(src.rel) || '.mp4';
      await fsp.copyFile(path.join(pdir, src.rel), path.join(await newDir('motion', id), `video${ext}`));
      const n = (v, max) => { const x = Number(v); return Number.isFinite(x) && x > 0 && x <= max ? x : 0; };
      created.push({
        id, type: 'motion', title: str(m.title, 200).trim() || plan.name, category: str(m.category, 120) || 'Own work', ...base,
        video: `video${ext}`, duration: n(m.duration, 86400), width: Math.round(n(m.width, 20000)) || null, height: Math.round(n(m.height, 20000)) || null,
        frames: [], markers: [], segments: [],
      });
    }
    const br = req.body.branding;
    if (br && Array.isArray(br.items) && br.items.length) {
      const id = nanoid(10);
      const dir = await newDir('branding', id);
      const assets = [];
      for (const it of br.items.slice(0, 300)) {
        const src = fileOf(it?.blockId, it?.itemId);
        if (!src || !ARCHIVE_ASSET_EXT.test(src.rel)) continue; // images and PDFs only
        const ext = extOf(src.rel);
        const assetId = nanoid(6);
        await fsp.copyFile(path.join(pdir, src.rel), path.join(dir, `${assetId}${ext}`));
        assets.push({ id: assetId, kind: ext === '.pdf' ? 'pdf' : 'image', file: `${assetId}${ext}`, name: str(src.name, 200) });
      }
      if (assets.length) {
        created.push({
          id, type: 'branding', title: str(br.title, 200).trim() || plan.name, category: str(br.category, 120) || 'Own work', ...base,
          assets, thumb: assets.find((a) => a.kind === 'image')?.file || null,
        });
      }
    }
    const co = req.body.color;
    if (co && Array.isArray(co.colors)) {
      const colors = co.colors.filter((c) => HEX.test(c?.hex)).slice(0, 64).map((c) => ({
        id: nanoid(6), name: str(c.name, 80) || 'Color', source: 'hex', hex: c.hex.toUpperCase(),
        ...(c.rgb && typeof c.rgb === 'object' ? { rgb: c.rgb } : {}), ...(c.cmyk && typeof c.cmyk === 'object' ? { cmyk: c.cmyk } : {}),
        ...(typeof c.pantone === 'string' ? { pantone: str(c.pantone, 60), pantoneApprox: true } : {}),
      }));
      if (colors.length) {
        created.push({ id: nanoid(10), type: 'color', title: str(co.title, 200).trim() || `${plan.name} palette`, category: 'Palette', ...base, colors });
      }
    }
  } catch (err) {
    for (const d of dirs) await safeRm(d, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
  if (!created.length) {
    for (const d of dirs) await safeRm(d, { recursive: true, force: true }).catch(() => {});
    return res.status(400).json({ error: 'nothing_to_archive', message: 'Choose at least one thing to keep.' });
  }
  const updated = await mutateDB((d) => {
    d.projects.push(...created);
    const p = d.plans.find((x) => x.id === plan.id);
    if (!p) return null;
    p.archivedAs = [...(Array.isArray(p.archivedAs) ? p.archivedAs : []), ...created.map((c) => ({ id: c.id, type: c.type, title: c.title }))];
    if (req.body.archive) p.status = 'archived';
    return p;
  });
  res.status(201).json({ plan: updated, projects: created });
});

// --- Storyboards ---
router.get('/api/storyboard-templates', (_req, res) => {
  res.json({ templates: STORYBOARD_TEMPLATES.map(templateInfo) });
});

// A new storyboard in a plan: empty, from a template, or a copy of another
// storyboard of the plan (`from`; its frames and track are copied — e.g. to
// make a 9:16 version). Placed after `after` / the copied one, else at the end.
router.post('/api/plans/:id/storyboards', async (req, res) => {
  const db = await readDB();
  const plan = db.plans.find((p) => p.id === req.params.id);
  if (!plan) return res.status(404).json({ error: 'not_found' });
  const src = req.body.from ? findBlock(plan, req.body.from) : null;
  if (req.body.from && src?.type !== 'storyboard') return res.status(404).json({ error: 'not_found' });
  const tpl = !src && req.body.template ? storyboardTemplate(req.body.template) : null;
  if (!src && req.body.template && !tpl) return res.status(400).json({ error: 'unknown_template' });

  const id = nanoid(8);
  const asked = STORYBOARD_ASPECTS.includes(req.body.aspect) ? req.body.aspect : null;
  let title = str(req.body.title, 400).trim();
  let aspect = asked || tpl?.aspect || '16:9';
  let shots = [];
  let target = tpl?.target ?? null;
  let audio = null;
  if (tpl) shots = tpl.shots.map(([section, duration, visual]) => ({ section, duration, visual }));
  if (src) {
    const dir = blockDir(plan.id, id);
    const copy = async (rel) => {
      if (typeof rel !== 'string' || !rel.startsWith(`blocks/${src.id}/`) || rel.includes('..')) return null;
      const from = path.join(planDir(plan.id), rel);
      if (!fs.existsSync(from)) return null;
      const name = `${nanoid(8)}${extOf(rel)}`;
      await fsp.mkdir(dir, { recursive: true });
      await fsp.copyFile(from, path.join(dir, name));
      return `blocks/${id}/${name}`;
    };
    for (const s of src.shots || []) shots.push({ ...s, id: nanoid(6), image: await copy(s.image) });
    if (src.audio?.file) { const f = await copy(src.audio.file); if (f) audio = { ...src.audio, file: f }; }
    target = src.target ?? null;
    aspect = asked || src.aspect || '16:9';
    title = title || `${src.title || 'Storyboard'} (${aspect})`;
  }
  const block = {
    id, type: 'storyboard', title: title || tpl?.label.split(' · ')[0] || 'Storyboard', aspect,
    shots: shots.slice(0, 500).map((s) => normalizeShot(s, id)), audio: normalizeAudio(audio, id), target: normalizeTarget(target),
  };
  const updated = await mutateDB((d) => {
    const p = d.plans.find((x) => x.id === plan.id); if (!p) return null;
    const i = p.blocks.findIndex((b) => b.id === (req.body.after || src?.id));
    if (i === -1) p.blocks.push(block); else p.blocks.splice(i + 1, 0, block);
    return p;
  });
  if (!updated) {
    await safeRm(blockDir(plan.id, id), { recursive: true, force: true }).catch(() => {});
    return res.status(404).json({ error: 'not_found' });
  }
  res.status(201).json({ plan: updated, block });
});

// Copy pictures into a storyboard's folder: images of this plan (moodboards,
// files blocks) or frames / moments saved on Motion references. Items are
// named by id — never by path. Like uploads, only the files are stored; the
// page adds them to its shots. → { files: [{ file, name, label, key }] }
const FRAME_EXT = /\.(png|jpe?g|gif|webp|avif|svg)$/i;
const clock = (t) => { const s = Math.max(0, Math.floor(Number(t) || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
router.post('/api/plans/:id/blocks/:blockId/import', async (req, res) => {
  const db = await readDB();
  const plan = db.plans.find((p) => p.id === req.params.id);
  const b = findBlock(plan, req.params.blockId);
  if (!plan || b?.type !== 'storyboard') return res.status(404).json({ error: 'not_found' });
  const items = Array.isArray(req.body.items) ? req.body.items.slice(0, 100) : [];
  const dir = blockDir(plan.id, b.id);
  const files = [];
  for (const it of items) {
    let from = null; let name = ''; let label = '';
    if (it?.kind === 'plan') {
      const pb = findBlock(plan, it.blockId);
      const hit = (pb?.images || []).find((x) => x.id === it.itemId) || (pb?.files || []).find((x) => x.id === it.itemId);
      if (typeof hit?.file === 'string' && !hit.file.includes('..')) { from = path.join(planDir(plan.id), hit.file); name = hit.name || hit.title || ''; }
    } else if (it?.kind === 'frame' || it?.kind === 'moment') {
      const p = db.projects.find((x) => x.id === it.projectId && x.type === 'motion');
      const hit = it.kind === 'frame' ? (p?.frames || []).find((x) => x.id === it.itemId) : (p?.markers || []).find((x) => x.id === it.itemId);
      const rel = it.kind === 'frame' ? hit?.file : hit?.thumb;
      if (typeof rel === 'string' && !rel.includes('..')) {
        from = path.join(DATA_DIR, 'motion', p.id, rel);
        label = `${p.title || 'Motion'} · ${clock(hit.t)}${it.kind === 'moment' && hit.label ? ` · ${hit.label}` : ''}`;
      }
    }
    if (!from || !FRAME_EXT.test(from) || !fs.existsSync(from)) continue;
    const stored = `${nanoid(8)}${extOf(from)}`;
    await fsp.mkdir(dir, { recursive: true });
    await fsp.copyFile(from, path.join(dir, stored));
    files.push({ file: `blocks/${b.id}/${stored}`, name: str(name || path.basename(from), 200), label, key: `${it.kind}:${it.itemId}` });
  }
  res.status(201).json({ files });
});

// --- Content blocks ---
router.post('/api/plans/:id/blocks', async (req, res) => {
  const type = req.body.type;
  if (!BLOCK_TYPES.has(type)) return res.status(400).json({ error: 'invalid_block_type' });
  const base = { id: nanoid(8), type, title: BLOCK_TITLES[type], ...(BLOCK_TABS.includes(req.body.tab) ? { tab: req.body.tab } : {}) };
  const block = type === 'moodboard' ? { ...base, collapsed: false, images: [] }
    : type === 'text' ? { ...base, content: '' }
      : (type === 'todos' || type === 'links' || type === 'refs' || type === 'palette') ? { ...base, items: [] }
        : type === 'heading' ? { ...base, title: '', content: '' }
          : type === 'divider' ? { ...base }
            : type === 'table' ? { ...base, columns: [{ id: nanoid(6), name: '' }, { id: nanoid(6), name: '' }], rows: [] }
              : type === 'briefing' ? { ...base, fields: DEFAULT_BRIEFING.map((label) => normalizeField({ label })) }
                : type === 'storyboard' ? { ...base, aspect: '16:9', shots: [], audio: null, target: null }
                  : type === 'script' ? { ...base, pace: 2.5, target: null, lines: [normalizeLine({})] }
                    : type === 'review' ? { ...base, versions: [] }
                      : type === 'deliverables' ? { ...base, items: [] }
                      : { ...base, files: [] }; // files + pdf
  // Appended at the end, or right after `after` (a block id) when given.
  const updated = await mutateDB((db) => {
    const p = db.plans.find((x) => x.id === req.params.id); if (!p) return null;
    const i = req.body.after ? p.blocks.findIndex((b) => b.id === req.body.after) : -1;
    if (i === -1) p.blocks.push(block); else p.blocks.splice(i + 1, 0, block);
    return p;
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.status(201).json({ plan: updated, block });
});

// Update only the content/label fields — never the file arrays.
const BLOCK_EDITABLE = ['title', 'collapsed', 'content', 'items', 'columns', 'rows', 'fields',
  'shots', 'audio', 'aspect', 'target', 'lines', 'pace', 'versions', 'tab'];
router.patch('/api/plans/:id/blocks/:blockId', async (req, res) => {
  const updated = await mutateDB((db) => {
    const p = db.plans.find((x) => x.id === req.params.id); if (!p) return null;
    const b = findBlock(p, req.params.blockId); if (!b) return null;
    for (const k of BLOCK_EDITABLE) {
      if (!(k in req.body)) continue;
      const v = req.body[k];
      if (k === 'title' || k === 'content') b[k] = str(v, k === 'content' ? 200000 : 400);
      else if (k === 'collapsed') b[k] = !!v;
      else if (k === 'tab') { if (BLOCK_TABS.includes(v)) b.tab = v; }
      else if (k === 'fields') { if (Array.isArray(v)) b.fields = v.slice(0, 100).map(normalizeField); }
      else if (k === 'shots') { if (Array.isArray(v)) b.shots = v.slice(0, 500).map((x) => normalizeShot(x, b.id)); }
      else if (k === 'audio') b.audio = normalizeAudio(v, b.id);
      else if (k === 'aspect') { if (STORYBOARD_ASPECTS.includes(v)) b.aspect = v; }
      else if (k === 'target') b.target = normalizeTarget(v);
      else if (k === 'lines') { if (Array.isArray(v)) b.lines = v.slice(0, 500).map(normalizeLine); }
      else if (k === 'pace') b.pace = normalizePace(v);
      else if (k === 'items' && b.type === 'deliverables') { if (Array.isArray(v)) b.items = v.slice(0, 200).map(normalizeDeliverable); }
      else if (k === 'versions') { if (Array.isArray(v)) b.versions = v.slice(0, 50).map((x) => normalizeVersion(x, b.id)).filter((x) => x.file); }
      else if (Array.isArray(v)) b[k] = v; // items / columns / rows
    }
    return p;
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json({ plan: updated });
});

// Swap a block with its neighbour (`dir`), or — within a tab, where the
// neighbour may sit further away — with the block `with`.
router.post('/api/plans/:id/blocks/:blockId/move', async (req, res) => {
  const dir = req.body.dir === 'up' ? -1 : 1;
  const updated = await mutateDB((db) => {
    const p = db.plans.find((x) => x.id === req.params.id); if (!p) return null;
    const i = p.blocks.findIndex((b) => b.id === req.params.blockId); if (i === -1) return null;
    const j = req.body.with ? p.blocks.findIndex((b) => b.id === req.body.with) : i + dir;
    if (j < 0 || j >= p.blocks.length || j === i) return p;
    [p.blocks[i], p.blocks[j]] = [p.blocks[j], p.blocks[i]];
    return p;
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json({ plan: updated });
});

// Every file a block owns, relative to its plan folder: its own blocks/<id>/
// folder, a legacy moodboard/<id>/ folder, and any files it references
// elsewhere (the very first moodboards stored images directly in moodboard/).
function blockPaths(block) {
  const refs = [
    ...(block.images || []).map((i) => i?.file),
    ...(block.files || []).flatMap((f) => [f?.file, f?.example]),
    ...(block.shots || []).map((x) => x?.image),
    ...(block.versions || []).map((x) => x?.file),
    block.audio?.file,
  ].filter((r) => typeof r === 'string' && r && !r.includes('..'));
  return [...new Set([`blocks/${block.id}`, `moodboard/${block.id}`, ...refs])];
}

// Delete a block → Trash (with its files), restorable in place.
router.delete('/api/plans/:id/blocks/:blockId', async (req, res) => {
  const trashId = nanoid(10);
  let entry = null;
  const updated = await mutateDB((db) => {
    const p = db.plans.find((x) => x.id === req.params.id); if (!p) return null;
    const i = p.blocks.findIndex((b) => b.id === req.params.blockId); if (i === -1) return null;
    const [block] = p.blocks.splice(i, 1);
    const rels = blockPaths(block).filter((r) => fs.existsSync(path.join(planDir(p.id), r)));
    entry = { trashId, kind: 'block', deletedAt: Date.now(), data: { planId: p.id, planName: p.name, index: i, block, rels } };
    db.trash.unshift(entry);
    return p;
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  await moveRelPaths(planDir(req.params.id), path.join(TRASH_DIR, trashId), entry.data.rels);
  res.json({ plan: updated, trashId });
});

// Store files in a storyboard's or review block's folder and return their
// paths. The block itself isn't changed: the page adds them to its shots /
// track / versions and saves that, so an upload can never race an edit
// that's still being typed.
router.post('/api/plans/:id/blocks/:blockId/uploads', upload.array('files', 100), async (req, res) => {
  const db = await readDB();
  const plan = db.plans.find((p) => p.id === req.params.id);
  const b = findBlock(plan, req.params.blockId);
  if (!plan || !b || (b.type !== 'storyboard' && b.type !== 'review')) return res.status(404).json({ error: 'not_found' });
  const dir = blockDir(plan.id, b.id);
  const files = [];
  for (const f of (req.files || [])) {
    const stored = await moveInto(dir, f.path, `${nanoid(8)}${extOf(f.originalname) || ''}`);
    files.push({ file: `blocks/${b.id}/${stored}`, name: f.originalname, size: f.size });
  }
  res.status(201).json({ files });
});

// Add files to a moodboard (images) or a files / pdf block.
router.post('/api/plans/:id/blocks/:blockId/files', upload.array('files', 50), async (req, res) => {
  const db = await readDB();
  const plan = db.plans.find((p) => p.id === req.params.id);
  const b0 = findBlock(plan, req.params.blockId);
  if (!plan || !b0 || (b0.type !== 'moodboard' && b0.type !== 'files' && b0.type !== 'pdf')) return res.status(404).json({ error: 'not_found' });
  const dir = blockDir(plan.id, b0.id);
  const added = [];
  for (const f of (req.files || [])) {
    const fid = nanoid(8);
    const stored = await moveInto(dir, f.path, `${fid}${extOf(f.originalname) || ''}`);
    added.push({ id: fid, file: `blocks/${b0.id}/${stored}`, name: f.originalname, size: f.size });
  }
  const updated = await mutateDB((d) => {
    const p = d.plans.find((x) => x.id === plan.id);
    const b = findBlock(p, b0.id);
    if (!b) return null;
    if (b.type === 'moodboard') b.images = [...(b.images || []), ...added.map((a) => ({ id: a.id, file: a.file }))];
    else b.files = [...(b.files || []), ...added];
    return p;
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.status(201).json({ plan: updated });
});

// Add one file to a files block: the file itself, an optional example image
// (shown as a square preview before it) and an optional title.
router.post('/api/plans/:id/blocks/:blockId/file', upload.fields([{ name: 'file', maxCount: 1 }, { name: 'example', maxCount: 1 }]), async (req, res) => {
  const db = await readDB();
  const plan = db.plans.find((p) => p.id === req.params.id);
  const b0 = findBlock(plan, req.params.blockId);
  const file = req.files?.file?.[0];
  const example = req.files?.example?.[0];
  if (!plan || !b0 || b0.type !== 'files') return res.status(404).json({ error: 'not_found' });
  if (!file) return res.status(400).json({ error: 'file_required' });
  const dir = blockDir(plan.id, b0.id);
  const fid = nanoid(8);
  const storedFile = await moveInto(dir, file.path, `${fid}${extOf(file.originalname) || ''}`);
  let exampleRel = null;
  if (example) {
    const storedEx = await moveInto(dir, example.path, `${fid}_ex${extOf(example.originalname) || '.png'}`);
    exampleRel = `blocks/${b0.id}/${storedEx}`;
  }
  const item = { id: fid, file: `blocks/${b0.id}/${storedFile}`, name: file.originalname, size: file.size, title: str(req.body.title, 200).trim(), example: exampleRel };
  const updated = await mutateDB((d) => {
    const p = d.plans.find((x) => x.id === plan.id);
    const b = findBlock(p, b0.id);
    if (!b) return null;
    b.files = [...(b.files || []), item];
    return p;
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.status(201).json({ plan: updated });
});

router.delete('/api/plans/:id/blocks/:blockId/files/:fileId', async (req, res) => {
  const planId = req.params.id;
  let removed = null; let blockType = null;
  const updated = await mutateDB((db) => {
    const p = db.plans.find((x) => x.id === planId); if (!p) return null;
    const b = findBlock(p, req.params.blockId); if (!b) return null;
    const arr = b.type === 'moodboard' ? b.images : b.files; if (!Array.isArray(arr)) return null;
    const idx = arr.findIndex((f) => f.id === req.params.fileId); if (idx === -1) return null;
    removed = arr[idx]; blockType = b.type;
    arr.splice(idx, 1);
    return p;
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  if (removed && (blockType === 'files' || blockType === 'pdf')) {
    // Soft delete → Trash (file + its example image), restorable later.
    const trashId = nanoid(10);
    const rels = [removed.file, removed.example].filter(Boolean);
    await moveRelPaths(planDir(planId), path.join(TRASH_DIR, trashId), rels);
    await mutateDB((db) => { db.trash.unshift({ trashId, kind: 'file', deletedAt: Date.now(), data: { planId, blockId: req.params.blockId, item: removed, rels } }); });
    return res.json({ plan: updated, trashId });
  }
  if (removed?.file) await safeRm(path.join(planDir(planId), removed.file), { force: true }).catch(() => {});
  res.json({ plan: updated });
});

router.delete('/api/plans/:id', async (req, res) => {
  const trashId = nanoid(10);
  let move = null;
  const ok = await mutateDB((db) => {
    const idx = db.plans.findIndex((p) => p.id === req.params.id);
    if (idx === -1) return false;
    const plan = db.plans[idx];
    db.plans.splice(idx, 1);
    db.trash.unshift({ trashId, kind: 'plan', deletedAt: Date.now(), data: plan });
    move = { from: planDir(plan.id), to: path.join(TRASH_DIR, trashId) };
    return true;
  });
  if (!ok) return res.status(404).json({ error: 'not_found' });
  if (move) await moveToTrash(move.from, move.to);
  res.json({ ok: true, trashId });
});
