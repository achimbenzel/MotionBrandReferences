import { useEffect, useMemo, useState } from 'react';
import { X, Search, Film, Library, Inbox as InboxIcon, PencilRuler, Play } from 'lucide-react';
import { api, fileUrl, planFileUrl } from '../../lib/api.js';
import { inboxFileUrl, inboxKind } from '../../lib/inbox.js';
import { fmtClock } from '../../lib/timing.js';
import { isTouch } from '../../lib/useMedia.js';

const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg)$/i;
const VIDEO = /\.(mp4|m4v|mov|webm|ogv)$/i;
const TABS = [
  { key: 'plans', label: 'Plans', icon: PencilRuler },
  { key: 'motion', label: 'Motion', icon: Film },
  { key: 'library', label: 'Library', icon: Library },
  { key: 'inbox', label: 'Inbox', icon: InboxIcon },
];

function Tile({ src, video, label, onClick }) {
  return (
    <button type="button" className="mp-item" onClick={onClick} title={label || undefined}>
      {video ? <video src={`${src}#t=0.1`} muted playsInline preload="metadata" /> : <img src={src} alt="" loading="lazy" />}
      {video && <span className="mp-badge"><Play size={10} fill="currentColor" /> Video</span>}
      {label && <span className="mp-label">{label}</span>}
    </button>
  );
}

/**
 * Pick a picture or video for the screen from what's already in the app:
 * a plan's moodboards, files, storyboard frames and review renders; Motion
 * references (the video, saved frames, moments); library images; the Inbox.
 * onPick(source) with a source the server understands.
 */
export default function MediaPicker({ onPick, onClose, title = 'Put on the screen' }) {
  const [tab, setTab] = useState('plans');
  const [plans, setPlans] = useState(null);
  const [planId, setPlanId] = useState('');
  const [motion, setMotion] = useState(null);
  const [library, setLibrary] = useState(null);
  const [inbox, setInbox] = useState(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => {
    if (tab === 'plans' && !plans) api.listPlans().then((ps) => { setPlans(ps); setPlanId(ps.find((p) => p.status !== 'archived')?.id || ps[0]?.id || ''); }).catch(() => setPlans([]));
    if (tab === 'motion' && !motion) api.list('motion').then(setMotion).catch(() => setMotion([]));
    if (tab === 'library' && !library) {
      Promise.all(['branding', 'imagegallery', 'logo', 'logonogo'].map((t) => api.list(t).catch(() => []))).then((lists) => setLibrary(lists.flat())).catch(() => setLibrary([]));
    }
    if (tab === 'inbox' && !inbox) api.listInbox().then(setInbox).catch(() => setInbox([]));
  }, [tab, plans, motion, library, inbox]);

  const t = q.trim().toLowerCase();
  const plan = (plans || []).find((p) => p.id === planId);
  const planGroups = useMemo(() => (plan?.blocks || []).map((b) => {
    const items = [
      ...(b.images || []).map((x) => ({ id: x.id, file: x.file, name: '' })),
      ...(b.files || []).map((x) => ({ id: x.id, file: x.file, name: x.title || x.name })),
      ...(b.versions || []).map((x, i) => ({ id: x.id, file: x.file, name: x.label || `v${i + 1}` })),
      ...(b.shots || []).filter((x) => x.image).map((x, i) => ({ id: x.id, file: x.image, name: `Shot ${i + 1}` })),
    ].filter((x) => IMAGE.test(x.file || '') || VIDEO.test(x.file || ''));
    return { id: b.id, title: b.title || 'Block', items };
  }).filter((g) => g.items.length), [plan]);

  // Every plan's profile picture, and the chosen plan's own banner + profile picture.
  // (always pictures — older ones were saved as `.img`, so no extension check here)
  const avatars = (plans || []).filter((p) => p.avatar);
  const planOwn = plan ? [
    ...(plan.avatar ? [{ id: '@avatar', file: plan.avatar, name: 'Profile picture' }] : []),
    ...(plan.banner ? [{ id: '@banner', file: plan.banner, name: 'Banner' }] : []),
  ] : [];

  const pick = (source) => onPick(source);
  const match = (s) => !t || String(s || '').toLowerCase().includes(t);

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal media-picker" role="dialog" aria-modal="true" aria-label="Pick for the screen">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="segmented mp-tabs" role="tablist">
            {TABS.map((x) => (
              <button key={x.key} type="button" role="tab" aria-selected={tab === x.key} className={tab === x.key ? 'on' : ''} onClick={() => setTab(x.key)}>
                <x.icon size={14} /> {x.label}
              </button>
            ))}
          </div>
          {tab !== 'plans' && (
            <label className="pp-search">
              <Search size={15} />
              <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" autoFocus={!isTouch()} />
            </label>
          )}

          {tab === 'plans' && (!plans ? <div className="spinner" /> : !plans.length ? <div className="empty-hint">No plans yet.</div> : (
            <>
              {avatars.length > 0 && (
                <div className="fp-group">
                  <div className="fp-group-head">Profile pictures of your plans <span className="count">{avatars.length}</span></div>
                  <div className="mp-grid mp-avatars">
                    {avatars.map((p) => <Tile key={p.id} src={planFileUrl(p, p.avatar)} label={p.name} onClick={() => pick({ kind: 'plan', planId: p.id, itemId: '@avatar' })} />)}
                  </div>
                </div>
              )}
              <select className="input mp-plan" value={planId} onChange={(e) => setPlanId(e.target.value)} aria-label="Plan">
                {plans.map((p) => <option key={p.id} value={p.id}>{p.avatarEmoji ? `${p.avatarEmoji} ` : ''}{p.name}</option>)}
              </select>
              {planOwn.length > 0 && (
                <div className="fp-group">
                  <div className="fp-group-head">Profile picture &amp; banner</div>
                  <div className="mp-grid">
                    {planOwn.map((x) => <Tile key={x.id} src={planFileUrl(plan, x.file)} label={x.name} onClick={() => pick({ kind: 'plan', planId: plan.id, itemId: x.id })} />)}
                  </div>
                </div>
              )}
              {!planGroups.length && !planOwn.length && <div className="empty-hint">No pictures or videos in this plan yet.</div>}
              {planGroups.map((g) => (
                <div className="fp-group" key={g.id}>
                  <div className="fp-group-head">{g.title} <span className="count">{g.items.length}</span></div>
                  <div className="mp-grid">
                    {g.items.map((x) => <Tile key={x.id} src={planFileUrl(plan, x.file)} video={VIDEO.test(x.file)} label={x.name} onClick={() => pick({ kind: 'plan', planId: plan.id, blockId: g.id, itemId: x.id })} />)}
                  </div>
                </div>
              ))}
            </>
          ))}

          {tab === 'motion' && (!motion ? <div className="spinner" /> : (
            <>
              {motion.filter((p) => match(`${p.title} ${(p.tags || []).join(' ')}`)).map((p) => {
                const tiles = [
                  ...(p.video ? [{ key: 'video', src: fileUrl(p, p.video), video: true, label: 'Whole video', source: { kind: 'project', projectId: p.id } }] : []),
                  ...(p.markers || []).filter((m) => m.thumb).map((m) => ({ key: m.id, src: fileUrl(p, m.thumb), label: `${fmtClock(m.t)} · ${m.label || 'Moment'}`, source: { kind: 'project', projectId: p.id, itemId: m.id } })),
                  ...(p.frames || []).map((f) => ({ key: f.id, src: fileUrl(p, f.file), label: fmtClock(f.t), source: { kind: 'project', projectId: p.id, itemId: f.id } })),
                ];
                if (!tiles.length) return null;
                return (
                  <div className="fp-group" key={p.id}>
                    <div className="fp-group-head">{p.title || 'Untitled'} <span className="count">{tiles.length}</span></div>
                    <div className="mp-grid">{tiles.map((x) => <Tile key={x.key} src={x.src} video={x.video} label={x.label} onClick={() => pick(x.source)} />)}</div>
                  </div>
                );
              })}
              {!motion.some((p) => p.video || (p.frames || []).length) && <div className="empty-hint">No Motion references with a video file yet.</div>}
            </>
          ))}

          {tab === 'library' && (!library ? <div className="spinner" /> : (
            <div className="mp-grid">
              {library.filter((p) => match(`${p.title} ${p.category || ''} ${(p.tags || []).join(' ')}`)).flatMap((p) => {
                if (p.type === 'branding') {
                  return (p.assets || []).filter((a) => a.kind === 'image').map((a) => (
                    <Tile key={`${p.id}:${a.id}`} src={fileUrl(p, a.file)} label={p.title} onClick={() => pick({ kind: 'project', projectId: p.id, itemId: a.id })} />
                  ));
                }
                return p.image ? [<Tile key={p.id} src={fileUrl(p, p.image)} label={p.title} onClick={() => pick({ kind: 'project', projectId: p.id })} />] : [];
              })}
            </div>
          ))}

          {tab === 'inbox' && (!inbox ? <div className="spinner" /> : (
            <div className="mp-grid">
              {inbox.filter((it) => ['image', 'video', 'svg'].includes(inboxKind(it)) && match(`${it.title} ${it.name}`)).map((it) => (
                <Tile key={it.id} src={inboxFileUrl(it)} video={inboxKind(it) === 'video'} label={it.title || it.name} onClick={() => pick({ kind: 'inbox', itemId: it.id })} />
              ))}
              {!inbox.some((it) => ['image', 'video', 'svg'].includes(inboxKind(it))) && <div className="empty-hint">No pictures or videos in the Inbox.</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
