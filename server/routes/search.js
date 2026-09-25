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
      ...(p.segments || []).flatMap((sg) => [SEGMENT_LABEL[sg.kind], sg.label])].filter(Boolean).join(' ').toLowerCase();
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
      ...(b.items || []).flatMap((t) => [t.text, t.title, t.url, t.name, t.hex]),
      ...(b.files || []).map((f) => f.name),
      ...(b.columns || []).map((c) => c.name),
      ...(b.rows || []).flatMap((r) => Object.values(r.cells || {})),
      ...(b.fields || []).flatMap((f) => [f.label, f.value]),
      ...(b.lines || []).flatMap((l) => [l.visual, l.vo]),
      ...(b.shots || []).flatMap((x) => [x.visual, x.vo, x.notes]),
    ]);
    const hay = [pl.name, pl.client, ...(pl.milestones || []).map((m) => m.title), ...blockText]
      .filter(Boolean).join(' ').toLowerCase();
    const score = scoreMatch(terms, pl.name || '', hay);
    if (score > 0) results.push({
      kind: 'plan', id: pl.id, title: pl.name || 'Untitled plan', subtitle: pl.client ? `Plan · ${pl.client}` : 'Plan',
      thumb: pl.avatar ? `/data/plan/${pl.id}/${pl.avatar}` : null, score,
    });
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
