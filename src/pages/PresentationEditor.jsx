import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Play, FileDown, MoreHorizontal, Plus, Copy, Trash2, Eye, EyeOff, ChevronUp, ChevronDown, Presentation as DeckIcon, Pin, PinOff, LayoutTemplate, Settings2,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useSaver, useRefreshOnReturn } from '../lib/autosave.js';
import { useSortable, moveItem } from '../lib/useSortable.js';
import { SLIDE_TYPES, SLIDE_TYPE_KEYS, blankData, slideName } from '../lib/slides.js';
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/ConfirmDialog.jsx';
import Menu from '../components/Menu.jsx';
import { SlideView } from '../components/presentations/Slide.jsx';
import SlideFields from '../components/presentations/SlideFields.jsx';
import DeckPanel from '../components/presentations/DeckPanel.jsx';
import Presenter from '../components/presentations/Presenter.jsx';
import PrintDeck from '../components/presentations/PrintDeck.jsx';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/800.css';
import '@fontsource/dm-sans/400-italic.css';
import '@fontsource/jetbrains-mono/600.css';
import '../styles/presentation.css';

const rid = () => Math.random().toString(36).slice(2, 10);
/** `obj` with the value at a dotted path ('items.2.image') replaced. */
function setIn(obj, path, value) {
  const [k, ...rest] = path.split('.');
  if (!rest.length) return Array.isArray(obj) ? obj.map((x, i) => (i === Number(k) ? value : x)) : { ...obj, [k]: value };
  const cur = obj?.[Array.isArray(obj) ? Number(k) : k];
  const next = setIn(cur ?? (/^\d+$/.test(rest[0]) ? [] : {}), rest.join('.'), value);
  return Array.isArray(obj) ? obj.map((x, i) => (i === Number(k) ? next : x)) : { ...obj, [k]: next };
}

/**
 * One presentation: the slides in a strip (drag to reorder), the one picked
 * big — a click on a text or picture in it finds its field — and its fields
 * beside it, or the whole deck's (look, logo, contact, cover). Saved as you
 * type. Present fullscreen, or export as PDF.
 */
export default function PresentationEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const [dialog, ask] = useConfirm();
  const saver = useSaver(600);
  const [deck, setDeck] = useState(null);
  const [error, setError] = useState(null);
  const [panel, setPanel] = useState('slide'); // slide | deck
  const [busy, setBusy] = useState(false);
  const [presenting, setPresenting] = useState(null); // index to start at
  const [printing, setPrinting] = useState(false);
  const [lists, setLists] = useState({ clients: [], plans: [] });
  const deckRef = useRef(null);
  deckRef.current = deck;
  const pending = useRef({});
  const stripRef = useRef(null);
  const inspectorRef = useRef(null);

  useEffect(() => {
    let alive = true;
    setDeck(null); setError(null);
    api.getPresentation(id).then((p) => { if (alive) setDeck(p); }).catch((e) => { if (alive) setError(e.message); });
    Promise.all([api.listClients().catch(() => []), api.listPlans().catch(() => [])])
      .then(([clients, plans]) => { if (alive) setLists({ clients, plans: plans.filter((p) => p.status !== 'archived') }); });
    return () => { alive = false; };
  }, [id]);
  useRefreshOnReturn(() => api.getPresentation(id), setDeck, saver, { live: `presentations/${id}` });

  const slides = useMemo(() => deck?.slides || [], [deck]);
  const selId = params.get('slide') && slides.some((s) => s.id === params.get('slide')) ? params.get('slide') : slides[0]?.id;
  const selIndex = slides.findIndex((s) => s.id === selId);
  const sel = slides[selIndex] || null;
  const pick = (sid) => setParams((p) => { const n = new URLSearchParams(p); n.set('slide', sid); return n; }, { replace: true });

  // ---- saving: the slides as a whole; other fields together.
  const saveSlides = () => saver.schedule('slides', async () => {
    try { await api.updatePresentation(id, { slides: deckRef.current.slides }); } catch (e) { toast(`Could not save: ${e.message}`, 'error'); }
  });
  const setSlides = (fn) => {
    setDeck((d) => ({ ...d, slides: fn(d.slides), updatedAt: Date.now() }));
    saveSlides();
  };
  const onDeck = (patch) => {
    setDeck((d) => ({ ...d, ...patch, updatedAt: Date.now() }));
    Object.assign(pending.current, patch);
    saver.schedule('fields', async () => {
      const body = pending.current; pending.current = {};
      try { await api.updatePresentation(id, body); } catch (e) { toast(`Could not save: ${e.message}`, 'error'); }
    });
  };
  const patchSlide = (sid, fn) => setSlides((list) => list.map((s) => (s.id === sid ? fn(s) : s)));
  const onData = (p) => patchSlide(selId, (s) => ({ ...s, data: { ...s.data, ...p } }));

  // A picture uploaded (or taken from the app) and put where it was asked for.
  const upload = async (pic, path) => {
    const sid = selId;
    setBusy(true);
    try {
      const { file } = await api.addPresentationImage(id, pic);
      if (path === '@brand.logo' || path === '@brand.mark') onDeck({ brand: { ...deckRef.current.brand, [path.slice(7)]: file } });
      else patchSlide(sid, (s) => ({ ...s, data: setIn(s.data, path, { file, fit: 'cover', x: 50, y: 50 }) }));
    } catch (e) { toast(`Upload failed: ${e.message}`, 'error'); } finally { setBusy(false); }
  };

  // ---- slides
  const addSlide = (type) => {
    const s = { id: rid(), type, hidden: false, section: sel?.section || '', data: blankData(type) };
    setSlides((list) => { const next = [...list]; next.splice(selIndex + 1, 0, s); return next; });
    pick(s.id); setPanel('slide');
  };
  const duplicateSlide = (s) => {
    const copy = { ...structuredClone(s), id: rid() };
    setSlides((list) => { const i = list.findIndex((x) => x.id === s.id); const next = [...list]; next.splice(i + 1, 0, copy); return next; });
    pick(copy.id);
  };
  const removeSlide = (s) => {
    const before = deckRef.current.slides;
    const i = before.findIndex((x) => x.id === s.id);
    setSlides((list) => list.filter((x) => x.id !== s.id));
    const near = before[i + 1] || before[i - 1];
    if (near) pick(near.id);
    toast(`“${slideName(s)}” removed`, 'ok', { label: 'Undo', onClick: () => { setSlides(() => before); pick(s.id); } });
  };
  const moveSlide = (s, d) => setSlides((list) => { const i = list.findIndex((x) => x.id === s.id); return moveItem(list, i, Math.max(0, Math.min(list.length - 1, i + d))); });
  const ids = slides.map((s) => s.id);
  const sort = useSortable({ ids, container: stripRef, onMove: (from, to) => setSlides((list) => moveItem(list, from, to)), threshold: 6 });

  // A click on a text or picture in the big slide: its field.
  const findField = (e) => {
    const el = e.target.closest('[data-field]');
    if (!el) return;
    const f = el.dataset.field;
    if (f === '@brand' || f === '@meta') setPanel('deck'); else setPanel('slide');
    setTimeout(() => {
      const target = inspectorRef.current?.querySelector(`[data-path="${f}"]`);
      if (!target) return;
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      (target.matches('input, textarea') ? target : target.querySelector('input, textarea, button'))?.focus({ preventScroll: true });
    }, 30);
  };

  // Keys: ↑/↓ (or PageUp/Down) between slides when not typing.
  useEffect(() => {
    const onKey = (e) => {
      if (presenting != null || e.target.closest('input, textarea, select, [contenteditable]')) return;
      const d = ['ArrowDown', 'PageDown'].includes(e.key) ? 1 : ['ArrowUp', 'PageUp'].includes(e.key) ? -1 : 0;
      if (!d) return;
      const next = slides[selIndex + d];
      if (next) { e.preventDefault(); pick(next.id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const remove = () => ask({
    title: 'Delete this presentation?', message: `“${deck.title || 'Untitled'}” and its pictures go to the Trash — you can restore them from there.`, confirmLabel: 'Delete', danger: true,
    onConfirm: async () => {
      await saver.flush();
      const { trashId } = await api.removePresentation(id);
      navigate('/presentations');
      toast('Presentation moved to Trash', 'ok', { label: 'Undo', onClick: async () => { await api.restoreTrash(trashId); navigate(`/presentations/${id}`); } });
    },
  });
  const duplicate = async () => {
    try { await saver.flush(); const p = await api.duplicatePresentation(id); navigate(`/presentations/${p.id}`); toast('A copy — you’re in it now'); } catch (e) { toast(e.message, 'error'); }
  };
  const saveDefaults = async () => {
    try { await saver.flush(); await api.savePresentationDefaults(id); toast('New presentations start with this look and these details'); } catch (e) { toast(e.message, 'error'); }
  };
  const exportPdf = async () => { await saver.flush(); setPrinting(true); toast('Choose “Save as PDF” in the print dialog'); };

  if (error) return <div className="detail"><button className="detail-back" onClick={() => navigate('/presentations')}><ArrowLeft size={16} /> Presentations</button><div className="center-msg">Couldn’t load: {error}</div></div>;
  if (!deck) return <div className="spinner" />;

  const addMenu = SLIDE_TYPE_KEYS.map((k) => ({ label: SLIDE_TYPES[k].label, note: '', icon: <LayoutTemplate size={15} />, onClick: () => addSlide(k), title: SLIDE_TYPES[k].hint }));
  const shown = slides.filter((s) => !s.hidden).length;
  return (
    <div className="pz-editor">
      <div className="pz-bar">
        <button className="detail-back" style={{ margin: 0 }} onClick={() => navigate('/presentations')}><ArrowLeft size={16} /> <span className="pz-hide-s">Presentations</span></button>
        <input className="pz-title" value={deck.title} placeholder="Untitled presentation" onChange={(e) => onDeck({ title: e.target.value })} aria-label="Name of the presentation" />
        <div className="pz-bar-tools">
          <button type="button" className="btn" onClick={exportPdf} disabled={!shown}><FileDown size={16} /> <span className="pz-hide-s">PDF</span></button>
          <button type="button" className="btn btn-primary" onClick={async () => { await saver.flush(); setPresenting(Math.max(0, slides.filter((s) => !s.hidden).indexOf(sel))); }} disabled={!shown}><Play size={16} /> Present</button>
          <Menu align="right" trigger={<button type="button" className="icon-btn" aria-label="More"><MoreHorizontal size={18} /></button>} items={[
            { label: deck.pinned ? 'Unpin' : 'Pin to the top', icon: deck.pinned ? <PinOff size={15} /> : <Pin size={15} />, onClick: () => onDeck({ pinned: !deck.pinned }) },
            { label: 'Duplicate the presentation', icon: <Copy size={15} />, onClick: duplicate },
            { label: 'Use this look for new ones', icon: <Settings2 size={15} />, onClick: saveDefaults },
            { separator: true },
            { label: 'Delete', icon: <Trash2 size={15} />, danger: true, onClick: remove },
          ]} />
        </div>
      </div>

      <div className="pz-layout">
        <aside className="pz-strip" ref={stripRef} aria-label="Slides">
          {slides.map((s, i) => {
            const st = sort.itemState(s.id);
            return (
              <div key={s.id} data-sort-id={s.id} className={`pz-thumb ${s.id === selId ? 'on' : ''} ${s.hidden ? 'hidden' : ''} ${st.className}`} style={st.style}>
                <button type="button" className="pz-thumb-btn" {...sort.grab(s.id)} onClick={() => pick(s.id)} aria-label={`Slide ${i + 1}: ${slideName(s)}`} aria-current={s.id === selId}>
                  <span className="pz-thumb-n">{i + 1}</span>
                  <SlideView deck={deck} slide={s} index={i} total={slides.length} className="pz-thumb-view" />
                </button>
                <Menu align="right" trigger={<button type="button" className="icon-btn pz-thumb-menu" data-no-sort aria-label="Slide options"><MoreHorizontal size={14} /></button>} items={[
                  { label: 'Duplicate', icon: <Copy size={15} />, onClick: () => duplicateSlide(s) },
                  { label: s.hidden ? 'Show when presenting' : 'Hide when presenting', icon: s.hidden ? <Eye size={15} /> : <EyeOff size={15} />, onClick: () => patchSlide(s.id, (x) => ({ ...x, hidden: !x.hidden })) },
                  { label: 'Move up', icon: <ChevronUp size={15} />, disabled: i === 0, onClick: () => moveSlide(s, -1) },
                  { label: 'Move down', icon: <ChevronDown size={15} />, disabled: i === slides.length - 1, onClick: () => moveSlide(s, 1) },
                  { separator: true },
                  { label: 'Delete', icon: <Trash2 size={15} />, danger: true, onClick: () => removeSlide(s) },
                ]} />
              </div>
            );
          })}
          <Menu align="left" title="Add a slide" trigger={<button type="button" className="btn btn-sm pz-add"><Plus size={14} /> Add a slide</button>} items={addMenu} />
        </aside>

        <main className="pz-stage">
          {sel ? (
            <>
              <div className={`pz-stage-slide pz-editing ${sel.hidden ? 'hidden' : ''}`} onClick={findField}>
                <SlideView deck={deck} slide={sel} index={selIndex} total={slides.length} editing />
              </div>
              <div className="pz-stage-foot">
                <span>{selIndex + 1} / {slides.length} · {SLIDE_TYPES[sel.type].label}{sel.hidden ? ' · hidden when presenting' : ''}</span>
                <span className="pz-hide-s">Click a text or picture to edit it · ↑ ↓ between slides</span>
              </div>
            </>
          ) : (
            <div className="empty"><DeckIcon size={30} /><h3>No slides</h3><p>Add the first one.</p></div>
          )}
        </main>

        <section className="pz-inspector" ref={inspectorRef}>
          <div className="segmented pz-tabs" role="tablist">
            <button type="button" role="tab" className={panel === 'slide' ? 'on' : ''} aria-selected={panel === 'slide'} onClick={() => setPanel('slide')}>Slide</button>
            <button type="button" role="tab" className={panel === 'deck' ? 'on' : ''} aria-selected={panel === 'deck'} onClick={() => setPanel('deck')}>Presentation</button>
          </div>
          {panel === 'slide' && sel && <SlideFields key={sel.id} deck={deck} slide={sel} onData={onData} onSlide={(p) => patchSlide(sel.id, (s) => ({ ...s, ...p }))} onUpload={upload} busy={busy} />}
          {panel === 'deck' && <DeckPanel deck={deck} clients={lists.clients} plans={lists.plans} onDeck={onDeck} onUpload={upload} onDefaults={saveDefaults} busy={busy} />}
        </section>
      </div>
      {presenting != null && <Presenter deck={deck} start={presenting} onClose={() => setPresenting(null)} />}
      {printing && <PrintDeck deck={deck} onDone={() => setPrinting(false)} />}
      {dialog}
    </div>
  );
}
