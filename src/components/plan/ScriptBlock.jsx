import { Copy, Plus, MoreHorizontal, ArrowUp, ArrowDown, Trash2, CornerDownLeft } from 'lucide-react';
import Menu from '../Menu.jsx';
import AutoTextarea from '../AutoTextarea.jsx';
import { TargetMeter } from './Timing.jsx';
import { PACES, voEstimate, briefingTarget, fmtDur, fmtClock } from '../../lib/timing.js';

const rid = () => Math.random().toString(36).slice(2, 8);

/**
 * Script block: two columns — what we see | what we hear — with the speaking
 * time of the voice-over estimated per line and in total, against a target
 * length (the block's own, or the one in the briefing).
 */
export default function ScriptBlock({ plan, block: b, menu, icon: Icon, editBlock, planRef, toast }) {
  const lines = b.lines || [];
  const pace = b.pace || 2.5;
  const latest = () => (planRef.current?.blocks || []).find((x) => x.id === b.id)?.lines || lines;
  const setLines = (next, immediate = false) => editBlock(b.id, { lines: next }, immediate);
  const patchLine = (lid, p) => setLines(latest().map((l) => (l.id === lid ? { ...l, ...p } : l)));

  const est = lines.map((l) => voEstimate(l.vo, pace));
  const starts = [];
  let total = 0;
  for (const e of est) { starts.push(total); total += e.seconds; }
  const words = est.reduce((n, e) => n + e.words, 0);

  const insertAfter = (i) => { const next = [...latest()]; next.splice(i + 1, 0, { id: rid(), visual: '', vo: '' }); setLines(next, true); };
  const move = (i, d) => {
    const next = [...latest()]; const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setLines(next, true);
  };
  const remove = (l, i) => {
    setLines(latest().filter((x) => x.id !== l.id), true);
    if (!l.visual.trim() && !l.vo.trim()) return;
    toast('Line removed', 'ok', { label: 'Undo', onClick: () => {
      const next = [...latest()]; next.splice(Math.min(i, next.length), 0, l); setLines(next, true);
    } });
  };
  const copy = async () => {
    const text = lines.map((l, i) => ({ l, at: starts[i] })).filter(({ l }) => l.visual.trim() || l.vo.trim())
      .map(({ l, at }, n) => `${n + 1}. [${fmtClock(at)}] ${l.visual.trim() || '—'}\n   VO: ${l.vo.trim() || '—'}`).join('\n\n');
    try { await navigator.clipboard.writeText(`${plan.name} — ${b.title}\n\n${text}`); toast('Script copied'); }
    catch { toast('Copy failed', 'error'); }
  };

  const paceKnown = PACES.some((p) => p.wps === pace);
  return (
    <div className="section block" id={`block-${b.id}`}>
      <div className="section-head">
        <h2><Icon size={16} /> {b.title} {words > 0 && <span className="count">{words} words</span>}</h2>
        <div className="moodboard-actions">
          {lines.some((l) => l.visual.trim() || l.vo.trim()) && <button className="btn btn-sm" onClick={copy}><Copy size={14} /> Copy</button>}
          {menu}
        </div>
      </div>

      <div className="timing-row">
        <label className="pace">
          <span>Pace</span>
          <select className="input" value={pace} onChange={(e) => editBlock(b.id, { pace: Number(e.target.value) }, true)}>
            {PACES.map((p) => <option key={p.wps} value={p.wps}>{p.label} · {p.wps} words/s</option>)}
            {!paceKnown && <option value={pace}>{pace} words/s</option>}
          </select>
        </label>
        <TargetMeter total={total} own={b.target} briefing={briefingTarget(plan)} approx
          onTarget={(v) => editBlock(b.id, { target: v })} />
      </div>

      <div className="script">
        <div className="script-head" aria-hidden="true">
          <span>At</span><span>Visual — what we see</span><span>Voice-over / text — what we hear</span><span>Time</span><span />
        </div>
        {lines.map((l, i) => (
          <div className="script-row" key={l.id}>
            <span className="script-at" title="Starts at">{fmtClock(starts[i])}</span>
            <AutoTextarea className="script-cell script-visual" value={l.visual} placeholder="What we see…" aria-label={`Line ${i + 1} visual`}
              onChange={(e) => patchLine(l.id, { visual: e.target.value })} />
            <AutoTextarea className="script-cell script-vo" value={l.vo} placeholder="What we hear…" aria-label={`Line ${i + 1} voice-over`}
              onChange={(e) => patchLine(l.id, { vo: e.target.value })} />
            <span className="script-dur" title={est[i].words ? `${est[i].words} words${est[i].pause ? ` + ${fmtDur(est[i].pause)} pause` : ''}` : undefined}>
              {est[i].seconds ? `≈ ${fmtDur(est[i].seconds)}` : '—'}
            </span>
            <Menu
              align="right"
              title={`Line ${i + 1}`}
              trigger={<button className="icon-btn script-menu" aria-label={`Line ${i + 1} options`}><MoreHorizontal size={15} /></button>}
              items={[
                { label: 'Insert line below', icon: <CornerDownLeft size={15} />, onClick: () => insertAfter(i) },
                ...(i > 0 ? [{ label: 'Move up', icon: <ArrowUp size={15} />, onClick: () => move(i, -1) }] : []),
                ...(i < lines.length - 1 ? [{ label: 'Move down', icon: <ArrowDown size={15} />, onClick: () => move(i, 1) }] : []),
                { separator: true },
                { label: 'Delete line', icon: <Trash2 size={15} />, danger: true, onClick: () => remove(l, i) },
              ]}
            />
          </div>
        ))}
        <button className="btn btn-ghost btn-sm ms-add" onClick={() => insertAfter(lines.length - 1)}><Plus size={15} /> Add line</button>
      </div>
      <div className="hint" style={{ marginTop: 8 }}>
        Time is estimated from the voice-over at the chosen pace. Text in [brackets] is a direction and isn’t counted; [pause 1s] adds a pause.
      </div>
    </div>
  );
}
