import { useEffect, useRef, useState } from 'react';
import {
  Search, Check, X, FileText, Film, Square, CreditCard, Palette, Images, Type, FolderOpen,
} from 'lucide-react';
import { api } from '../lib/api.js';

const TYPE_ICON = {
  branding: FileText, motion: Film, logo: Square, businesscard: CreditCard,
  color: Palette, imagegallery: Images, font: Type,
};

/**
 * Modal search picker over the Reference library (projects + galleries).
 * Clicking a result calls onPick(item); the modal stays open so several can be
 * attached in one go. `addedIds` (a Set of refIds) marks already-attached items.
 */
export default function RefPicker({ addedIds, onPick, onClose }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pick = (item) => { onPick(item); inputRef.current?.focus(); };

  useEffect(() => {
    const s = q.trim();
    if (!s) { setResults([]); return undefined; }
    let alive = true;
    const t = setTimeout(() => {
      api.search(s)
        .then((r) => { if (alive) setResults(r.filter((x) => x.kind === 'project' || x.kind === 'gallery')); })
        .catch(() => { if (alive) setResults([]); });
    }, 150);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  return (
    <div className="overlay cmd-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cmd" role="dialog" aria-modal="true">
        <div className="cmd-input">
          <Search size={18} />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search your library to attach a reference…" />
          <button className="icon-btn" onClick={onClose} title="Done"><X size={16} /></button>
        </div>
        <div className="cmd-list">
          {results.length === 0 ? (
            <div className="cmd-empty">{q.trim() ? 'No matches in your library' : 'Type to search projects & galleries'}</div>
          ) : results.map((item) => {
            const added = addedIds.has(item.id);
            const I = item.kind === 'gallery' ? FolderOpen : (TYPE_ICON[item.type] || FileText);
            return (
              <button key={item.kind + item.id} className={`cmd-item ${added ? 'on' : ''}`}
                onClick={() => { if (!added) pick(item); }} disabled={added}>
                <span className="cmd-icon">
                  {item.thumb ? <img src={item.thumb} alt="" loading="lazy" /> : <I size={17} />}
                </span>
                <span className="cmd-text">
                  <span className="cmd-title">{item.title}</span>
                  <span className="cmd-sub">{item.subtitle}</span>
                </span>
                {added && <Check size={16} className="cmd-enter" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
