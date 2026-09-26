import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, CornerDownLeft, FileText, Film, Square, CreditCard, Palette, Images, Type,
  PencilRuler, FolderOpen, Trash2, LayoutGrid, FlaskConical, Ban, Settings, Inbox, Clapperboard,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { TABS } from '../lib/types.js';

const TYPE_ICON = {
  branding: FileText, motion: Film, logo: Square, businesscard: CreditCard,
  color: Palette, imagegallery: Images, font: Type, logonogo: Ban,
};

const NAV = [
  ...TABS.map((t) => ({ kind: 'nav', title: t.label, subtitle: 'Section', to: `/${t.key}`, icon: TYPE_ICON[t.key] || LayoutGrid })),
  { kind: 'nav', title: 'Plans', subtitle: 'Work mode', to: '/plan', icon: PencilRuler },
  { kind: 'nav', title: 'Brand Tester', subtitle: 'Work mode · logo tests', to: '/logo-tester', icon: FlaskConical },
  { kind: 'nav', title: 'Storyboards', subtitle: 'Work mode · all storyboards', to: '/storyboards', icon: Clapperboard },
  { kind: 'nav', title: 'New storyboard', subtitle: 'For a plan, from a template', to: '/storyboards?new', icon: Clapperboard },
  { kind: 'nav', title: 'Inbox', subtitle: 'Shared from your phone', to: '/inbox', icon: Inbox },
  { kind: 'nav', title: 'Trash', subtitle: 'Deleted items', to: '/trash', icon: Trash2 },
  { kind: 'nav', title: 'Settings', subtitle: 'Shortcuts & preferences', to: '/settings', icon: Settings },
];

/** ⌘/Ctrl-K palette: search all content + jump to any section. */
export default function CommandPalette({ onClose }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const navMatches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? NAV.filter((n) => n.title.toLowerCase().includes(s)) : NAV;
  }, [q]);

  useEffect(() => {
    const s = q.trim();
    if (!s) { setResults([]); return undefined; }
    let alive = true;
    const t = setTimeout(() => {
      api.search(s).then((r) => { if (alive) setResults(r); }).catch(() => { if (alive) setResults([]); });
    }, 150);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  const items = useMemo(() => [...navMatches, ...results], [navMatches, results]);
  useEffect(() => { setSel(0); }, [q, results]);

  const go = (item) => {
    if (!item) return;
    if (item.kind === 'nav') navigate(item.to);
    else if (item.kind === 'project') navigate(`/project/${item.id}`);
    else if (item.kind === 'plan') navigate(`/plan/${item.id}`);
    else if (item.kind === 'gallery') navigate(`/gallery/${item.id}`);
    onClose();
  };

  const onKey = (e) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(items[sel]); }
  };

  return (
    <div className="overlay cmd-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cmd" role="dialog" aria-modal="true">
        <div className="cmd-input">
          <Search size={18} />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
            placeholder="Search projects, plans, galleries — or jump to a section…" />
          <span className="cmd-esc">Esc</span>
        </div>
        <div className="cmd-list">
          {items.length === 0 ? (
            <div className="cmd-empty">{q.trim() ? 'No matches' : 'Type to search'}</div>
          ) : items.map((item, i) => (
            <button key={item.kind + (item.id || item.to)} className={`cmd-item ${i === sel ? 'on' : ''}`}
              onMouseEnter={() => setSel(i)} onClick={() => go(item)}>
              <span className="cmd-icon">
                {item.thumb ? <img src={item.thumb} alt="" loading="lazy" /> : <Ico item={item} />}
              </span>
              <span className="cmd-text">
                <span className="cmd-title">{item.title}</span>
                <span className="cmd-sub">{item.subtitle}</span>
              </span>
              {i === sel && <CornerDownLeft size={14} className="cmd-enter" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Ico({ item }) {
  if (item.kind === 'nav') { const I = item.icon; return <I size={17} />; }
  if (item.kind === 'plan') return <PencilRuler size={17} />;
  if (item.kind === 'gallery') return <FolderOpen size={17} />;
  const I = TYPE_ICON[item.type] || FileText;
  return <I size={17} />;
}
