// A plan's tabs: its blocks grouped by phase, plus helpers that tell whether a
// block is still empty and sum it up in a line (for folded blocks and the
// overview). The tab of a block made before tabs existed follows its type —
// the same rules as the server's inferTabs().
import { LayoutDashboard, ClipboardList, Lightbulb, Clapperboard, PackageCheck } from 'lucide-react';
import { tagColor, hostOf } from './types.js';
import { voEstimate, fmtClock } from './timing.js';

export const PLAN_TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'brief', label: 'Briefing', icon: ClipboardList, color: 'blue' },
  { key: 'concept', label: 'Concept', icon: Lightbulb, color: 'pink' },
  { key: 'production', label: 'Production', icon: Clapperboard, color: 'orange' },
  { key: 'delivery', label: 'Delivery', icon: PackageCheck, color: 'green' },
];
export const BLOCK_TABS = PLAN_TABS.slice(1).map((t) => t.key);
export const planTab = (key) => PLAN_TABS.find((t) => t.key === key) || PLAN_TABS[0];
/** { bg, fg } of a tab (neutral for the overview). */
export const tabColor = (key) => (planTab(key).color ? tagColor(planTab(key).color) : { bg: 'var(--surface-2)', fg: 'var(--text-muted)' });

const TYPE_TAB = {
  briefing: 'brief', text: 'brief', table: 'brief',
  moodboard: 'concept', refs: 'concept', palette: 'concept', links: 'concept',
  script: 'production', storyboard: 'production', todos: 'production',
  review: 'delivery', deliverables: 'delivery', files: 'delivery', pdf: 'delivery',
};
export const STRUCTURAL = new Set(['heading', 'divider']);

/** The tab of every block, in order (headings / dividers go with the block after them). */
export function blockTabs(blocks) {
  const list = blocks || [];
  const own = list.map((b) => (BLOCK_TABS.includes(b?.tab) ? b.tab : STRUCTURAL.has(b?.type) ? null : TYPE_TAB[b?.type] || 'brief'));
  return own.map((t, i) => {
    if (t) return t;
    for (let j = i + 1; j < own.length; j += 1) if (own[j] && !STRUCTURAL.has(list[j]?.type)) return own[j];
    for (let j = i - 1; j >= 0; j -= 1) if (own[j]) return own[j];
    return 'brief';
  });
}

// Which tab fits where the plan stands (opened first when there's no saved choice).
const STATUS_TAB = { briefing: 'brief', concept: 'concept', design: 'concept', production: 'production', review: 'delivery', delivered: 'delivery' };
export const statusTab = (status) => STATUS_TAB[status] || null;

const has = (s) => !!String(s || '').trim();
/** Nothing in it yet (headings and dividers never count as empty). */
export function isEmptyBlock(b) {
  switch (b.type) {
    case 'heading': case 'divider': return false;
    case 'moodboard': return !(b.images || []).length;
    case 'text': return !has(b.content);
    case 'files': case 'pdf': return !(b.files || []).length;
    case 'todos': case 'links': case 'refs': case 'palette': case 'deliverables': return !(b.items || []).length;
    case 'table': return !(b.rows || []).length;
    case 'briefing': return !(b.fields || []).some((f) => has(f.value));
    case 'script': return !(b.lines || []).some((l) => has(l.vo));
    case 'storyboard': return !(b.shots || []).length;
    case 'review': return !(b.versions || []).length;
    default: return false;
  }
}

/** What to do with an empty block, in a few words. */
export const EMPTY_HINT = {
  moodboard: 'drop or add images', text: 'write notes', files: 'add files', pdf: 'add a PDF', todos: 'add to-dos',
  links: 'add links', refs: 'pick references from the library', palette: 'add or extract colours', deliverables: 'add deliverables',
  table: 'add rows', briefing: 'answer the questions', script: 'write the voice-over', storyboard: 'add shots', review: 'upload a render',
};

const n = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
/** One line about what's in a block. */
export function blockSummary(b) {
  switch (b.type) {
    case 'briefing': { const f = b.fields || []; return `${f.filter((x) => has(x.value)).length}/${f.length} answered`; }
    case 'script': {
      const lines = (b.lines || []).filter((l) => has(l.vo) || has(l.visual));
      const secs = lines.reduce((s, l) => s + voEstimate(l.vo, b.pace || 2.5).seconds, 0);
      return `${n(lines.length, 'line')}${secs ? ` · ≈ ${fmtClock(secs)} voice-over` : ''}`;
    }
    case 'storyboard': {
      const shots = b.shots || [];
      const total = shots.reduce((s, x) => s + (Number(x.duration) || 0), 0);
      const done = shots.filter((x) => x.status === 'approved').length;
      return `${n(shots.length, 'shot')} · ${fmtClock(total)}${b.aspect ? ` · ${b.aspect}` : ''}${done ? ` · ${done} approved` : ''}`;
    }
    case 'moodboard': return n((b.images || []).length, 'image');
    case 'refs': return n((b.items || []).length, 'reference');
    case 'palette': return n((b.items || []).length, 'colour');
    case 'links': return (b.items || []).map((l) => l.title || hostOf(l.url)).filter(Boolean).slice(0, 3).join(' · ') || n((b.items || []).length, 'link');
    case 'todos': { const it = b.items || []; return `${it.filter((t) => t.done).length}/${it.length} done`; }
    case 'files': case 'pdf': return n((b.files || []).length, b.type === 'pdf' ? 'PDF' : 'file');
    case 'table': return n((b.rows || []).length, 'row');
    case 'deliverables': { const it = b.items || []; return `${it.filter((d) => d.status === 'delivered').length}/${it.length} delivered`; }
    case 'review': {
      const v = (b.versions || [])[(b.versions || []).length - 1];
      if (!v) return 'no versions yet';
      const open = (v.comments || []).filter((c) => !c.done).length;
      return `${v.label || `v${b.versions.length}`}${v.approved ? ' · approved' : ''}${open ? ` · ${open} open comment${open === 1 ? '' : 's'}` : ''}`;
    }
    case 'text': return String(b.content || '').trim().split('\n')[0].slice(0, 120);
    default: return '';
  }
}
