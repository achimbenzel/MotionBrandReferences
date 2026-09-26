import { lazy, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '../lib/api.js';

// Each editor is its own chunk: the 3D one brings three.js, the 2D one doesn't.
const Mockup3D = lazy(() => import('./MockupEditor.jsx'));
const Mockup2D = lazy(() => import('./Mockup2DEditor.jsx'));

/** /mockups/:id — loads the mockup and opens the 3D or the 2D editor. */
export default function MockupOpen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let on = true;
    setData(null); setError(null);
    Promise.all([api.getMockup(id), api.listMockups()])
      .then(([mockup, list]) => { if (on) setData({ mockup, models: list.models || [], hdris: list.hdris || [] }); })
      .catch((e) => { if (on) setError(e.message); });
    return () => { on = false; };
  }, [id]);
  if (error) return <div className="detail"><button className="detail-back" onClick={() => navigate('/mockups')}><ArrowLeft size={16} /> Mockups</button><div className="center-msg">Couldn’t load: {error}</div></div>;
  if (!data) return <div className="spinner" />;
  return data.mockup.kind === '2d'
    ? <Mockup2D key={id} initial={data.mockup} />
    : <Mockup3D key={id} initial={data.mockup} initialModels={data.models} initialHdris={data.hdris} />;
}
