import { useEffect, useMemo, useState } from 'react';
import { X, Search, PencilRuler, Library } from 'lucide-react';
import { api } from '../../lib/api.js';
import { TABS } from '../../lib/types.js';

const TYPE_LABEL_BY_KEY = Object.fromEntries(TABS.map((t) => [t.key, t.label]));

const PICTURE = /\.(png|jpe?g|webp|gif|avif|svg)$/i;
// A small picture for each: a project's banner (else its first moodboard picture, else its avatar), a reference's preview.
const planThumb = (p) => {
  const mood = (p.blocks || []).filter((b) => b.type === 'moodboard').flatMap((b) => b.images || []).map((i) => i.file).find((f) => PICTURE.test(f || ''));
  const f = [p.banner, mood, p.avatar].find((x) => typeof x === 'string' && x);
  return f ? `/data/plan/${p.id}/${f}` : null;
};
const refThumb = (r) => {
  const f = [r.thumb, r.image, r.front, r.shot, r.logoDark, r.logoLight].find((x) => typeof x === 'string' && PICTURE.test(x));
  return f ? `/data/${r.type}/${r.id}/${f}` : null;
};

/**
 * Pick one of your projects or a reference from the library for a case study:
 * its name, text, facts and pictures fill the slide. → onPick({ kind, id, name })
 */
export default function CaseFromPicker({ onPick, onClose }) {
  const [tab, setTab] = useState('plan');
  const [q, setQ] = useState('');
  const [plans, setPlans] = useState(null);
  const [refs, setRefs] = useState(null);
  useEffect(() => {
    api.listPlans().then(setPlans).catch(() => setPlans([]));
    api.list().then(setRefs).catch(() => setRefs([]));
  }, []);
  const needle = q.trim().toLowerCase();
  const items = useMemo(() => {
    const list = tab === 'plan'
      ? (plans || []).map((p) => ({ kind: 'plan', id: p.id, name: p.name || 'Project', sub: [p.client, p.status].filter(Boolean).join(' · '), thumb: planThumb(p), emoji: p.avatarEmoji }))
      : (refs || []).filter((r) => r.type !== 'color' && r.type !== 'font').map((r) => ({ kind: 'project', id: r.id, name: r.title || 'Untitled', sub: [TYPE_LABEL_BY_KEY[r.type], r.year].filter(Boolean).join(' · '), thumb: refThumb(r) }));
    return needle ? list.filter((x) => `${x.name} ${x.sub}`.toLowerCase().includes(needle)) : list;
  }, [tab, plans, refs, needle]);
  const loading = tab === 'plan' ? plans == null : refs == null;
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal pz-from" role="dialog" aria-modal="true" aria-label="Case study from">
        <div className="modal-head">
          <h2>Case study from…</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="pz-from-tools">
            <div className="segmented segmented-sm" role="tablist">
              <button type="button" role="tab" className={tab === 'plan' ? 'on' : ''} aria-selected={tab === 'plan'} onClick={() => setTab('plan')}><PencilRuler size={13} /> Your projects</button>
              <button type="button" role="tab" className={tab === 'project' ? 'on' : ''} aria-selected={tab === 'project'} onClick={() => setTab('project')}><Library size={13} /> References</button>
            </div>
            <label className="clients-search pz-from-search"><Search size={15} /><input value={q} autoFocus placeholder="Find…" onChange={(e) => setQ(e.target.value)} aria-label="Find" /></label>
          </div>
          <p className="hint">Its name, a few sentences (the briefing, or a reference's notes), the client, year and scope, and up to four of its pictures fill the slide — change anything afterwards.</p>
          {loading ? <div className="spinner" /> : items.length ? (
            <div className="pz-from-list">
              {items.map((x) => (
                <button key={`${x.kind}:${x.id}`} type="button" className="pz-from-item" onClick={() => onPick(x)}>
                  <span className="pz-from-thumb">{x.thumb ? <img src={x.thumb} alt="" loading="lazy" /> : <i>{x.emoji || x.name.charAt(0)}</i>}</span>
                  <span className="pz-from-text"><b>{x.name}</b>{x.sub && <small>{x.sub}</small>}</span>
                </button>
              ))}
            </div>
          ) : <p className="hint">{needle ? `Nothing matches “${q.trim()}”.` : tab === 'plan' ? 'No projects yet.' : 'No references yet.'}</p>}
        </div>
      </div>
    </div>
  );
}
