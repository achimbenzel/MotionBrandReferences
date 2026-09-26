/**
 * Plan templates: two built-in starting points (launch video, branding) plus
 * the user's own, saved from any plan. A template is a plan's structure —
 * blocks, milestone names, status, emoji — without files, dates or answers.
 */
import { nanoid } from 'nanoid';
import { normalizeBlock, inferTabs, BLOCK_TITLES, str } from './schema.js';

// Built-in blocks are written with short placeholder ids (table columns are
// referenced by the row cells); every instance gets fresh ones.
// `tab`: which tab of the plan the block sits in (brief / concept / production / delivery).
const todos = (title, texts, tab = 'production') => ({ type: 'todos', title, tab, items: texts.map((text) => ({ text, done: false, urgent: false })) });
const fields = (title, labels) => ({ type: 'briefing', title, tab: 'brief', fields: labels.map((label) => ({ label, value: '' })) });
const table = (title, columns, rows, tab = 'brief') => ({
  type: 'table', title, tab,
  columns: columns.map((name, i) => ({ id: `c${i}`, name })),
  rows: rows.map((cells) => ({ cells: Object.fromEntries(cells.map((v, i) => [`c${i}`, v])) })),
});
const heading = (title, content = '', tab) => ({ type: 'heading', title, content, ...(tab ? { tab } : {}) });
const block = (type, title, tab, extra = {}) => ({ type, title, tab, ...extra });

export const BUILTIN_TEMPLATES = [
  {
    id: 'launch',
    name: 'Launch video',
    description: 'Briefing, script, storyboard, review rounds and deliverables for a product launch video.',
    emoji: '🚀',
    bannerGradient: 'midnight',
    status: 'briefing',
    milestones: ['Kick-off', 'Script & styleframes approved', 'Animatic approved', 'First cut (v1)', 'Final delivery'],
    blocks: [
      fields('Briefing', ['Product', 'Target audience', 'Key message', 'Call to action', 'Target length', 'Formats',
        'Tone & style', 'Music & voice-over', 'Must-haves / no-gos', 'Budget']),
      block('moodboard', 'Moodboard', 'concept'),
      block('refs', 'References', 'concept', { items: [] }),
      block('moodboard', 'Styleframes', 'concept'),
      block('palette', 'Palette', 'concept', { items: [] }),
      block('links', 'Links', 'concept', { items: [] }),
      block('script', 'Script & voice-over', 'production', {
        pace: 2.5, target: null,
        lines: ['Hook', 'Problem', 'Product reveal', 'Features', 'Call to action', 'Logo outro'].map((visual) => ({ visual, vo: '' })),
      }),
      block('storyboard', 'Storyboard', 'production', { aspect: '16:9', shots: [], audio: null, target: null }),
      todos('Production checklist', ['Script approved', 'Styleframes approved', 'Storyboard / animatic approved',
        'Music & voice-over licensed', 'Animation', 'Sound design & mix', 'Final review', 'Exports delivered']),
      block('review', 'Review', 'delivery', { versions: [] }),
      block('deliverables', 'Deliverables', 'delivery', { items: [
        { name: 'Master', aspect: '16:9', resolution: '3840 × 2160', codec: 'H.264' },
        { name: 'Social vertical', aspect: '9:16', resolution: '1080 × 1920', codec: 'H.264' },
        { name: 'Feed square', aspect: '1:1', resolution: '1080 × 1080', codec: 'H.264' },
        { name: 'Feed portrait', aspect: '4:5', resolution: '1080 × 1350', codec: 'H.264' },
      ].map((d) => ({ fps: '', length: '', status: 'open', notes: '', ...d })) }),
      block('files', 'Files', 'delivery'),
    ],
  },
  {
    id: 'branding',
    name: 'Branding',
    description: 'Briefing, research, logo, colour & type and a deliverables list for a brand identity.',
    emoji: '🎨',
    bannerGradient: 'clay',
    status: 'briefing',
    milestones: ['Kick-off', 'Moodboard & concept', 'Logo presentation', 'Refinement', 'Final delivery'],
    blocks: [
      fields('Briefing', ['Company / product', 'What they do', 'Target audience', 'Values & personality',
        'Competitors', 'Deliverables', 'Must-haves / no-gos', 'Budget']),
      heading('Research', '', 'concept'),
      block('refs', 'References', 'concept', { items: [] }),
      block('links', 'Competitors', 'concept', { items: [] }),
      block('moodboard', 'Moodboard', 'concept'),
      heading('Design', '', 'concept'),
      block('moodboard', 'Logo concepts', 'concept'),
      block('palette', 'Colour palette', 'concept', { items: [] }),
      block('text', 'Typography', 'concept', { content: '' }),
      todos('Checklist', ['Research & moodboard', 'Logo concepts', 'Colour & type system',
        'Applications (cards, social, signage)', 'Brand guidelines', 'Final files exported (SVG, PNG, PDF)']),
      table('Deliverables', ['Asset', 'Formats', 'Status'], [
        ['Logo (primary, secondary, icon)', 'SVG, PNG, PDF', 'Open'],
        ['Colour palette', 'HEX, RGB, CMYK', 'Open'],
        ['Brand guidelines', 'PDF', 'Open'],
        ['Business cards', 'Print PDF', 'Open'],
        ['Social templates', 'PNG', 'Open'],
      ], 'delivery'),
      block('pdf', 'Brand guidelines', 'delivery'),
      block('files', 'Files', 'delivery'),
    ],
  },
];
export const builtinTemplate = (id) => BUILTIN_TEMPLATES.find((t) => t.id === id) || null;

/** Deep-copy blocks with fresh ids, no files (images, storyboard frames and
 *  tracks) and table cells re-keyed. */
export function cloneBlocks(blocks) {
  return (Array.isArray(blocks) ? blocks : []).map((src) => {
    const b = structuredClone(src);
    b.id = nanoid(8);
    if (Array.isArray(b.items)) b.items = b.items.map((it) => ({ ...it, id: nanoid(6) }));
    if (Array.isArray(b.fields)) b.fields = b.fields.map((f) => ({ ...f, id: nanoid(6) }));
    if (Array.isArray(b.lines)) b.lines = b.lines.map((l) => ({ ...l, id: nanoid(6) }));
    if (Array.isArray(b.shots)) b.shots = b.shots.map((x) => ({ ...x, id: nanoid(6), image: null }));
    if (Array.isArray(b.columns)) {
      const ids = {};
      b.columns = b.columns.map((c) => { const id = nanoid(6); ids[c?.id] = id; return { ...c, id }; });
      b.rows = (Array.isArray(b.rows) ? b.rows : []).map((r) => ({
        id: nanoid(6),
        cells: Object.fromEntries(Object.entries(r?.cells || {}).filter(([k]) => ids[k]).map(([k, v]) => [ids[k], v])),
      }));
    }
    if (b.type === 'moodboard') b.images = [];
    if (b.type === 'files' || b.type === 'pdf') b.files = [];
    if (b.type === 'storyboard') b.audio = null;
    if (b.type === 'review') b.versions = [];
    return normalizeBlock(b);
  }).filter(Boolean);
}

/** The parts of a new plan that come from a template. */
export function planFromTemplate(t) {
  return {
    status: t.status || '',
    avatarEmoji: t.emoji || null,
    bannerGradient: t.bannerGradient || null,
    milestones: (t.milestones || []).map((m) => ({ id: nanoid(6), title: str(typeof m === 'string' ? m : m?.title, 200), date: '', done: false })),
    blocks: cloneBlocks(t.blocks),
  };
}

/** Save a plan as a template: structure and reusable text, no files, dates or answers. */
export function templateFromPlan(plan, name) {
  const tabs = inferTabs(plan.blocks); // every block keeps the tab it sits in
  const blocks = cloneBlocks(plan.blocks).map((b, i) => {
    b.tab = tabs[i];
    if (b.type === 'todos') b.items = b.items.map((t) => ({ ...t, done: false, urgent: false }));
    if (b.type === 'briefing') b.fields = b.fields.map((f) => ({ ...f, value: '' }));
    if (b.type === 'deliverables') b.items = b.items.map((d) => ({ ...d, status: 'open' }));
    return b;
  });
  return {
    id: nanoid(10),
    name: str(name, 120).trim() || 'Untitled template',
    createdAt: Date.now(),
    emoji: plan.avatarEmoji || null,
    bannerGradient: plan.bannerGradient || null,
    status: plan.status ? 'briefing' : '',
    milestones: (plan.milestones || []).map((m) => str(m?.title, 200).trim()).filter(Boolean),
    blocks,
  };
}

/** What the "New plan" dialog lists. */
export function templateSummary(t, builtin) {
  return {
    id: t.id,
    name: t.name,
    builtin,
    description: t.description || '',
    emoji: t.emoji || null,
    outline: (t.blocks || []).filter((b) => b.type !== 'divider').map((b) => b.title || BLOCK_TITLES[b.type]).filter(Boolean),
    createdAt: t.createdAt || 0,
  };
}
