import { Check, Circle } from 'lucide-react';
import { planFileUrl } from '../../lib/api.js';
import { hostOf } from '../../lib/types.js';

const has = (s) => !!String(s || '').trim();

/**
 * A glimpse of a block's content — thumbnails, swatches, a progress bar or a
 * few lines — for folded blocks (`compact`) and the plan overview.
 */
export default function BlockPeek({ plan, block: b, compact = false }) {
  const max = compact ? 5 : 6;
  const thumbs = (list) => (
    <span className="peek-thumbs">
      {list.slice(0, max).map((src, i) => <img key={i} src={src} alt="" loading="lazy" />)}
      {list.length > max && <span className="peek-more">+{list.length - max}</span>}
    </span>
  );
  const bar = (done, total, color) => (total ? (
    <span className="peek-bar" aria-hidden="true"><span style={{ width: `${(done / total) * 100}%`, background: color }} /></span>
  ) : null);

  switch (b.type) {
    case 'moodboard': return (b.images || []).length ? thumbs(b.images.map((im) => planFileUrl(plan, im.file))) : null;
    case 'storyboard': {
      const frames = (b.shots || []).filter((s) => s.image).map((s) => planFileUrl(plan, s.image));
      return frames.length ? thumbs(frames) : null;
    }
    case 'refs': {
      const list = (b.items || []).map((r) => r.thumb).filter(Boolean);
      return list.length ? thumbs(list) : null;
    }
    case 'palette': return (
      <span className="peek-swatches">{(b.items || []).slice(0, compact ? 8 : 12).map((c) => <span key={c.id || c.hex} style={{ background: c.hex }} title={c.name || c.hex} />)}</span>
    );
    case 'todos': {
      const it = b.items || [];
      if (compact) return bar(it.filter((t) => t.done).length, it.length, '#7fe0b0');
      return (
        <span className="peek-lines">
          {it.filter((t) => !t.done).slice(0, 3).map((t) => <span key={t.id} className="peek-todo"><Circle size={11} /> {t.text || 'To-do'}</span>)}
          {!it.some((t) => !t.done) && it.length > 0 && <span className="peek-todo done"><Check size={11} /> All done</span>}
        </span>
      );
    }
    case 'deliverables': {
      const it = b.items || [];
      return bar(it.filter((d) => d.status === 'delivered').length, it.length, '#7fe0b0');
    }
    case 'briefing': {
      const f = b.fields || [];
      if (compact) return bar(f.filter((x) => has(x.value)).length, f.length, 'var(--accent)');
      return (
        <span className="peek-lines">
          {f.filter((x) => has(x.value)).slice(0, 3).map((x) => <span key={x.id}><b>{x.label || 'Note'}:</b> {x.value}</span>)}
        </span>
      );
    }
    case 'script': return compact ? null : (
      <span className="peek-lines peek-quote">{(b.lines || []).filter((l) => has(l.vo)).slice(0, 2).map((l) => <span key={l.id}>“{l.vo}”</span>)}</span>
    );
    case 'text': return compact ? null : <span className="peek-lines peek-text">{String(b.content || '').trim().slice(0, 240)}</span>;
    case 'links': return compact ? null : (
      <span className="peek-lines">{(b.items || []).slice(0, 3).map((l) => <span key={l.id}>{l.title || hostOf(l.url) || l.url}</span>)}</span>
    );
    case 'files': case 'pdf': return compact ? null : (
      <span className="peek-lines">{(b.files || []).slice(0, 3).map((f) => <span key={f.id}>{f.title || f.name}</span>)}</span>
    );
    default: return null;
  }
}
