import { useEffect, useMemo, useState } from 'react';
import { X, Search, Check, Images, Film } from 'lucide-react';
import { api, fileUrl, planFileUrl } from '../../lib/api.js';
import { fmtClock } from '../../lib/timing.js';
import { isTouch } from '../../lib/useMedia.js';

const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg)$/i;

/**
 * Pick pictures for storyboard shots from what you already have: the plan's
 * moodboards and files, or frames and moments saved on Motion references.
 * `single` picks one (to replace a frame). onPick([{ kind, …ids, label }]).
 */
export default function FramePicker({ plan, single = false, onPick, onClose }) {
  const groups = useMemo(() => (plan.blocks || [])
    .filter((b) => b.type === 'moodboard' || b.type === 'files')
    .map((b) => ({
      id: b.id, title: b.title || 'Untitled',
      items: (b.type === 'moodboard' ? (b.images || []) : (b.files || []))
        .filter((f) => IMAGE.test(f.file || ''))
        .map((f) => ({ key: `plan:${f.id}`, kind: 'plan', blockId: b.id, itemId: f.id, src: planFileUrl(plan, f.file), label: f.title || f.name || '' })),
    }))
    .filter((g) => g.items.length), [plan]);
  const [tab, setTab] = useState(groups.length ? 'plan' : 'motion');
  const [motion, setMotion] = useState(null);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState([]); // items in pick order

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => {
    if (tab !== 'motion' || motion) return;
    api.list('motion').then((list) => setMotion(list.filter((p) => (p.frames || []).length || (p.markers || []).some((m) => m.thumb))))
      .catch(() => setMotion([]));
  }, [tab, motion]);

  const motionGroups = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (motion || [])
      .filter((p) => !t || `${p.title} ${(p.tags || []).join(' ')} ${(p.markers || []).map((m) => m.label).join(' ')}`.toLowerCase().includes(t))
      .map((p) => ({
        id: p.id, title: p.title || 'Untitled',
        items: [
          ...(p.markers || []).filter((m) => m.thumb).map((m) => ({ key: `moment:${m.id}`, kind: 'moment', projectId: p.id, itemId: m.id, src: fileUrl(p, m.thumb), t: m.t, label: m.label || 'Moment' })),
          ...(p.frames || []).map((f) => ({ key: `frame:${f.id}`, kind: 'frame', projectId: p.id, itemId: f.id, src: fileUrl(p, f.file), t: f.t, label: '' })),
        ].sort((a, b) => a.t - b.t),
      }));
  }, [motion, q]);

  const isOn = (it) => picked.some((x) => x.key === it.key);
  const toggle = (it) => {
    if (single) { onPick([it]); return; }
    setPicked((list) => (list.some((x) => x.key === it.key) ? list.filter((x) => x.key !== it.key) : [...list, it]));
  };

  const thumb = (it) => (
    <button key={it.key} type="button" className={`fp-item ${isOn(it) ? 'on' : ''}`} onClick={() => toggle(it)} aria-pressed={isOn(it)} title={it.label || undefined}>
      <img src={it.src} alt="" loading="lazy" />
      {it.t != null && <span className="fp-time">{fmtClock(it.t)}{it.kind === 'moment' ? ` · ${it.label}` : ''}</span>}
      {isOn(it) && <span className="fp-tick">{single ? <Check size={12} /> : picked.findIndex((x) => x.key === it.key) + 1}</span>}
    </button>
  );

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal frame-picker" role="dialog" aria-modal="true" aria-label="Pick frames">
        <div className="modal-head">
          <h2>{single ? 'Pick a frame' : 'Add frames from your library'}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="segmented fp-tabs" role="tablist">
            <button type="button" className={tab === 'plan' ? 'on' : ''} onClick={() => setTab('plan')} role="tab" aria-selected={tab === 'plan'}><Images size={14} /> This plan</button>
            <button type="button" className={tab === 'motion' ? 'on' : ''} onClick={() => setTab('motion')} role="tab" aria-selected={tab === 'motion'}><Film size={14} /> Motion references</button>
          </div>
          {tab === 'plan' && (groups.length ? groups.map((g) => (
            <div className="fp-group" key={g.id}>
              <div className="fp-group-head">{g.title} <span className="count">{g.items.length}</span></div>
              <div className="fp-grid">{g.items.map(thumb)}</div>
            </div>
          )) : <div className="empty-hint">No images in this plan’s moodboards or files yet.</div>)}
          {tab === 'motion' && (
            <>
              <label className="pp-search">
                <Search size={15} />
                <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search videos, tags, techniques…" autoFocus={!isTouch()} />
              </label>
              {!motion && <div className="spinner" />}
              {motion && !motionGroups.length && (
                <div className="empty-hint">{motion.length ? 'Nothing matches.' : 'No saved frames or moments yet — save them on a Motion Design reference.'}</div>
              )}
              {motionGroups.map((g) => (
                <div className="fp-group" key={g.id}>
                  <div className="fp-group-head">{g.title} <span className="count">{g.items.length}</span></div>
                  <div className="fp-grid">{g.items.map(thumb)}</div>
                </div>
              ))}
            </>
          )}
        </div>
        {!single && (
          <div className="modal-foot">
            <span className="hint fp-count">{picked.length ? `${picked.length} selected — one shot each, in this order` : 'Tap pictures to select them'}</span>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={!picked.length} onClick={() => onPick(picked)}>
              Add {picked.length || ''} shot{picked.length === 1 ? '' : 's'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
