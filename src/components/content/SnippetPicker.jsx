import { useEffect, useRef, useState } from 'react';
import { BookMarked, Search, Plus, Check, Sparkles } from 'lucide-react';
import { IDEAS, IDEA_LANGS, SNIPPET_KINDS } from '../../lib/contentIdeas.js';
import { useToast } from '../Toast.jsx';
import useContentLibrary from './useContentLibrary.js';

const loadLang = () => { try { return localStorage.getItem('contentIdeaLang') || 'de'; } catch { return 'de'; } };
const saveLang = (v) => { try { localStorage.setItem('contentIdeaLang', v); } catch { /* private window */ } };
const norm = (s) => String(s || '').trim().toLowerCase();

/**
 * A small "Library" button beside a field: your saved hooks / hashtag sets /
 * calls to action (most used first) and ideas to start from — a click puts
 * one in. What's in the field can be saved to the library from here.
 */
export default function SnippetPicker({ kind, current = '', onPick, label = 'Library' }) {
  const toast = useToast();
  const [items, lib] = useContentLibrary();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [lang, setLang] = useState(loadLang);
  const [naming, setNaming] = useState(null); // a hashtag set's name while saving it
  const wrap = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey, true); };
  }, [open]);
  useEffect(() => { if (!open) { setQ(''); setNaming(null); } }, [open]);

  const needle = norm(q);
  const has = (x) => !needle || norm(`${x.name || ''} ${x.text}`).includes(needle);
  const mine = (items || []).filter((x) => x.kind === kind && has(x));
  const ideas = (kind === 'hashtags' ? IDEAS.hashtags : IDEAS[kind][lang].map((text) => ({ text }))).filter(has);
  const saved = !!current.trim() && (items || []).some((x) => x.kind === kind && norm(x.text) === norm(current));
  const one = SNIPPET_KINDS[kind].one;

  const pick = (text, item) => { onPick(text); if (item) lib.use(item); setOpen(false); };
  const saveCurrent = async (name = '') => {
    try {
      const { existed } = await lib.save(kind, current, name);
      toast(existed ? 'Already in your library' : `${one} saved to your library`);
      setNaming(null);
    } catch (e) { toast(`Could not save: ${e.message}`, 'error'); }
  };

  return (
    <span className="snp" ref={wrap}>
      <button type="button" className={`snp-btn ${open ? 'on' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open} title={`Your ${SNIPPET_KINDS[kind].label.toLowerCase()} and ideas`}>
        <BookMarked size={13} /> {label}
      </button>
      {open && (
        <div className="snp-pop" role="dialog" aria-label={SNIPPET_KINDS[kind].label}>
          <label className="snp-search"><Search size={14} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Find a ${one.toLowerCase()}…`} autoFocus aria-label="Find" />
          </label>
          <div className="snp-list">
            {mine.length > 0 && <div className="snp-h">Yours</div>}
            {mine.map((x) => (
              <button key={x.id} type="button" className="snp-item" onClick={() => pick(x.text, x)}>
                {x.name && <b>{x.name}</b>}<span>{x.text}</span>{x.uses > 0 && <em>{x.uses}×</em>}
              </button>
            ))}
            {!items && <div className="snp-empty">Loading…</div>}
            {items && !mine.length && !needle && <div className="snp-empty">Nothing saved yet — save one from the field, or start from an idea.</div>}
            <div className="snp-h">
              <Sparkles size={12} /> Ideas
              {kind !== 'hashtags' && (
                <span className="snp-lang">
                  {IDEA_LANGS.map((l) => <button key={l.key} type="button" className={lang === l.key ? 'on' : ''} onClick={() => { setLang(l.key); saveLang(l.key); }}>{l.label}</button>)}
                </span>
              )}
            </div>
            {ideas.map((x) => (
              <button key={x.text} type="button" className="snp-item idea" onClick={() => pick(x.text)}>
                {x.name && <b>{x.name}</b>}<span>{x.text}</span>
              </button>
            ))}
            {!ideas.length && needle && !mine.length && <div className="snp-empty">Nothing found.</div>}
          </div>
          {current.trim() && (
            <div className="snp-foot">
              {saved ? <span className="snp-saved"><Check size={13} /> This one is in your library</span>
                : kind === 'hashtags' && naming !== null ? (
                  <form className="snp-name" onSubmit={(e) => { e.preventDefault(); saveCurrent(naming.trim()); }}>
                    <input className="input" value={naming} onChange={(e) => setNaming(e.target.value)} placeholder="Name the set, e.g. Motion core" maxLength={60} autoFocus aria-label="Name of the set" />
                    <button type="submit" className="btn btn-sm btn-primary">Save</button>
                  </form>
                ) : (
                  <button type="button" className="btn btn-sm" onClick={() => (kind === 'hashtags' ? setNaming('') : saveCurrent())}>
                    <Plus size={13} /> Save {kind === 'hashtags' ? 'these hashtags as a set' : `this ${one.toLowerCase()}`}
                  </button>
                )}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
