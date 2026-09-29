import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Search, PencilRuler, Clapperboard, Box, Library, Megaphone } from 'lucide-react';
import { api, planFileUrl, mockupFileUrl } from '../../lib/api.js';
import { useToast } from '../Toast.jsx';
import MediaPicker from '../mockups/MediaPicker.jsx';
import useMakePost from './useMakePost.js';

const TABS = [
  { key: 'plan', label: 'Projects', icon: PencilRuler, hint: 'The post shows the project — its latest review cut and banner come along.' },
  { key: 'storyboard', label: 'Storyboards', icon: Clapperboard, hint: 'The shots become the beats (hook, body, CTA with their seconds), the frames its pictures.' },
  { key: 'mockup', label: 'Mockups', icon: Box, hint: 'The mockup opens and goes into the post in full size.' },
];

/**
 * "New post from…": pick a project, a storyboard or a mockup — or a
 * reference / any picture from the app — and a post is made from it.
 */
export default function MakePostDialog({ initial = 'plan', onClose }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [make, busy] = useMakePost();
  const [tab, setTab] = useState(TABS.some((t) => t.key === initial) ? initial : 'plan');
  const [q, setQ] = useState('');
  const [plans, setPlans] = useState(null);
  const [mockups, setMockups] = useState(null);
  const [media, setMedia] = useState(initial === 'media');
  useEffect(() => {
    api.listPlans().then(setPlans).catch(() => setPlans([]));
    api.listMockups().then((r) => setMockups(r.mockups || [])).catch(() => setMockups([]));
  }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !media) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, media]);

  const needle = q.trim().toLowerCase();
  const rows = useMemo(() => {
    const has = (...t) => !needle || t.join(' ').toLowerCase().includes(needle);
    if (tab === 'plan') {
      return (plans || []).filter((p) => has(p.name, p.client)).map((p) => ({
        key: p.id, title: p.name || 'Untitled project', sub: p.client || '', thumb: p.banner ? planFileUrl(p, p.banner) : null,
        go: () => make({ kind: 'plan', planId: p.id }),
      }));
    }
    if (tab === 'storyboard') {
      return (plans || []).flatMap((p) => (p.blocks || []).filter((b) => b.type === 'storyboard').map((b) => ({ p, b })))
        .filter(({ p, b }) => has(b.title, p.name)).map(({ p, b }) => {
          const frame = (b.shots || []).find((s) => s.image);
          const secs = Math.round((b.shots || []).reduce((n, s) => n + (s.duration || 0), 0));
          return {
            key: `${p.id}-${b.id}`, title: b.title || 'Storyboard', sub: `${p.name} · ${(b.shots || []).length} shots · ${secs} s · ${b.aspect}`,
            thumb: frame ? planFileUrl(p, frame.image) : null, tall: b.aspect === '9:16', disabled: !(b.shots || []).length,
            go: () => make({ kind: 'storyboard', planId: p.id, blockId: b.id }),
          };
        });
    }
    return (mockups || []).filter((m) => has(m.name)).map((m) => ({
      key: m.id, title: m.name || 'Untitled mockup', sub: m.kind === '2d' ? '2D mockup' : '3D mockup', thumb: m.thumb ? mockupFileUrl(m, m.thumb) : null,
      go: () => { onClose(); navigate(`/mockups/${m.id}`, { state: { makePost: true } }); },
    }));
  }, [tab, plans, mockups, needle, make, navigate, onClose]);
  const loading = tab === 'mockup' ? !mockups : !plans;

  // A reference → an idea from it; any other picture / video → a post with it.
  const fromOther = async (source) => {
    setMedia(false);
    if (source?.kind === 'project') { make({ kind: 'project', projectId: source.projectId, source }); return; }
    try {
      const item = await api.createContent({ status: 'idea' });
      await api.addContentMedia(item.id, { source });
      window.dispatchEvent(new CustomEvent('content:changed'));
      navigate(`/content/${item.id}`, { state: { fresh: true } });
    } catch (e) { toast(`Could not make a post: ${e.message}`, 'error'); }
  };
  const TabIcon = TABS.find((t) => t.key === tab).icon;

  if (media) return <MediaPicker accept="any" title="A reference or a picture from the app" onPick={fromOther} onClose={() => (initial === 'media' ? onClose() : setMedia(false))} />;
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal ctx-from" role="dialog" aria-modal="true" aria-label="New post from">
        <div className="modal-head">
          <h2><Megaphone size={18} /> New post from…</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="ctx-from-tools">
            <div className="segmented" role="tablist">
              {TABS.map((t) => <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}><t.icon size={14} /> {t.label}</button>)}
            </div>
            <label className="clients-search ctx-from-search"><Search size={15} />
              <input value={q} placeholder="Find…" onChange={(e) => setQ(e.target.value)} aria-label="Find" />
            </label>
          </div>
          <p className="hint">{TABS.find((t) => t.key === tab).hint}</p>
          <div className="ctx-from-list">
            {loading && <div className="spinner" />}
            {!loading && !rows.length && <div className="hint">{needle ? 'Nothing found.' : `No ${TABS.find((t) => t.key === tab).label.toLowerCase()} yet.`}</div>}
            {rows.map((r) => (
              <button key={r.key} type="button" className="ctx-from-row" onClick={r.go} disabled={busy || r.disabled} title={r.disabled ? 'No shots yet' : undefined}>
                <span className={`ctx-from-thumb ${r.tall ? 'tall' : ''}`}>{r.thumb ? <img src={r.thumb} alt="" loading="lazy" /> : <TabIcon size={18} />}</span>
                <span className="ctx-from-main"><b>{r.title}</b>{r.sub && <small>{r.sub}</small>}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="modal-foot ctx-from-foot">
          <button type="button" className="btn btn-ghost" onClick={() => setMedia(true)}><Library size={15} /> A reference or picture…</button>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
