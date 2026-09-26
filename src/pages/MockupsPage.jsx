import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Box, MoreHorizontal, Copy, Trash2, UploadCloud, MonitorSmartphone, Sun } from 'lucide-react';
import { api, mockupFileUrl, mockupHdriUrl } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import Menu from '../components/Menu.jsx';
import { DEVICES, DEVICE_ICON } from '../lib/mockup3d/catalog.js';
import { TYPES_2D, defaults2D } from '../lib/mockup2d.js';
const fmtSize = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const ago = (ts) => {
  const d = Math.floor((Date.now() - ts) / 86400000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
};

// A scene's thumbnail; one just being replaced (you left the editor a moment
// ago) can be gone for an instant — then ask for the list again, once.
function Thumb({ src, icon: Icon, onMissing }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className="card-thumb-empty"><Icon size={28} /></div>;
  return <img src={src} alt="" loading="lazy" onError={() => { setFailed(true); onMissing(); }} />;
}

/**
 * Mockups: 3D scenes (your own 3D models with your picture or video on the
 * screen) and 2D mockups (browser window, Instagram, X), plus the 3D models
 * you imported. New 3D ones start from a model, 2D ones from a type.
 */
export default function MockupsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const modelRef = useRef(null);
  const load = () => api.listMockups().then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  const retried = useRef(false);
  const thumbMissing = () => { if (!retried.current) { retried.current = true; setTimeout(load, 900); } };

  const create = async (modelId) => {
    setBusy(true);
    try {
      const label = data.models.find((x) => x.id === modelId)?.name || '3D model';
      const m = await api.createMockup({ device: 'custom', modelId, name: `${label} mockup`, frame: '16:9' });
      navigate(`/mockups/${m.id}`);
    } catch (e) { toast(`Could not create: ${e.message}`, 'error'); setBusy(false); }
  };
  const create2D = async (type) => {
    setBusy(true);
    try {
      const t = TYPES_2D[type];
      const m = await api.createMockup({ kind: '2d', name: t.label, frame: t.frame, d2: defaults2D(type), background: { mode: 'gradient', color: '#1C1C22', color2: '#34343E' } });
      navigate(`/mockups/${m.id}`);
    } catch (e) { toast(`Could not create: ${e.message}`, 'error'); setBusy(false); }
  };
  const duplicate = async (m) => { try { await api.duplicateMockup(m.id); load(); } catch (e) { toast(e.message, 'error'); } };
  const remove = async (m) => {
    try {
      const res = await api.removeMockup(m.id); load();
      toast(`“${m.name}” moved to Trash`, 'ok', { label: 'Undo', onClick: async () => { await api.restoreTrash(res.trashId).catch(() => {}); load(); } });
    } catch (e) { toast(e.message, 'error'); }
  };
  const importModel = async (file) => {
    if (!file) return;
    setBusy(true);
    try { const mdl = await api.addMockupModel(file); toast(`“${mdl.name}” imported`); if (modelRef.current?.dataset.open) { delete modelRef.current.dataset.open; create(mdl.id); } else load(); }
    catch (e) { toast(`Import failed: ${e.message}`, 'error'); }
    finally { setBusy(false); }
  };
  const removeHdri = async (h) => {
    try {
      const res = await api.removeMockupHdri(h.id); load();
      toast(`“${h.name}” moved to Trash`, 'ok', { label: 'Undo', onClick: async () => { await api.restoreTrash(res.trashId).catch(() => {}); load(); } });
    } catch (e) { toast(e.message, 'error'); }
  };
  const removeModel = async (mdl) => {
    try {
      const res = await api.removeMockupModel(mdl.id); load();
      toast(`“${mdl.name}” moved to Trash`, 'ok', { label: 'Undo', onClick: async () => { await api.restoreTrash(res.trashId).catch(() => {}); load(); } });
    } catch (e) { toast(e.message, 'error'); }
  };

  const importAndOpen = () => { modelRef.current.dataset.open = '1'; modelRef.current.click(); };
  const newItems = data ? [
    ...data.models.map((x) => ({ label: `3D · ${x.name}`, icon: <Box size={15} />, onClick: () => create(x.id) })),
    { label: '3D · Import a model…', icon: <UploadCloud size={15} />, onClick: importAndOpen },
    { separator: true },
    ...Object.entries(TYPES_2D).map(([key, t]) => ({ label: `2D · ${t.label}`, icon: <t.icon size={15} />, onClick: () => create2D(key) })),
  ] : [];

  return (
    <div>
      <div className="page-head-row">
        <div className="page-head">
          <h1>Mockups</h1>
          <p>Your designs and videos on your own 3D models — or in a browser window, an Instagram or X post, story or profile. Export an image or a video, or save it into a plan.</p>
        </div>
        {data && (
          <Menu align="right" title="New mockup" trigger={<button className="btn btn-primary" disabled={busy}><Plus size={16} /> New mockup</button>} items={newItems} />
        )}
      </div>

      {error && <div className="center-msg">Couldn’t load: {error}</div>}
      {!data && !error && <div className="spinner" />}

      {data && !data.mockups.length && (
        <div className="mk-start">
          {data.models.map((x) => (
            <button key={x.id} type="button" className="mk-start-card" onClick={() => create(x.id)} disabled={busy}>
              <Box size={30} /><span className="mk-start-title">{x.name}</span><span className="mk-start-sub">3D mockup</span>
            </button>
          ))}
          <button type="button" className="mk-start-card" onClick={importAndOpen} disabled={busy}>
            <UploadCloud size={30} /><span className="mk-start-title">Import a 3D model</span><span className="mk-start-sub">.glb · .gltf · .usdz</span>
          </button>
          {Object.entries(TYPES_2D).map(([key, t]) => (
            <button key={key} type="button" className="mk-start-card" onClick={() => create2D(key)} disabled={busy}>
              <t.icon size={30} /><span className="mk-start-title">{t.label}</span><span className="mk-start-sub">2D mockup</span>
            </button>
          ))}
        </div>
      )}

      {data && data.mockups.length > 0 && (
        <div className="grid">
          {data.mockups.map((m) => {
            const t2 = m.kind === '2d' ? TYPES_2D[m.d2?.type] || TYPES_2D.browser : null;
            const I = t2?.icon || DEVICE_ICON[m.device] || MonitorSmartphone;
            const names = (m.items || [m]).map((it) => (it.device === 'custom' ? data.models.find((x) => x.id === it.modelId)?.name || '3D model' : DEVICES[it.device]?.label));
            const deviceName = t2 ? `2D · ${t2.label}` : names.length > 2 ? `${names[0]} + ${names.length - 1} more` : names.join(' + ');
            return (
              <div key={m.id} className="card mk-card" onClick={() => navigate(`/mockups/${m.id}`)} role="link" tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/mockups/${m.id}`); }}>
                <div className="card-thumb mk-thumb">
                  <Thumb key={m.thumb || 'none'} src={m.thumb ? mockupFileUrl(m, m.thumb) : null} icon={I} onMissing={thumbMissing} />
                  <div className="mk-card-menu" onClick={(e) => e.stopPropagation()}>
                    <Menu align="right" title={m.name}
                      trigger={<button className="icon-btn" aria-label="Mockup options"><MoreHorizontal size={15} /></button>}
                      items={[
                        { label: 'Duplicate', icon: <Copy size={15} />, onClick: () => duplicate(m) },
                        { separator: true },
                        { label: 'Delete', icon: <Trash2 size={15} />, danger: true, onClick: () => remove(m) },
                      ]} />
                  </div>
                </div>
                <div className="card-meta"><span className="card-title">{m.name}</span><span className="card-year">{m.frame === 'auto' ? 'Fit' : m.frame}</span></div>
                <div className="card-sub">{deviceName} · {ago(m.updatedAt || m.createdAt)}</div>
              </div>
            );
          })}
        </div>
      )}

      {data && (
        <div className="section mk-models">
          <div className="section-head">
            <h2><Box size={16} /> Your 3D models {data.models.length > 0 && <span className="count">{data.models.length}</span>}</h2>
            <button className="btn btn-sm" onClick={() => modelRef.current?.click()} disabled={busy}><UploadCloud size={14} /> Import 3D model</button>
          </div>
          {data.models.length ? (
            <div className="mk-model-list">
              {data.models.map((x) => (
                <div className="mk-model-row" key={x.id}>
                  <Box size={16} />
                  <span className="mk-model-name">{x.name}</span>
                  <span className="mk-model-meta">.{x.format} · {fmtSize(x.size)}{x.screenMesh ? ` · screen: ${x.screenMesh}` : ' · no screen picked yet'}</span>
                  <button className="btn btn-sm btn-ghost" onClick={() => create(x.id)}>Use</button>
                  <button className="icon-btn" onClick={() => removeModel(x)} aria-label={`Delete ${x.name}`}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          ) : (
            <div className="hint">
              Add your own device models — <b>.glb</b>, single-file <b>.gltf</b> or <b>.usdz</b> (the format Apple uses for its product models).
              In the editor you pick which part of the model is the screen.
            </div>
          )}
        </div>
      )}
      {data?.hdris?.length > 0 && (
        <div className="section mk-models">
          <div className="section-head">
            <h2><Sun size={16} /> Your HDRIs <span className="count">{data.hdris.length}</span></h2>
          </div>
          <div className="mk-model-list">
            {data.hdris.map((h) => (
              <div className="mk-model-row" key={h.id}>
                {h.thumb ? <img className="mk-hdri-thumb" src={mockupHdriUrl(h, h.thumb)} alt="" /> : <Sun size={16} />}
                <span className="mk-model-name">{h.name}</span>
                <span className="mk-model-meta">.{h.format} · {fmtSize(h.size)} · pick it under Light in a 3D mockup</span>
                <button className="icon-btn" onClick={() => removeHdri(h)} aria-label={`Delete ${h.name}`}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      )}
      <input ref={modelRef} type="file" accept=".glb,.gltf,.usdz" className="visually-hidden-input" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; importModel(f); }} />
    </div>
  );
}
