import { useEffect, useMemo, useState } from 'react';
import { X, Search, Film, Library, Inbox as InboxIcon, PencilRuler, Play, Briefcase } from 'lucide-react';
import { api, fileUrl, planFileUrl, softwareFileUrl, dashboardFileUrl, clientFileUrl, noteFileUrl, mockupFileUrl } from '../../lib/api.js';
import { inboxFileUrl, inboxKind } from '../../lib/inbox.js';
import { fmtClock } from '../../lib/timing.js';
import { isTouch } from '../../lib/useMedia.js';

const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg)$/i;
const VIDEO = /\.(mp4|m4v|mov|webm|ogv)$/i;
const TABS = [
  { key: 'plans', label: 'Projects', icon: PencilRuler },
  { key: 'motion', label: 'Motion', icon: Film },
  { key: 'library', label: 'Library', icon: Library, images: true },
  { key: 'work', label: 'Work', icon: Briefcase },
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

function Group({ title, tiles, className = '', onPick }) {
  if (!tiles.length) return null;
  return (
    <div className="fp-group">
      <div className="fp-group-head">{title} <span className="count">{tiles.length}</span></div>
      <div className={`mp-grid ${className}`}>{tiles.map((x) => <Tile key={x.key} src={x.src} video={x.video} label={x.label} onClick={() => onPick(x)} />)}</div>
    </div>
  );
}

/**
 * Pick a picture or video from what's already in the app: a project's
 * moodboards, files, storyboard frames, review renders, profile picture and
 * banner; Motion references (the video, saved frames, moments); every
 * library reference (branding, logos, business cards, …) and software
 * pictures; the dashboard banner, clients' logos, notes' pictures and
 * mockups (their previews and what's on their screens); the Inbox.
 * onPick(source, { url, name, kind }) — a source the server understands
 * (server/sources.js), and where the file is (for places that take a file).
 * `accept`: 'any', 'image' (banners, profile pictures, moodboards) or 'video'.
 */
export default function MediaPicker({ onPick, onClose, title = 'Put on the screen', accept = 'any' }) {
  const wantImage = accept !== 'video';
  const wantVideo = accept !== 'image';
  const tabs = TABS.filter((x) => wantImage || !x.images);
  const [tab, setTab] = useState('plans');
  const [plans, setPlans] = useState(null);
  const [planId, setPlanId] = useState('');
  const [motion, setMotion] = useState(null);
  const [library, setLibrary] = useState(null);
  const [software, setSoftware] = useState(null);
  const [work, setWork] = useState(null); // { settings, clients, notes, mockups }
  const [inbox, setInbox] = useState(null);
  const [q, setQ] = useState('');

  // Escape closes the picker only — not a dialog it was opened from.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  useEffect(() => {
    if (tab === 'plans' && !plans) api.listPlans().then((ps) => { setPlans(ps); setPlanId(ps.find((p) => p.status !== 'archived')?.id || ps[0]?.id || ''); }).catch(() => setPlans([]));
    if (tab === 'motion' && !motion) api.list('motion').then(setMotion).catch(() => setMotion([]));
    if (tab === 'library' && !library) {
      Promise.all(LIB_TYPES.map((x) => api.list(x.type).catch(() => []))).then((lists) => setLibrary(lists.flat())).catch(() => setLibrary([]));
      api.listSoftware().then(setSoftware).catch(() => setSoftware([]));
    }
    if (tab === 'work' && !work) {
      Promise.all([
        api.getSettings().catch(() => ({})), api.listClients().catch(() => []), api.listNotes().catch(() => []),
        api.listMockups().then((r) => r.mockups || []).catch(() => []),
      ]).then(([settings, clients, notes, mockups]) => setWork({ settings, clients, notes, mockups }));
    }
    if (tab === 'inbox' && !inbox) api.listInbox().then(setInbox).catch(() => setInbox([]));
  }, [tab, plans, motion, library, work, inbox]);

  const t = q.trim().toLowerCase();
  const plan = (plans || []).find((p) => p.id === planId);
  const planGroups = useMemo(() => (plan?.blocks || []).map((b) => {
    const items = [
      ...(b.images || []).map((x) => ({ id: x.id, file: x.file, name: '' })),
      ...(b.files || []).map((x) => ({ id: x.id, file: x.file, name: x.title || x.name })),
      ...(b.versions || []).map((x, i) => ({ id: x.id, file: x.file, name: x.label || `v${i + 1}` })),
      ...(b.shots || []).filter((x) => x.image).map((x, i) => ({ id: x.id, file: x.image, name: `Shot ${i + 1}` })),
    ].filter((x) => (wantImage && IMAGE.test(x.file || '')) || (wantVideo && VIDEO.test(x.file || '')));
    return { id: b.id, title: b.title || 'Block', items };
  }).filter((g) => g.items.length), [plan, wantImage, wantVideo]);

  // Every plan's profile picture, and the chosen plan's own banner + profile picture.
  // (always pictures — older ones were saved as `.img`, so no extension check here)
  const avatars = wantImage ? (plans || []).filter((p) => p.avatar) : [];
  const planOwn = plan && wantImage ? [
    ...(plan.avatar ? [{ id: '@avatar', file: plan.avatar, name: 'Profile picture' }] : []),
    ...(plan.banner ? [{ id: '@banner', file: plan.banner, name: 'Banner' }] : []),
  ] : [];

  const pick = (x) => onPick(x.source, { url: x.src, name: x.name || x.label || 'Picture', kind: x.video ? 'video' : 'image' });
  const match = (s) => !t || String(s || '').toLowerCase().includes(t);

  // The Work tab: dashboard banner, clients' logos, notes' pictures, mockups.
  const workGroups = useMemo(() => {
    if (!work) return [];
    const banner = work.settings?.dashboardBanner;
    const mockTiles = (m, withThumb) => {
      const seen = new Set();
      const files = [];
      if (withThumb && pic(m.thumb)) files.push({ file: m.thumb, label: m.name || 'Mockup' });
      for (const it of m.items || []) {
        if (it.content?.file) files.push({ file: it.content.file, label: it.content.name || m.name });
        for (const f of Object.values(it.faces || {})) if (f?.file) files.push({ file: f.file, label: f.name || m.name });
      }
      for (const s of Object.values(m.d2?.slots || {})) if (s?.file) files.push({ file: s.file, label: s.name || m.name });
      return files.filter((f) => !seen.has(f.file) && seen.add(f.file)).map((f) => ({
        key: `${m.id}:${f.file}`, src: mockupFileUrl(m, f.file), video: VIDEO.test(f.file), label: f.label, source: { kind: 'mockup', mockupId: m.id, file: f.file },
      }));
    };
    return [
      { title: 'Dashboard', tiles: wantImage && pic(banner) && match('dashboard banner') ? [{ key: 'banner', src: dashboardFileUrl(banner), label: 'Dashboard banner', source: { kind: 'dashboard' } }] : [] },
      { title: 'Clients', className: 'mp-logos', tiles: wantImage ? work.clients.filter((c) => pic(c.logo) && match(c.name)).map((c) => ({ key: c.id, src: clientFileUrl(c, c.logo), label: c.name, source: { kind: 'client', clientId: c.id } })) : [] },
      { title: 'Notes', tiles: wantImage ? work.notes.filter((n) => match(`${n.title} ${n.body}`)).flatMap((n) => n.images.map((img) => ({ key: img.id, src: noteFileUrl(n, img.file), label: n.title || img.name, name: img.name || n.title, source: { kind: 'note', noteId: n.id, itemId: img.id } }))) : [] },
      { title: 'Mockup previews', tiles: wantImage ? work.mockups.filter((m) => pic(m.thumb) && match(m.name)).map((m) => ({ key: m.id, src: mockupFileUrl(m, m.thumb), label: m.name || 'Mockup', source: { kind: 'mockup', mockupId: m.id, file: m.thumb } })) : [] },
      { title: 'On mockups', tiles: work.mockups.filter((m) => match(m.name)).flatMap((m) => mockTiles(m, false)).filter((x) => (x.video ? wantVideo : wantImage)) },
    ];
  }, [work, t, wantImage, wantVideo]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal media-picker" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="segmented mp-tabs" role="tablist">
            {tabs.map((x) => (
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

          {tab === 'plans' && (!plans ? <div className="spinner" /> : !plans.length ? <div className="empty-hint">No projects yet.</div> : (
            <>
              <Group title="Profile pictures of your projects" className="mp-avatars" onPick={pick}
                tiles={avatars.map((p) => ({ key: p.id, src: planFileUrl(p, p.avatar), label: p.name, source: { kind: 'plan', planId: p.id, itemId: '@avatar' } }))} />
              <select className="input mp-plan" value={planId} onChange={(e) => setPlanId(e.target.value)} aria-label="Project">
                {plans.map((p) => <option key={p.id} value={p.id}>{p.avatarEmoji ? `${p.avatarEmoji} ` : ''}{p.name}</option>)}
              </select>
              <Group title="Profile picture & banner" onPick={pick}
                tiles={planOwn.map((x) => ({ key: x.id, src: planFileUrl(plan, x.file), label: x.name, name: `${plan.name} · ${x.name}`, source: { kind: 'plan', planId: plan.id, itemId: x.id } }))} />
              {!planGroups.length && !planOwn.length && <div className="empty-hint">No {wantImage ? (wantVideo ? 'pictures or videos' : 'pictures') : 'videos'} in this project yet.</div>}
              {planGroups.map((g) => (
                <Group key={g.id} title={g.title} onPick={pick}
                  tiles={g.items.map((x) => ({ key: x.id, src: planFileUrl(plan, x.file), video: VIDEO.test(x.file), label: x.name, name: x.name || `${plan.name} · ${g.title}`, source: { kind: 'plan', planId: plan.id, blockId: g.id, itemId: x.id } }))} />
              ))}
            </>
          ))}

          {tab === 'motion' && (!motion ? <div className="spinner" /> : (
            <>
              {motion.filter((p) => match(`${p.title} ${(p.tags || []).join(' ')}`)).map((p) => {
                const tiles = [
                  ...(p.video && wantVideo ? [{ key: 'video', src: fileUrl(p, p.video), video: true, label: 'Whole video', name: p.title, source: { kind: 'project', projectId: p.id } }] : []),
                  ...(wantImage && pic(p.thumb) && (!wantVideo || !p.video) ? [{ key: 'thumb', src: fileUrl(p, p.thumb), label: 'Cover', name: p.title, source: { kind: 'project', projectId: p.id, field: 'thumb' } }] : []),
                  ...(wantImage ? (p.markers || []).filter((m) => m.thumb).map((m) => ({ key: m.id, src: fileUrl(p, m.thumb), label: `${fmtClock(m.t)} · ${m.label || 'Moment'}`, source: { kind: 'project', projectId: p.id, itemId: m.id } })) : []),
                  ...(wantImage ? (p.frames || []).map((f) => ({ key: f.id, src: fileUrl(p, f.file), label: fmtClock(f.t), name: `${p.title} ${fmtClock(f.t)}`, source: { kind: 'project', projectId: p.id, itemId: f.id } })) : []),
                ];
                return <Group key={p.id} title={p.title || 'Untitled'} tiles={tiles} onPick={pick} />;
              })}
              {!motion.some((p) => (wantVideo && p.video) || (wantImage && (p.thumb || (p.frames || []).length))) && <div className="empty-hint">No Motion references with {wantImage ? 'pictures' : 'videos'} yet.</div>}
            </>
          ))}

          {tab === 'library' && (!library ? <div className="spinner" /> : (
            <>
              {LIB_TYPES.map((lt) => (
                <Group key={lt.type} title={lt.label} className={lt.type === 'logo' ? 'mp-logos' : ''} onPick={pick}
                  tiles={library.filter((p) => p.type === lt.type && match(`${p.title} ${p.category || ''} ${(p.tags || []).join(' ')}`))
                    .flatMap((p) => libraryTiles(p).map((x) => ({ ...x, key: `${p.id}:${x.key}`, src: fileUrl(p, x.file) })))} />
              ))}
              <Group title="Software" onPick={pick} tiles={(software || []).filter((sw) => match(sw.name)).flatMap((sw) => [
                ...(pic(sw.avatar) ? [{ key: `${sw.id}:avatar`, src: softwareFileUrl(sw.id, sw.avatar), label: `${sw.name} · profile picture`, source: { kind: 'software', softwareId: sw.id, field: 'avatar' } }] : []),
                ...(pic(sw.banner) ? [{ key: `${sw.id}:banner`, src: softwareFileUrl(sw.id, sw.banner), label: `${sw.name} · banner`, source: { kind: 'software', softwareId: sw.id, field: 'banner' } }] : []),
                ...(sw.plugins || []).filter((x) => pic(x.image)).map((x) => ({ key: `${sw.id}:${x.id}`, src: softwareFileUrl(sw.id, x.image), label: x.name, source: { kind: 'software', softwareId: sw.id, itemId: x.id } })),
                ...(sw.expressionGroups || []).filter((x) => pic(x.image)).map((x) => ({ key: `${sw.id}:${x.id}`, src: softwareFileUrl(sw.id, x.image), label: x.name || sw.name, source: { kind: 'software', softwareId: sw.id, itemId: x.id } })),
              ])} />
              {!library.some((p) => libraryTiles(p).length) && !(software || []).some((sw) => sw.avatar || sw.banner) && <div className="empty-hint">No pictures in the library yet.</div>}
            </>
          ))}

          {tab === 'work' && (!work ? <div className="spinner" /> : (
            <>
              {workGroups.map((g) => <Group key={g.title} title={g.title} tiles={g.tiles} className={g.className} onPick={pick} />)}
              {!workGroups.some((g) => g.tiles.length) && <div className="empty-hint">{t ? 'Nothing matches.' : 'No dashboard banner, client logos, note pictures or mockups yet.'}</div>}
            </>
          ))}

          {tab === 'inbox' && (!inbox ? <div className="spinner" /> : (() => {
            const kinds = [...(wantImage ? ['image', 'svg'] : []), ...(wantVideo ? ['video'] : [])];
            const items = inbox.filter((it) => kinds.includes(inboxKind(it)));
            return (
              <div className="mp-grid">
                {items.filter((it) => match(`${it.title} ${it.name}`)).map((it) => (
                  <Tile key={it.id} src={inboxFileUrl(it)} video={inboxKind(it) === 'video'} label={it.title || it.name}
                    onClick={() => pick({ src: inboxFileUrl(it), video: inboxKind(it) === 'video', name: it.name || it.title, source: { kind: 'inbox', itemId: it.id } })} />
                ))}
                {!items.length && <div className="empty-hint">No {wantImage ? (wantVideo ? 'pictures or videos' : 'pictures') : 'videos'} in the Inbox.</div>}
              </div>
            );
          })())}
        </div>
      </div>
    </div>
  );
}
