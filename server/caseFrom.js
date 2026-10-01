// A case study for a presentation, from something already in the app: one of
// your projects (plans) or a reference from the library. → its name, a few
// sentences about it, the facts (client, year, kind, scope) and its pictures
// (files on disk, best first).
import path from 'node:path';
import { DATA_DIR, TYPE_LABEL } from './config.js';

const PICTURE = /\.(png|jpe?g|webp|gif|avif|svg)$/i;
const yearOf = (v) => {
  if (typeof v === 'string' && /^\d{4}/.test(v)) return v.slice(0, 4);
  return Number.isFinite(v) && v > 0 ? String(new Date(v).getFullYear()) : '';
};
// A few sentences: the first paragraph, cut after a sentence near 320 characters.
export function shortText(v, max = 320) {
  const p = String(v || '').replace(/\r/g, '').split(/\n\s*\n/).map((x) => x.replace(/\s*\n\s*/g, ' ').trim()).find(Boolean) || '';
  if (p.length <= max) return p;
  const cut = p.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return end > 80 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(' ')).trim()} …`;
}
const uniq = (list) => [...new Set(list.filter(Boolean))];

/** A project (plan): its briefing or first text, client, dates, deliverables and its pictures. */
function fromPlan(db, plan) {
  const blocks = plan.blocks || [];
  const client = (db.clients || []).find((c) => c.id === plan.clientId)?.name || plan.client || '';
  const fields = blocks.filter((b) => b.type === 'briefing').flatMap((b) => b.fields || []).filter((f) => String(f.value || '').trim());
  const about = fields.find((f) => /goal|ziel|task|aufgabe|about|über|project|projekt|brief|description|beschreib|idea|idee/i.test(f.label)) || fields[0];
  const textBlock = blocks.find((b) => b.type === 'text' && String(b.content || '').trim());
  const scope = uniq(blocks.filter((b) => b.type === 'deliverables').flatMap((b) => (b.items || []).map((d) => d.name))).slice(0, 4).join(' - ');
  // [file, the name it was added with]
  const rel = [
    [plan.banner, 'banner'],
    ...blocks.filter((b) => b.type === 'moodboard').flatMap((b) => (b.images || []).map((i) => [i.file, i.name || i.title])),
    ...blocks.filter((b) => b.type === 'storyboard').flatMap((b) => (b.shots || []).map((x) => [x.image, `${b.title || 'storyboard'} frame`])),
    ...blocks.filter((b) => b.type === 'files' || b.type === 'pdf').flatMap((b) => (b.files || []).map((f) => [f.example, f.title || f.name])),
  ].filter(([r]) => typeof r === 'string' && PICTURE.test(r));
  const seen = new Set();
  return {
    title: plan.name || 'Project',
    text: shortText(about?.value || textBlock?.content || ''),
    facts: [['Client', client], ['Year', yearOf(plan.end) || yearOf(plan.start) || yearOf(plan.createdAt)], ['Scope', scope]]
      .filter(([, v]) => v).map(([label, value]) => ({ label, value })),
    pictures: rel.filter(([r]) => !seen.has(r) && seen.add(r))
      .map(([r, name]) => ({ abs: path.join(DATA_DIR, 'plan', plan.id, r), name: `${String(name || '').replace(/\.[a-z0-9]+$/i, '') || path.basename(r, path.extname(r))}${path.extname(r)}` })),
  };
}

/** A reference from the library: title, notes, year, kind, tags and its pictures. */
function fromReference(p) {
  const rel = [
    p.image, p.front, p.back, p.shot, p.logoDark, p.logoLight, p.example,
    ...(p.assets || []).filter((a) => a.kind === 'image').map((a) => a.file),
    ...(p.frames || []).map((f) => f.file),
    p.thumb,
  ].filter((r) => typeof r === 'string' && PICTURE.test(r));
  const scope = (p.tags || []).slice(0, 4).join(' - ');
  return {
    title: p.title || 'Project',
    text: shortText(p.notes),
    facts: [['Year', yearOf(p.year) || yearOf(p.createdAt)], ['Category', p.category || TYPE_LABEL[p.type] || ''], ['Scope', scope]]
      .filter(([, v]) => v).map(([label, value]) => ({ label, value })),
    pictures: uniq(rel).map((r) => ({ abs: path.join(DATA_DIR, p.type, p.id, r), name: path.basename(r) })),
  };
}

/** { kind: 'plan' | 'project', id } → { title, text, facts, pictures: [{ abs, name }] }, or null. */
export function caseSource(db, kind, id) {
  if (kind === 'plan') { const plan = db.plans.find((x) => x.id === id); return plan ? fromPlan(db, plan) : null; }
  if (kind === 'project') { const p = db.projects.find((x) => x.id === id); return p ? fromReference(p) : null; }
  return null;
}
