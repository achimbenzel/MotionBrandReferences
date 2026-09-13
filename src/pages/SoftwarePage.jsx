import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, AppWindow, Puzzle } from 'lucide-react';
import { api, softwareFileUrl } from '../lib/api.js';
import { currencySymbol, gradientCss } from '../lib/types.js';
import GalleryNameModal from '../components/GalleryNameModal.jsx';

// Sum plugin prices per currency → e.g. "€ 129.99 · $ 40".
function spendLabel(plugins) {
  const by = {};
  for (const p of plugins || []) {
    const n = parseFloat(String(p.price || '').replace(',', '.'));
    if (Number.isFinite(n) && n > 0) by[p.currency || 'EUR'] = (by[p.currency || 'EUR'] || 0) + n;
  }
  const parts = Object.entries(by).map(([c, v]) => `${currencySymbol(c)} ${v % 1 ? v.toFixed(2) : v}`);
  return parts.join(' · ');
}

export default function SoftwarePage({ reloadKey }) {
  const navigate = useNavigate();
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let alive = true;
    setList(null); setError(null);
    api.listSoftware().then((s) => { if (alive) setList(s); }).catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [reloadKey]);

  const create = async (name) => {
    const s = await api.createSoftware(name.trim());
    setCreating(false);
    navigate(`/software/${s.id}`);
  };

  return (
    <div>
      <div className="page-head">
        <h1>Software</h1>
        <p>Your apps and their plugins, expressions and tutorials.</p>
      </div>

      {error && <div className="center-msg">Couldn’t load: {error}</div>}
      {!list && !error && <div className="spinner" />}

      {list && !error && (
        list.length ? (
          <div className="grid">
            {list.map((s) => {
              const spend = spendLabel(s.plugins);
              const banner = s.banner ? softwareFileUrl(s.id, s.banner) : null;
              const grad = !banner ? gradientCss(s.bannerGradient) : null;
              const bannerBg = banner ? `url("${banner}")` : grad || null;
              const avatar = s.avatar ? softwareFileUrl(s.id, s.avatar) : null;
              return (
                <div key={s.id} className="card plan-card" onClick={() => navigate(`/software/${s.id}`)}>
                  <div className="plan-card-head">
                    <div className={`plan-card-banner ${bannerBg ? '' : 'empty'}`} style={bannerBg ? { backgroundImage: bannerBg } : undefined} />
                    <div className="plan-card-avatar">
                      {avatar ? <img src={avatar} alt="" loading="lazy" />
                        : s.avatarEmoji ? <span className="plan-card-emoji">{s.avatarEmoji}</span>
                          : <AppWindow size={22} />}
                    </div>
                  </div>
                  <div className="card-meta"><span className="card-title">{s.name}</span></div>
                  <div className="card-sub soft-card-sub">
                    <span><Puzzle size={13} /> {(s.plugins || []).length} plugin{(s.plugins || []).length === 1 ? '' : 's'}</span>
                    {spend && <span className="soft-card-spend">{spend}</span>}
                  </div>
                </div>
              );
            })}
            <button className="gallery-new" onClick={() => setCreating(true)}>
              <Plus size={26} /><span>Add software</span>
            </button>
          </div>
        ) : (
          <div className="empty">
            <AppWindow size={30} />
            <h3>No software yet</h3>
            <p>Add an app like After Effects, then collect its plugins, scripts, expressions and tutorials.</p>
            <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Add software</button>
          </div>
        )
      )}

      {creating && (
        <GalleryNameModal title="New software" submitLabel="Create" placeholder="e.g. After Effects"
          onSubmit={create} onClose={() => setCreating(false)} />
      )}
    </div>
  );
}
