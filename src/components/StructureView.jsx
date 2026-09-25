import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListVideo, Film } from 'lucide-react';
import { fileUrl } from '../lib/api.js';
import { SEGMENT_KINDS, segmentKind, segmentColor, segmentName } from '../lib/segments.js';
import { fmtDur, fmtClock } from '../lib/timing.js';
import { formatOf } from '../lib/media.js';
import { setLastTab, tagColor } from '../lib/types.js';

const store = (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } };
const load = (k, d) => { try { return sessionStorage.getItem(k) || d; } catch { return d; } };
// Axis step for a timeline `max` seconds long.
const stepFor = (max) => (max <= 20 ? 2 : max <= 45 ? 5 : max <= 100 ? 10 : max <= 240 ? 30 : 60);

/**
 * Structure view: every video that has sections, as a bar of its sections —
 * on one shared time axis (how long is a typical hook? when does the product
 * show up?) or stretched to full width (proportions). Above, the averages per
 * section type. A section opens its video right there.
 */
export default function StructureView({ projects }) {
  const navigate = useNavigate();
  const [scale, setScale] = useState(() => load('structScale', 'time')); // 'time' | 'fit'
  const [sort, setSort] = useState(() => load('structSort', 'newest')); // 'newest' | 'longest' | 'shortest'
  const pick = (setter, key) => (v) => { setter(v); store(key, v); };

  const rows = useMemo(() => projects
    .filter((p) => Number(p.duration) > 0 && (p.segments || []).length)
    .map((p) => {
      const dur = Number(p.duration);
      const list = [...p.segments].sort((a, b) => a.start - b.start)
        .map((s, i, arr) => { const end = i < arr.length - 1 ? arr[i + 1].start : dur; return { ...s, end, len: Math.max(0, end - s.start) }; });
      return { p, dur, list };
    })
    .sort((a, b) => (sort === 'longest' ? b.dur - a.dur : sort === 'shortest' ? a.dur - b.dur : (b.p.createdAt || 0) - (a.p.createdAt || 0))),
  [projects, sort]);

  // Per section type: in how many videos, average length, where it starts, share of the video.
  const stats = useMemo(() => SEGMENT_KINDS.map((k) => {
    const per = rows.map(({ dur, list }) => {
      const own = list.filter((s) => s.kind === k.key);
      if (!own.length) return null;
      const len = own.reduce((n, s) => n + s.len, 0);
      return { len, start: own[0].start, share: len / dur };
    }).filter(Boolean);
    if (!per.length) return null;
    const avg = (f) => per.reduce((n, x) => n + f(x), 0) / per.length;
    return { ...k, videos: per.length, len: avg((x) => x.len), start: avg((x) => x.start), share: avg((x) => x.share) };
  }).filter(Boolean), [rows]);

  const maxDur = Math.max(1, ...rows.map((r) => r.dur));
  const step = stepFor(maxDur);
  const ticks = [];
  for (let t = 0; t <= maxDur + 0.001; t += step) ticks.push(t);
  const without = projects.length - rows.length;
  const open = (p, t) => { setLastTab('motion'); navigate(t ? `/project/${p.id}?t=${t}` : `/project/${p.id}`); };

  if (!rows.length) {
    return (
      <div className="empty">
        <ListVideo size={30} />
        <h3>No structures yet</h3>
        <p>Open a video and mark its sections (Hook, Problem, Product reveal …) — every video with sections is compared here.</p>
      </div>
    );
  }

  return (
    <div className="structure">
      <div className="struct-controls">
        <div className="segmented" role="group" aria-label="Scale">
          <button className={scale === 'time' ? 'on' : ''} onClick={() => pick(setScale, 'structScale')('time')} title="One time axis for all videos">Time</button>
          <button className={scale === 'fit' ? 'on' : ''} onClick={() => pick(setScale, 'structScale')('fit')} title="Every video full width — compare proportions">Proportional</button>
        </div>
        <div className="segmented" role="group" aria-label="Sort">
          {[['newest', 'Newest'], ['longest', 'Longest'], ['shortest', 'Shortest']].map(([k, l]) => (
            <button key={k} className={sort === k ? 'on' : ''} onClick={() => pick(setSort, 'structSort')(k)}>{l}</button>
          ))}
        </div>
      </div>

      {stats.length > 0 && (
        <div className="struct-stats-wrap">
          <table className="struct-stats">
            <thead>
              <tr><th>Section</th><th>Videos</th><th>Avg length</th><th>Starts at</th><th>Share</th></tr>
            </thead>
            <tbody>
              {stats.map((k) => (
                <tr key={k.key}>
                  <td><span className="struct-kind" style={{ background: tagColor(k.color).bg, color: tagColor(k.color).fg }}>{k.label}</span></td>
                  <td>{k.videos} / {rows.length}</td>
                  <td>{fmtDur(k.len)}</td>
                  <td>{fmtClock(k.start)}</td>
                  <td>
                    <span className="struct-share"><span style={{ width: `${Math.round(k.share * 100)}%`, background: tagColor(k.color).fg }} /></span>
                    {Math.round(k.share * 100)} %
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={`struct ${scale === 'fit' ? 'is-fit' : ''}`}>
        {scale === 'time' && (
          <div className="struct-row struct-axis" aria-hidden="true">
            <span /><span />
            <div className="struct-track">
              {ticks.map((t) => <span key={t} className="struct-tick" style={{ left: `${(t / maxDur) * 100}%` }}>{t < 60 ? `${t}s` : fmtClock(t).replace(/\.0$/, '')}</span>)}
            </div>
          </div>
        )}
        {rows.map(({ p, dur, list }) => (
          <div key={p.id} className="struct-row">
            <button className="struct-thumb" onClick={() => open(p)} title={`Open “${p.title}”`}>
              {p.thumb ? <img src={fileUrl(p, p.thumb)} alt="" loading="lazy" /> : <Film size={16} />}
            </button>
            <button className="struct-info" onClick={() => open(p)}>
              <span className="struct-title">{p.title}</span>
              <span className="struct-meta">{[fmtDur(dur), formatOf(p.width, p.height)].filter(Boolean).join(' · ')}</span>
            </button>
            <div className="struct-track">
              <div className="struct-bar" style={{ width: scale === 'time' ? `${(dur / maxDur) * 100}%` : '100%' }}>
                {list.map((s, i) => {
                  const c = segmentColor(s.kind);
                  const k = segmentKind(s.kind);
                  return (
                    <button key={s.id} className="struct-seg" style={{ flexGrow: Math.max(0.0001, s.len), background: c.bg, color: c.fg }}
                      title={`${segmentName(s, i)} · ${fmtClock(s.start)}–${fmtClock(s.end)} (${fmtDur(s.len)})`}
                      onClick={() => open(p, s.start)}>
                      <span>{k ? (k.short || k.label) : (s.label || '—')}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
      {without > 0 && (
        <div className="hint" style={{ marginTop: 10 }}>
          {without} video{without === 1 ? '' : 's'} without sections {without === 1 ? 'isn’t' : 'aren’t'} shown — open {without === 1 ? 'it' : 'one'} and mark its sections.
        </div>
      )}
    </div>
  );
}
