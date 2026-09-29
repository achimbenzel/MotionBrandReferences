// Global search across projects, plans, galleries and software.
import { TYPE_LABEL } from '../config.js';
import { readDB } from '../db.js';
import { createRouter } from '../http.js';

const router = createRouter();

// Section types of a motion video, as shown in the app (search finds "social proof").
const SEGMENT_LABEL = {
  hook: 'Hook', problem: 'Problem', reveal: 'Product reveal', features: 'Features',
  proof: 'Social proof', cta: 'Call to action', outro: 'Logo outro',
};
export default router;

function scoreMatch(terms, title, hay) {
  const t = title.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (!hay.includes(term)) return 0; // every term must appear somewhere (AND)
    score += t.includes(term) ? 10 : 1;
    if (t.startsWith(term)) score += 5;
  }
  return score;
}

router.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (!q) return res.json({ results: [] });
  const terms = q.split(/\s+/).filter(Boolean);
  const db = await readDB();
  const results = [];

  for (const p of db.projects) {
    const hay = [p.title, p.year, p.category, ...(p.tags || []), p.notes, p.url,
      ...(p.colors || []).flatMap((c) => [c.hex, c.name]),
      ...(p.segments || []).flatMap((sg) => [SEGMENT_LABEL[sg.kind], sg.label]),
      ...(p.markers || []).flatMap((m) => [m.label, m.note])].filter(Boolean).join(' ').toLowerCase();
    const score = scoreMatch(terms, p.title || '', hay);
    if (score > 0) results.push({
      kind: 'project', id: p.id, type: p.type, title: p.title || 'Untitled',
      subtitle: p.category || TYPE_LABEL[p.type] || p.type,
      thumb: p.thumb ? `/data/${p.type}/${p.id}/${p.thumb}` : null, score,
    });
  }
  for (const pl of db.plans) {
    const blockText = (pl.blocks || []).flatMap((b) => [
      b.title, b.content,
      ...(b.items || []).flatMap((t) => [t.text, t.title, t.url, t.name, t.hex, t.codec, t.notes]),
      ...(b.files || []).map((f) => f.name),
      ...(b.columns || []).map((c) => c.name),
      ...(b.rows || []).flatMap((r) => Object.values(r.cells || {})),
      ...(b.fields || []).flatMap((f) => [f.label, f.value]),
      ...(b.lines || []).flatMap((l) => [l.visual, l.vo]),
      ...(b.shots || []).flatMap((x) => [x.visual, x.vo, x.onscreen, x.sfx, x.notes, x.camera, x.transition]),
      ...(b.versions || []).flatMap((v) => [v.label, v.name, ...(v.comments || []).map((c) => c.text)]),
    ]);
    const hay = [pl.name, pl.client, ...(pl.milestones || []).map((m) => m.title), ...blockText]
      .filter(Boolean).join(' ').toLowerCase();
    const score = scoreMatch(terms, pl.name || '', hay);
    if (score > 0) results.push({
      kind: 'plan', id: pl.id, title: pl.name || 'Untitled project', subtitle: pl.client ? `Project · ${pl.client}` : 'Project',
      thumb: pl.avatar ? `/data/plan/${pl.id}/${pl.avatar}` : null, score,
    });
  }
  for (const c of db.clients || []) {
    const hay = [c.name, c.customerNumber, c.vatId, c.email, c.website, c.notes,
      ...(c.contacts || []).flatMap((x) => [x.name, x.role, x.email, x.phone]),
      ...(c.invoices || []).flatMap((i) => [i.number, i.name])].filter(Boolean).join(' ').toLowerCase();
    const score = scoreMatch(terms, c.name || '', hay);
    if (score > 0) results.push({
      kind: 'client', id: c.id, title: c.name, subtitle: c.customerNumber ? `Client · ${c.customerNumber}` : 'Client',
      thumb: c.logo ? `/data/client/${c.id}/${c.logo}` : null, score,
    });
  }
  for (const n of db.notes || []) {
    const hay = [n.title, n.body, ...(n.images || []).map((i) => i.name)].filter(Boolean).join(' ').toLowerCase();
    const score = scoreMatch(terms, n.title || '', hay);
    if (score > 0) results.push({
      kind: 'note', id: n.id, title: n.title || 'Untitled note', subtitle: 'Note',
      thumb: n.images?.[0]?.file ? `/data/note/${n.id}/${n.images[0].file}` : null, score,
    });
  }
  for (const c of db.content || []) {
    const hay = [c.title, c.hook, c.caption, c.hashtags, c.script, c.notes, ...(c.beats || []).flatMap((b) => [b.text, b.screen]), ...Object.values(c.captions || {}), ...c.platforms, c.format].filter(Boolean).join(' ').toLowerCase();
    const score = scoreMatch(terms, c.title || '', hay);
    const pic = c.media.find((m) => m.id === c.coverId && m.kind === 'image') || c.media.find((m) => m.kind === 'image');
    if (score > 0) results.push({
      kind: 'content', id: c.id, title: c.title || 'Untitled post', subtitle: `Content · ${c.status}${c.date ? ` · ${c.date}` : ''}`,
      thumb: pic ? `/data/content/${c.id}/${pic.file}` : null, score,
    });
  }
  for (const e of db.expenses || []) {
    const score = scoreMatch(terms, e.name || '', [e.name, e.notes, e.category, e.link].filter(Boolean).join(' ').toLowerCase());
    if (score > 0) results.push({ kind: 'expense', id: e.id, title: e.name || 'Expense', subtitle: `Expense · ${e.amount} ${db.settings?.currency || 'EUR'} ${e.interval === 'once' ? 'once' : `/ ${e.interval}`}`, score });
  }
  for (const x of db.income || []) {
    const score = scoreMatch(terms, x.name || '', [x.name, x.notes].filter(Boolean).join(' ').toLowerCase());
    if (score > 0) results.push({ kind: 'income', id: x.id, title: x.name || 'Income', subtitle: `Recurring income · ${x.amount} ${db.settings?.currency || 'EUR'} / ${x.interval}`, score });
  }
  for (const a of db.achievements || []) {
    const score = scoreMatch(terms, a.title || '', [a.title, a.description, a.group].filter(Boolean).join(' ').toLowerCase());
    if (score > 0) results.push({ kind: 'achievement', id: a.id, title: a.title || 'Achievement', subtitle: `Achievement · ${a.group}${a.achievedAt ? ' · unlocked' : ''}`, score });
  }
  for (const g of db.galleries) {
    const hay = [g.name, TYPE_LABEL[g.type], g.type].filter(Boolean).join(' ').toLowerCase();
    const score = scoreMatch(terms, g.name || '', hay);
    if (score > 0) results.push({
      kind: 'gallery', id: g.id, type: g.type, title: g.name || 'Gallery',
      subtitle: `Gallery · ${TYPE_LABEL[g.type] || g.type}`, score,
    });
  }
  for (const s of db.software) {
    const hay = [s.name,
      ...(s.plugins || []).flatMap((p) => [p.name, p.category, p.version]),
      ...(s.expressionGroups || []).flatMap((g) => [g.name, ...(g.items || []).flatMap((e) => [e.title, ...(e.tags || [])])]),
      ...(s.tutorials || []).flatMap((t) => [t.title, t.channel])].filter(Boolean).join(' ').toLowerCase();
    const score = scoreMatch(terms, s.name || '', hay);
    if (score > 0) results.push({ kind: 'software', id: s.id, title: s.name || 'Software', subtitle: 'Software', score });
  }
  results.sort((a, b) => b.score - a.score || (a.title || '').localeCompare(b.title || ''));
  res.json({ results: results.slice(0, 40) });
});
