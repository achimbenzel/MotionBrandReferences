import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pin, PinOff, Palette, MoreHorizontal, Trash2, ImagePlus, UploadCloud, Library, X } from 'lucide-react';
import { api, noteFileUrl } from '../lib/api.js';
import { useSaver, useRefreshOnReturn } from '../lib/autosave.js';
import { TAG_COLORS, tagColor } from '../lib/types.js';
import { isTouch } from '../lib/useMedia.js';
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/ConfirmDialog.jsx';
import Menu from '../components/Menu.jsx';
import AutoTextarea from '../components/AutoTextarea.jsx';
import Lightbox from '../components/Lightbox.jsx';
import MediaPicker from '../components/mockups/MediaPicker.jsx';

const imageFiles = (list) => [...(list || [])].filter((f) => f.type?.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(f.name || ''));

/**
 * One note: a title, the text (saved as you type) and pictures — upload,
 * paste (⌘V / Ctrl-V), drop, or take one that's already in the app. A
 * click on a picture opens it big; drag them to reorder.
 */
export default function NoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [dialog, ask] = useConfirm();
  const saver = useSaver(500);
  const [note, setNote] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [lightbox, setLightbox] = useState(-1);
  const [appPick, setAppPick] = useState(false);
  const [moving, setMoving] = useState(null); // picture being dragged to a new place
  const pending = useRef({});
  const fileRef = useRef(null);
  const fresh = !!location.state?.fresh; // just made with "New note" → start in the title

  useEffect(() => {
    let alive = true;
    setNote(null); setError(null);
    api.getNote(id).then((n) => { if (alive) setNote(n); }).catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [id]);
  useRefreshOnReturn(() => api.getNote(id), setNote, saver);
  // Left without writing anything: the empty note goes (no Trash needed).
  const noteRef = useRef(null);
  noteRef.current = note;
  useEffect(() => () => {
    const n = noteRef.current;
    if (n && n.id === id && !n.title.trim() && !n.body.trim() && !n.images.length) {
      // The list may already be loading — tell it once the note is gone.
      api.removeNoteIfEmpty(id).then((r) => { if (r?.removed) window.dispatchEvent(new CustomEvent('notes:changed')); }).catch(() => {});
    }
  }, [id]);

  // Title and text: saved together shortly after typing.
  const patch = (fields, now = false) => {
    setNote((n) => ({ ...n, ...fields, updatedAt: Date.now() }));
    Object.assign(pending.current, fields);
    const nid = id;
    saver.schedule('fields', async () => {
      const body = pending.current; pending.current = {};
      try { await api.updateNote(nid, body); } catch (e) { toast(`Could not save: ${e.message}`, 'error'); }
    }, { immediate: now });
  };

  const addFiles = async (files) => {
    const list = imageFiles(files);
    if (!list.length) return;
    setBusy(true);
    try { const { note: n } = await api.addNoteImages(id, list); setNote((x) => ({ ...x, images: n.images, updatedAt: n.updatedAt })); }
    catch (e) { toast(`Upload failed: ${e.message}`, 'error'); } finally { setBusy(false); }
  };
  const addFromApp = async (source) => {
    setAppPick(false); setBusy(true);
    try { const { note: n } = await api.addNoteImages(id, { source }); setNote((x) => ({ ...x, images: n.images })); }
    catch (e) { toast(`Could not add it: ${e.message}`, 'error'); } finally { setBusy(false); }
  };
  // Pasting a picture anywhere on the page adds it (text pastes stay text).
  useEffect(() => {
    const onPaste = (e) => {
      const files = imageFiles([...(e.clipboardData?.files || [])]);
      if (!files.length) return;
      e.preventDefault();
      addFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }); // re-bound every render, so it always uses the latest addFiles

  const removeImage = async (img) => {
    try {
      const { note: n, trashId } = await api.removeNoteImage(id, img.id);
      setNote((x) => ({ ...x, images: n.images }));
      toast('Picture removed', 'ok', { label: 'Undo', onClick: async () => { await api.restoreTrash(trashId); setNote(await api.getNote(id)); } });
    } catch (e) { toast(e.message, 'error'); }
  };
  const dropOn = async (targetId) => {
    if (!moving || moving === targetId) return;
    const ids = note.images.map((i) => i.id).filter((x) => x !== moving);
    ids.splice(ids.indexOf(targetId), 0, moving);
    const byId = Object.fromEntries(note.images.map((i) => [i.id, i]));
    setNote((x) => ({ ...x, images: ids.map((i) => byId[i]) }));
    setMoving(null);
    try { await api.updateNote(id, { order: ids }); } catch (e) { toast(`Could not save the order: ${e.message}`, 'error'); }
  };
  const remove = () => ask({
    title: 'Delete this note?',
    message: `“${note.title || 'Untitled note'}” goes to the Trash with its pictures — you can restore it from there.`,
    confirmLabel: 'Delete', danger: true,
    onConfirm: async () => {
      try {
        await saver.flush();
        const { trashId } = await api.removeNote(id);
        toast('Note moved to Trash', 'ok', { label: 'Undo', onClick: async () => { await api.restoreTrash(trashId); navigate(`/notes/${id}`); } });
        navigate('/notes');
      } catch (e) { toast(`Could not delete: ${e.message}`, 'error'); }
    },
  });

  if (error) return <div className="center-msg">Couldn’t load: {error} <button className="btn btn-sm" onClick={() => navigate('/notes')}>Back to notes</button></div>;
  if (!note) return <div className="spinner" />;
  const c = note.color ? tagColor(note.color) : null;
  const items = note.images.map((i) => ({ src: noteFileUrl(note, i.file), caption: i.name }));

  return (
    <div className={`note-page ${drag ? 'drag' : ''}`}
      onDragOver={(e) => { if (!moving && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false); }}
      onDrop={(e) => { if (moving) return; e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}>
      <div className="note-top">
        <button type="button" className="detail-back" onClick={() => navigate('/notes')}><ArrowLeft size={16} /> Notes</button>
        <div className="note-tools">
          <button type="button" className={`icon-btn ${note.pinned ? 'on' : ''}`} onClick={() => patch({ pinned: !note.pinned }, true)}
            title={note.pinned ? 'Unpin' : 'Pin to the top'} aria-label={note.pinned ? 'Unpin' : 'Pin to the top'}>
            {note.pinned ? <PinOff size={16} /> : <Pin size={16} />}
          </button>
          <Menu align="right" title="Colour" trigger={<button type="button" className="icon-btn" aria-label="Colour" title="Colour" style={c ? { color: c.fg } : undefined}><Palette size={16} /></button>}
            items={[
              ...TAG_COLORS.map((t) => ({ label: t.key[0].toUpperCase() + t.key.slice(1), checked: note.color === t.key, icon: <span className="status-dot" style={{ background: t.fg }} />, onClick: () => patch({ color: t.key }, true) })),
              { separator: true },
              { label: 'No colour', icon: <X size={14} />, onClick: () => patch({ color: null }, true) },
            ]} />
          <Menu align="right" trigger={<button type="button" className="icon-btn" aria-label="Add a picture" title="Add a picture"><ImagePlus size={16} /></button>}
            items={[
              { label: 'Upload pictures…', icon: <UploadCloud size={15} />, onClick: () => fileRef.current?.click() },
              { label: 'From the app…', icon: <Library size={15} />, onClick: () => setAppPick(true) },
            ]} />
          <Menu align="right" trigger={<button type="button" className="icon-btn" aria-label="More"><MoreHorizontal size={16} /></button>}
            items={[{ label: 'Delete note', icon: <Trash2 size={15} />, danger: true, onClick: remove }]} />
        </div>
      </div>

      <article className="note-sheet" style={c ? { '--note-tint': c.bg, '--note-line': c.fg } : undefined}>
        <input className="note-title" value={note.title} placeholder="Title" autoFocus={fresh && !isTouch()} aria-label="Title"
          onChange={(e) => patch({ title: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.closest('.note-sheet')?.querySelector('.note-body')?.focus(); } }} />
        <AutoTextarea className="note-body" value={note.body} placeholder="Write something… (paste or drop pictures anywhere on the page)" aria-label="Note"
          onChange={(e) => patch({ body: e.target.value })} />

        {(note.images.length > 0 || busy) && (
          <div className="note-images">
            {note.images.map((img, i) => (
              <figure key={img.id} className={`note-img ${moving === img.id ? 'moving' : ''}`} draggable
                onDragStart={(e) => { setMoving(img.id); e.dataTransfer.effectAllowed = 'move'; }}
                onDragEnd={() => setMoving(null)}
                onDragOver={(e) => { if (moving) e.preventDefault(); }}
                onDrop={(e) => { if (moving) { e.preventDefault(); e.stopPropagation(); dropOn(img.id); } }}>
                <button type="button" className="note-img-open" onClick={() => setLightbox(i)} aria-label={`Open ${img.name || 'picture'}`}>
                  <img src={noteFileUrl(note, img.file)} alt={img.name || ''} loading="lazy" draggable={false} />
                </button>
                <button type="button" className="note-img-x" onClick={() => removeImage(img)} aria-label="Remove picture" title="Remove"><X size={13} /></button>
              </figure>
            ))}
            {busy && <div className="note-img note-img-busy"><div className="spinner" /></div>}
          </div>
        )}
        <button type="button" className="note-add" onClick={() => fileRef.current?.click()} disabled={busy}>
          <ImagePlus size={15} /> {note.images.length ? 'Add more pictures' : 'Add pictures'} <span>— or paste / drop them</span>
        </button>
      </article>

      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      {lightbox >= 0 && <Lightbox items={items} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(-1)} />}
      {appPick && <MediaPicker accept="image" title="Picture from the app" onPick={addFromApp} onClose={() => setAppPick(false)} />}
      {drag && <div className="note-drop" aria-hidden="true"><ImagePlus size={26} /> Drop pictures to add them</div>}
      {dialog}
    </div>
  );
}
