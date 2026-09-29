import { useEffect, useState } from 'react';
import { X, BookMarked, Plus, Trash2, Sparkles, Eye } from 'lucide-react';
import { useSaver } from '../../lib/autosave.js';
import { hashtagsOf, fmtNum } from '../../lib/content.js';
import { IDEAS, IDEA_LANGS, SNIPPET_KINDS } from '../../lib/contentIdeas.js';
import { useToast } from '../Toast.jsx';
import AutoTextarea from '../AutoTextarea.jsx';
import useContentLibrary from './useContentLibrary.js';

const norm = (s) => String(s || '').trim().toLowerCase();
const loadLang = () => { try { return localStorage.getItem('contentIdeaLang') || 'de'; } catch { return 'de'; } };

/** The posts a snippet went into: the same hook, all of a set's hashtags, the call to action in the caption or on screen. */
export function postsWith(snippet, items) {
  const t = norm(snippet.text);
  if (!t) return [];
  if (snippet.kind === 'hook') return items.filter((c) => norm(c.hook) === t);
  if (snippet.kind === 'hashtags') {
    const set = hashtagsOf(snippet.text).map(norm);
    return items.filter((c) => { const mine = new Set(hashtagsOf(c.hashtags).map(norm)); return set.length && set.every((x) => mine.has(x)); });
  }
  return items.filter((c) => norm(c.caption).includes(t) || Object.values(c.captions || {}).some((x) => norm(x).includes(t))
    || (c.beats || []).some((b) => b.kind === 'cta' && (norm(b.screen).includes(t) || norm(b.text).includes(t))));
}
const avgViews = (posts) => {
  const withViews = posts.filter((c) => c.status === 'posted' && c.metrics?.views != null);
  return withViews.length ? withViews.reduce((n, c) => n + c.metrics.views, 0) / withViews.length : null;
};

/**
 * Your library of hooks, hashtag sets and calls to action: edit, delete (with
 * Undo), add your own or from the ideas — and see how often each was used
 * and how the posts with it did.
 */
export default function LibraryDialog({ items = [], onClose }) {
  const toast = useToast();
  const saver = useSaver(600);
  const [list, lib] = useContentLibrary();
  const [kind, setKind] = useState('hook');
  const [draft, setDraft] = useState('');
  const [name, setName] = useState('');
  const [lang, setLang] = useState(loadLang);
  useEffect(() => () => { saver.flush(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const mine = (list || []).filter((x) => x.kind === kind);
  const ideas = (kind === 'hashtags' ? IDEAS.hashtags : IDEAS[kind][lang].map((text) => ({ text })))
    .filter((i) => !mine.some((x) => norm(x.text) === norm(i.text)));
  const add = async (text, n = '') => {
    if (!text.trim()) return;
    try {
      const { existed } = await lib.save(kind, text.trim(), n.trim());
      if (existed) toast('Already in your library');
      setDraft(''); setName('');
    } catch (e) { toast(`Could not save: ${e.message}`, 'error'); }
  };
  const edit = (x, patch) => saver.schedule(x.id, () => lib.update(x.id, patch).catch((e) => toast(`Could not save: ${e.message}`, 'error')));
  const remove = async (x) => {
    try {
      const undo = await lib.remove(x);
      toast(`${SNIPPET_KINDS[x.kind].one} deleted`, 'ok', { label: 'Undo', onClick: undo });
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal ctx-lib" role="dialog" aria-modal="true" aria-label="Library">
        <div className="modal-head">
          <h2><BookMarked size={18} /> Library</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="segmented ctx-lib-tabs" role="tablist">
            {Object.entries(SNIPPET_KINDS).map(([k, x]) => (
              <button key={k} type="button" role="tab" aria-selected={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
                {x.label} <span className="count">{(list || []).filter((s) => s.kind === k).length}</span>
              </button>
            ))}
          </div>
          <form className="ctx-lib-new" onSubmit={(e) => { e.preventDefault(); add(draft, name); }}>
            {kind === 'hashtags' && <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Motion core" maxLength={60} aria-label="Name" />}
            <input className="input" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000} aria-label={`New ${SNIPPET_KINDS[kind].one.toLowerCase()}`}
              placeholder={kind === 'hook' ? 'A hook that worked, e.g. Wait for the last frame' : kind === 'hashtags' ? '#motiondesign #aftereffects …' : 'e.g. Save this for your next project'} />
            <button type="submit" className="btn btn-primary" disabled={!draft.trim()}><Plus size={15} /> Add</button>
          </form>
          <div className="ctx-lib-list">
            {!list && <div className="spinner" />}
            {list && !mine.length && <div className="hint">None yet — add your own above, save one from a post’s field, or take one of the ideas below.</div>}
            {mine.map((x) => <SnippetRow key={x.id} x={x} posts={postsWith(x, items)} onEdit={edit} onRemove={remove} />)}
          </div>
          {ideas.length > 0 && (
            <div className="ctx-lib-ideas">
              <div className="ctx-lib-ideas-head">
                <Sparkles size={13} /> Ideas to start from
                {kind !== 'hashtags' && (
                  <span className="snp-lang">
                    {IDEA_LANGS.map((l) => <button key={l.key} type="button" className={lang === l.key ? 'on' : ''} onClick={() => { setLang(l.key); try { localStorage.setItem('contentIdeaLang', l.key); } catch { /* */ } }}>{l.label}</button>)}
                  </span>
                )}
              </div>
              <div className="ctx-lib-idea-list">
                {ideas.map((i) => (
                  <button key={i.text} type="button" className="chip ctx-lib-idea" onClick={() => add(i.text, i.name || '')} title="Add to your library">
                    <Plus size={12} /> {i.name ? <b>{i.name}</b> : i.text}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="modal-foot"><button type="button" className="btn btn-primary" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}

function SnippetRow({ x, posts, onEdit, onRemove }) {
  const [text, setText] = useState(x.text);
  const [name, setName] = useState(x.name);
  const avg = avgViews(posts);
  return (
    <div className="ctx-lib-row">
      <div className="ctx-lib-main">
        {x.kind === 'hashtags' && <input className="ctx-lib-name" value={name} placeholder="Name the set" maxLength={60} aria-label="Name" onChange={(e) => { setName(e.target.value); onEdit(x, { name: e.target.value }); }} />}
        <AutoTextarea className="ctx-lib-text" value={text} maxLength={2000} aria-label="Text" onChange={(e) => { setText(e.target.value); if (e.target.value.trim()) onEdit(x, { text: e.target.value }); }} />
        <span className="ctx-lib-meta">
          {x.uses ? `used ${x.uses}×` : 'not used yet'}
          {posts.length > 0 && <> · in {posts.length} post{posts.length === 1 ? '' : 's'}</>}
          {avg != null && <> · <Eye size={11} /> ⌀ {fmtNum(Math.round(avg))} views</>}
        </span>
      </div>
      <button type="button" className="icon-btn" onClick={() => onRemove(x)} aria-label="Delete" title="Delete"><Trash2 size={14} /></button>
    </div>
  );
}
