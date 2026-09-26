import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Clapperboard, Plus, Search } from 'lucide-react';
import { api, planFileUrl } from '../lib/api.js';
import { fmtClock } from '../lib/timing.js';
import { allStoryboards, timing, progress, sectionRuns, segmentColor, storyboardPath } from '../lib/storyboard.js';
import NewStoryboardModal from '../components/storyboard/NewStoryboardModal.jsx';

/**
 * Every storyboard of every plan in one place — open one to edit it, or make
 * a new one for a plan (or together with a new plan).
 */
export default function StoryboardsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [plans, setPlans] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => { api.listPlans().then(setPlans).catch((e) => setError(e.message)); }, []);
  // /storyboards?new (e.g. from the command palette) opens the dialog.
  useEffect(() => { if (params.get('new') != null) { setCreating(true); setParams({}, { replace: true }); } }, [params, setParams]);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return allStoryboards(plans)
      .filter(({ plan, block }) => !t || `${block.title} ${plan.name} ${plan.client || ''}`.toLowerCase().includes(t))
      .sort((a, b) => Number(a.plan.status === 'archived') - Number(b.plan.status === 'archived'));
  }, [plans, q]);

  return (
    <div>
      <div className="page-head-row">
        <div className="page-head">
          <h1>Storyboards</h1>
          <p>The storyboards of all your plans — frames, timing, camera and voice-over, with an animatic and a PDF for the client.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)} disabled={!plans}><Plus size={16} /> New storyboard</button>
      </div>

      {error && <div className="center-msg">Couldn’t load: {error}</div>}
      {!plans && !error && <div className="spinner" />}

      {plans && allStoryboards(plans).length > 3 && (
        <label className="pp-search sbs-search">
          <Search size={15} />
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search storyboards, plans, clients…" />
        </label>
      )}

      {plans && !list.length && !q && (
        <div className="empty">
          <Clapperboard size={30} />
          <h3>No storyboards yet</h3>
          <p>Start one for a plan — empty, or from the launch video, social cut or logo sting template.</p>
          <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New storyboard</button>
        </div>
      )}
      {plans && !list.length && q && <div className="hint">Nothing matches “{q}”.</div>}

      {list.length > 0 && (
        <div className="grid">
          {list.map(({ plan, block }) => {
            const shots = block.shots || [];
            const frames = shots.filter((s) => s.image).slice(0, 4);
            const { total } = timing(shots);
            const prog = progress(shots);
            const span = Math.max(total, 0.001);
            return (
              <div key={block.id} className={`card sbs-card ${plan.status === 'archived' ? 'archived' : ''}`} onClick={() => navigate(storyboardPath(plan.id, block.id))}
                role="link" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') navigate(storyboardPath(plan.id, block.id)); }}>
                <div className="card-thumb sbs-thumb">
                  {frames.length ? (
                    <div className={`sbs-mosaic n${frames.length}`}>
                      {frames.map((s) => <img key={s.id} src={planFileUrl(plan, s.image)} alt="" loading="lazy" />)}
                    </div>
                  ) : <div className="card-thumb-empty"><Clapperboard size={26} /></div>}
                  <span className="card-badges">
                    <span className="card-badge">{block.aspect || '16:9'}</span>
                    {total ? <span className="card-badge">{fmtClock(total)}</span> : null}
                  </span>
                  <span className="card-structure">
                    {sectionRuns(shots).map((r) => <span key={r.from} style={{ flexGrow: r.length / span, background: r.section ? segmentColor(r.section).fg : 'var(--surface-3)' }} />)}
                  </span>
                </div>
                <div className="card-meta">
                  <span className="card-title">{block.title || 'Storyboard'}</span>
                  <span className="card-year">{shots.length} shot{shots.length === 1 ? '' : 's'}</span>
                </div>
                <div className="card-sub">{[plan.name, plan.client].filter(Boolean).join(' · ')}{prog.total ? ` · ${prog.done}/${prog.total} approved` : ''}</div>
              </div>
            );
          })}
          <button className="gallery-new" onClick={() => setCreating(true)}><Plus size={26} /><span>New storyboard</span></button>
        </div>
      )}

      {creating && plans && (
        <NewStoryboardModal plans={plans} onClose={() => setCreating(false)}
          onCreated={({ planId, block }) => navigate(storyboardPath(planId, block.id))} />
      )}
    </div>
  );
}
