import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import MotionDetail from './MotionDetail.jsx';
import ColorDetail from './ColorDetail.jsx';
import BrandingDetail from './BrandingDetail.jsx';

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [project, setProject] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setProject(null);
    setError(null);
    api.get(id)
      .then((p) => { if (alive) setProject(p); })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [id]);

  const remove = async () => {
    if (!window.confirm(`Delete “${project.title}” and all its files? This can’t be undone.`)) return;
    try {
      await api.remove(id);
      toast('Project deleted');
      navigate(`/${project.type}`);
    } catch (e) {
      toast(`Delete failed: ${e.message}`, 'error');
    }
  };

  if (error) return <div className="detail"><BackBtn /> <div className="center-msg">Couldn’t load: {error}</div></div>;
  if (!project) return <div className="detail"><div className="spinner" /></div>;

  const Body = { motion: MotionDetail, color: ColorDetail, branding: BrandingDetail }[project.type];

  return (
    <div className="detail">
      <BackBtn to={`/${project.type}`} />
      <div className="detail-head">
        <div>
          <h1>{project.title}</h1>
          <div className="sub">
            {[project.category, project.year].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className="detail-actions">
          <button className="btn btn-danger btn-sm" onClick={remove}><Trash2 size={15} /> Delete</button>
        </div>
      </div>

      <Body project={project} setProject={setProject} />
    </div>
  );
}

function BackBtn({ to }) {
  const navigate = useNavigate();
  return (
    <button className="detail-back" onClick={() => (to ? navigate(to) : navigate(-1))}>
      <ArrowLeft size={16} /> Back
    </button>
  );
}
