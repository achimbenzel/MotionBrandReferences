import { useEffect, useMemo, useState } from 'react';
import { X, Search, Film, Library, Inbox as InboxIcon, PencilRuler, Play } from 'lucide-react';
import { api, fileUrl, planFileUrl, softwareFileUrl } from '../../lib/api.js';
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

// The library, as it's grouped here: every reference type with the pictures it has.
const LIB_TYPES = [
  { type: 'branding', label: 'Branding' },
  { type: 'logo', label: 'Logos' },
  { type: 'businesscard', label: 'Business cards' },
  { type: 'imagegallery', label: 'Image gallery' },
  { type: 'font', label: 'Fonts' },
  { type: 'color', label: 'Colours' },
  { type: 'logonogo', label: 'Logo no-go' },
];
const pic = (f) => typeof f === 'string' && f;
// The pictures of one reference → [{ key, file, label, source }].
function libraryTiles(p) {
  const own = (field, label) => (pic(p[field]) ? [{ key: field, file: p[field], label, source: { kind: 'project', projectId: p.id, field } }] : []);
  const title = p.title || 'Untitled';
  let list = [];
  if (p.type === 'branding') {
    list = (p.assets || []).filter((a) => a.kind === 'image' && pic(a.file)).map((a) => ({ key: a.id, file: a.file, label: title, source: { kind: 'project', projectId: p.id, itemId: a.id } }));
  } else if (p.type === 'logo') {
    list = [...own('image', title), ...own('logoDark', `${title} · dark`), ...own('logoLight', `${title} · light`)];
  } else if (p.type === 'businesscard') {
    list = [...own('front', `${title} · front`), ...own('back', `${title} · back`)];
  } else if (p.type === 'font') {
    list = own('shot', title);
  } else if (p.type === 'color') {
    list = own('example', title);
  } else {
    list = own('image', title);
  }
  // No picture of its own? Its cover (e.g. a cropped screenshot).
  if (!list.length && pic(p.thumb)) list.push({ key: 'thumb', file: p.thumb, label: title, source: { kind: 'project', projectId: p.id, field: 'thumb' } });
  return list.filter((x, i) => list.findIndex((y) => y.file === x.file) === i); // older logos name one file twice
}

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
 * Pick a picture or video from what's already in the app: a plan's
 * moodboards, files, storyboard frames and review renders; Motion references
 * (the video, saved frames, moments); every library reference (branding,
 * logos, business cards, …) and software pictures; the Inbox.
 * onPick(source) with a source the server understands (server/sources.js).
 * `accept="image"`: pictures only (banners, profile pictures, moodboards).
 */
export default function MediaPicker({ onPick, onClose, title = 'Put on the screen', accept = 'any' }) {
  const imagesOnly = accept === 'image';
  const [tab, setTab] = useState('plans');
  const [plans, setPlans] = useState(null);
  const [planId, setPlanId] = useState('');
  const [motion, setMotion] = useState(null);
  const [library, setLibrary] = useState(null);
  const [software, setSoftware] = useState(null);
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
      Promise.all(LIB_TYPES.map((x) => api.list(x.type).catch(() => []))).then((lists) => setLibrary(lists.flat())).catch(() => setLibrary([]));
      api.listSoftware().then(setSoftware).catch(() => setSoftware([]));
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
    ].filter((x) => IMAGE.test(x.file || '') || (!imagesOnly && VIDEO.test(x.file || '')));
    return { id: b.id, title: b.title || 'Block', items };
  }).filter((g) => g.items.length), [plan, imagesOnly]);

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
      <div className="modal media-picker" role="dialog" aria-modal="true" aria-label={title}>
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
                  ...(p.video && !imagesOnly ? [{ key: 'video', src: fileUrl(p, p.video), video: true, label: 'Whole video', source: { kind: 'project', projectId: p.id } }] : []),
                  ...(pic(p.thumb) && (imagesOnly || !p.video) ? [{ key: 'thumb', src: fileUrl(p, p.thumb), label: 'Cover', source: { kind: 'project', projectId: p.id, field: 'thumb' } }] : []),
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
              {!motion.some((p) => p.video || p.thumb || (p.frames || []).length) && <div className="empty-hint">No Motion references with pictures yet.</div>}
            </>
          ))}

          {tab === 'library' && (!library ? <div className="spinner" /> : (
            <>
              {LIB_TYPES.map((lt) => {
                const tiles = library.filter((p) => p.type === lt.type && match(`${p.title} ${p.category || ''} ${(p.tags || []).join(' ')}`))
                  .flatMap((p) => libraryTiles(p).map((x) => ({ ...x, key: `${p.id}:${x.key}`, src: fileUrl(p, x.file) })));
                if (!tiles.length) return null;
                return (
                  <div className="fp-group" key={lt.type}>
                    <div className="fp-group-head">{lt.label} <span className="count">{tiles.length}</span></div>
                    <div className={`mp-grid ${lt.type === 'logo' ? 'mp-logos' : ''}`}>{tiles.map((x) => <Tile key={x.key} src={x.src} label={x.label} onClick={() => pick(x.source)} />)}</div>
                  </div>
                );
              })}
              {(() => {
                const tiles = (software || []).filter((sw) => match(sw.name)).flatMap((sw) => [
                  ...(pic(sw.avatar) ? [{ key: `${sw.id}:avatar`, src: softwareFileUrl(sw.id, sw.avatar), label: `${sw.name} · profile picture`, source: { kind: 'software', softwareId: sw.id, field: 'avatar' } }] : []),
                  ...(pic(sw.banner) ? [{ key: `${sw.id}:banner`, src: softwareFileUrl(sw.id, sw.banner), label: `${sw.name} · banner`, source: { kind: 'software', softwareId: sw.id, field: 'banner' } }] : []),
                  ...(sw.plugins || []).filter((x) => pic(x.image)).map((x) => ({ key: `${sw.id}:${x.id}`, src: softwareFileUrl(sw.id, x.image), label: x.name, source: { kind: 'software', softwareId: sw.id, itemId: x.id } })),
                  ...(sw.expressionGroups || []).filter((x) => pic(x.image)).map((x) => ({ key: `${sw.id}:${x.id}`, src: softwareFileUrl(sw.id, x.image), label: x.name || sw.name, source: { kind: 'software', softwareId: sw.id, itemId: x.id } })),
                ]);
                return tiles.length ? (
                  <div className="fp-group">
                    <div className="fp-group-head">Software <span className="count">{tiles.length}</span></div>
                    <div className="mp-grid">{tiles.map((x) => <Tile key={x.key} src={x.src} label={x.label} onClick={() => pick(x.source)} />)}</div>
                  </div>
                ) : null;
              })()}
              {!library.some((p) => libraryTiles(p).length) && !(software || []).some((sw) => sw.avatar || sw.banner) && <div className="empty-hint">No pictures in the library yet.</div>}
            </>
          ))}

          {tab === 'inbox' && (!inbox ? <div className="spinner" /> : (
            <div className="mp-grid">
              {inbox.filter((it) => (imagesOnly ? ['image', 'svg'] : ['image', 'video', 'svg']).includes(inboxKind(it)) && match(`${it.title} ${it.name}`)).map((it) => (
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
