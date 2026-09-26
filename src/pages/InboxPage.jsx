import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Inbox as InboxIcon, UploadCloud, Link2, FileText, Film, Trash2, Copy, ExternalLink,
  PencilRuler, MoreHorizontal, Check, X, Smartphone, Plus, File as FileIcon, Square, Ban, Palette, Type, Images, StickyNote,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { inboxFileUrl, inboxKind, inboxFile, notifyInbox } from '../lib/inbox.js';
import { parseVideoLink, PROVIDER_LABEL } from '../lib/videoLinks.js';
import { hostOf, normalizeUrl } from '../lib/types.js';
import { useToast } from '../components/Toast.jsx';
import Menu from '../components/Menu.jsx';
import PlanPicker from '../components/PlanPicker.jsx';
import UploadModal from '../components/UploadModal.jsx';

// What each kind of item can become in the library (first = suggested).
const NEW_FOR = {
  image: ['branding', 'imagegallery', 'logo', 'logonogo', 'color', 'font'],
  svg: ['logo', 'logonogo', 'branding'],
  video: ['motion'],
  pdf: ['branding'],
  'video-link': ['motion'],
  link: [], file: [], text: [],
};
const NEW_META = {
  branding: { label: 'Branding', icon: FileText },
  imagegallery: { label: 'Image gallery', icon: Images },
  logo: { label: 'Logo', icon: Square },
  logonogo: { label: 'Logo No Go', icon: Ban },
  color: { label: 'Colors (from the image)', icon: Palette },
  font: { label: 'Font', icon: Type },
  motion: { label: 'Motion', icon: Film },
};
const VIA = { share: 'Shared from your phone', shortcut: 'From a Shortcut', app: 'Added here' };

const timeAgo = (ts) => {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  for (const [name, secs] of [['day', 86400], ['hour', 3600], ['minute', 60]]) {
    const v = Math.floor(s / secs);
    if (v >= 1) return `${v} ${name}${v > 1 ? 's' : ''} ago`;
  }
  return 'just now';
};
// Links to font sites can become a Font reference.
const newTypes = (it) => {
  const k = inboxKind(it);
  if (k === 'link' && /font/i.test(hostOf(it.url) || '')) return ['font'];
  return NEW_FOR[k] || [];
};

/**
 * The Inbox: everything shared from a phone ("Share → Confinium", an iOS
 * Shortcut) or dropped / pasted here, waiting to be sorted — into a new
 * library reference, or into a plan.
 */
export default function InboxPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [draft, setDraft] = useState('');
  const [upload, setUpload] = useState(null);   // { prefill, ids }
  const [planFor, setPlanFor] = useState(null); // items to put into a plan
  const [plans, setPlans] = useState([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);

  const load = useCallback(() => api.listInbox().then((list) => {
    setItems(list);
    setSelected((s) => new Set([...s].filter((id) => list.some((x) => x.id === id))));
  }).catch((e) => { setItems((cur) => cur || []); toast(`Could not load the inbox: ${e.message}`, 'error'); }), [toast]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);
  const changed = () => { load(); notifyInbox(); };

  // Arrived via the phone's share sheet (/inbox?shared=N).
  useEffect(() => {
    const shared = params.get('shared');
    if (shared == null) return;
    if (shared === 'error') toast('Sharing failed — please try again', 'error');
    else if (Number(shared) > 0) toast(`${shared} item${shared === '1' ? '' : 's'} added to the inbox`);
    else toast('Nothing arrived — share a file, a link or some text', 'error');
    setParams({}, { replace: true });
  }, [params, setParams, toast]);

  // --- Adding ---------------------------------------------------------------
  const add = async (payload) => {
    setBusy(true);
    try {
      const added = await api.addToInbox(payload);
      toast(`Added ${added.length} item${added.length === 1 ? '' : 's'}`);
      changed();
    } catch (e) { toast(`Could not add: ${e.message}`, 'error'); }
    finally { setBusy(false); }
  };
  const submitDraft = (e) => {
    e.preventDefault();
    const t = draft.trim();
    if (!t) return;
    setDraft('');
    add({ text: t });
  };
  // Paste images / files anywhere on the page, or text outside a field.
  useEffect(() => {
    const onPaste = (e) => {
      if (upload || planFor) return;
      const files = [...(e.clipboardData?.files || [])];
      if (files.length) { e.preventDefault(); add({ files }); return; }
      const inField = e.target instanceof HTMLElement && e.target.closest('input, textarea, [contenteditable="true"]');
      const text = e.clipboardData?.getData('text/plain')?.trim();
      if (!inField && text) { e.preventDefault(); add({ text }); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }); // re-bound each render so it sees the current dialogs
  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) { add({ files }); return; }
    const text = (e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain') || '').split('\n').find((l) => l && !l.startsWith('#'));
    if (text) add({ text: text.trim() });
  };

  // --- Sorting --------------------------------------------------------------
  const toLibrary = async (type, list) => {
    const ids = list.map((i) => i.id);
    const first = list[0];
    if (first.kind === 'link') { setUpload({ ids, prefill: { type, url: first.url, title: first.title || '' } }); return; }
    setBusy(true);
    try {
      const files = await Promise.all(list.filter((i) => i.kind === 'file').map(inboxFile));
      // Items shared together carry the same title (e.g. the page they came from).
      const title = list.every((i) => (i.title || '') === (first.title || '')) ? first.title || '' : '';
      setUpload({ ids, prefill: { type, files, title } });
    } catch (e) { toast(`Could not open the file: ${e.message}`, 'error'); }
    finally { setBusy(false); }
  };
  const onCreated = async (project) => {
    const { ids } = upload;
    setUpload(null);
    await Promise.all(ids.map((id) => api.removeInboxItem(id, { used: true }).catch(() => {})));
    setSelected(new Set());
    changed();
    if (project?.id) { toast('Added to the library'); navigate(`/project/${project.id}`); }
    else if (project?.type) { toast('Images added'); navigate(`/${project.type}`); }
  };

  const askPlan = (list) => {
    setPlanFor(list);
    api.listPlans().then(setPlans).catch(() => setPlans([]));
  };
  const toPlan = async (planId) => {
    const list = planFor;
    setPlanFor(null);
    if (!planId || !list?.length) return;
    setBusy(true);
    let plan = null; let ok = 0;
    for (const it of list) {
      try { plan = (await api.inboxToPlan(it.id, planId)).plan; ok += 1; } catch (e) { toast(`Could not add “${it.title || it.name || 'item'}”: ${e.message}`, 'error'); }
    }
    setBusy(false);
    setSelected(new Set());
    changed();
    if (plan) toast(`Added ${ok} item${ok === 1 ? '' : 's'} to “${plan.name}”`, 'ok', { label: 'Open plan', onClick: () => navigate(`/plan/${plan.id}`) });
  };

  const remove = async (list) => {
    const trashIds = [];
    for (const it of list) {
      try { const r = await api.removeInboxItem(it.id); if (r.trashId) trashIds.push(r.trashId); } catch (e) { toast(`Delete failed: ${e.message}`, 'error'); }
    }
    setSelected(new Set());
    changed();
    if (trashIds.length) {
      toast(`Deleted ${trashIds.length} item${trashIds.length === 1 ? '' : 's'}`, 'ok', {
        label: 'Undo',
        onClick: async () => { for (const t of trashIds) await api.restoreTrash(t).catch(() => {}); changed(); },
      });
    }
  };
  const copy = async (it) => {
    try { await navigator.clipboard.writeText([it.title, it.text, it.url].filter(Boolean).join('\n')); toast('Copied'); }
    catch { toast('Copy failed', 'error'); }
  };

  const toggle = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const sel = (items || []).filter((i) => selected.has(i.id));
  const selKinds = new Set(sel.map(inboxKind));
  const canBranding = sel.length > 0 && [...selKinds].every((k) => k === 'image' || k === 'svg' || k === 'pdf');
  const canGallery = sel.length > 0 && [...selKinds].every((k) => k === 'image');

  return (
    <div className={`inbox-page ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => { e.preventDefault(); if (!dragging) setDragging(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={onDrop}>
      <div className="page-head-row">
        <div className="page-head">
          <h1>Inbox {items?.length > 0 && <span className="count">{items.length}</span>}</h1>
          <p>What you share from your phone lands here. Turn it into a reference, or put it into a plan.</p>
        </div>
      </div>

      <form className="inbox-add" onSubmit={submitDraft}>
        <Link2 size={16} />
        <input className="input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Paste a link or write a note…" aria-label="Link or note" />
        {draft.trim() && <button className="btn btn-sm btn-primary" disabled={busy}><Plus size={14} /> Add</button>}
        <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={busy}><UploadCloud size={14} /> Files</button>
        <input ref={fileRef} type="file" multiple className="visually-hidden-input" onChange={(e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) add({ files: f }); }} />
      </form>

      {sel.length > 0 && (
        <div className="inbox-selbar">
          <span><b>{sel.length}</b> selected</span>
          {canBranding && <button className="btn btn-sm" onClick={() => toLibrary('branding', sel)} disabled={busy}><FileText size={14} /> New Branding</button>}
          {canGallery && <button className="btn btn-sm" onClick={() => toLibrary('imagegallery', sel)} disabled={busy}><Images size={14} /> To Image gallery</button>}
          <button className="btn btn-sm" onClick={() => askPlan(sel)} disabled={busy}><PencilRuler size={14} /> Add to plan</button>
          <button className="btn btn-sm btn-ghost" onClick={() => remove(sel)} disabled={busy}><Trash2 size={14} /> Delete</button>
          <button className="icon-btn" onClick={() => setSelected(new Set())} title="Clear selection" aria-label="Clear selection"><X size={15} /></button>
        </div>
      )}

      {!items && <div className="spinner" />}
      {items && items.length === 0 && <EmptyInbox />}
      {items && items.length > 0 && (
        <div className="inbox-grid">
          {items.map((it) => (
            <InboxCard key={it.id} item={it} selected={selected.has(it.id)} busy={busy} onToggle={() => toggle(it.id)}
              onNew={(type) => toLibrary(type, [it])} onPlan={() => askPlan([it])} onCopy={() => copy(it)} onRemove={() => remove([it])} />
          ))}
        </div>
      )}
      {items && items.length > 0 && <ShareHelp />}

      {upload && (
        <UploadModal prefill={upload.prefill} initialType={upload.prefill.type} onClose={() => setUpload(null)} onCreated={onCreated} />
      )}
      {planFor && <PlanPicker plans={plans} title={planFor.length > 1 ? `Add ${planFor.length} items to plan` : 'Add to plan'} onPick={toPlan} onClose={() => setPlanFor(null)} />}
    </div>
  );
}

function InboxCard({ item, selected, busy, onToggle, onNew, onPlan, onCopy, onRemove }) {
  const kind = inboxKind(item);
  const types = newTypes(item);
  const url = inboxFileUrl(item);
  const video = kind === 'video-link' ? parseVideoLink(item.url) : null;
  const main = types[0];
  const MainIcon = main ? NEW_META[main].icon : PencilRuler;
  const heading = item.title || (item.kind === 'file' ? item.name : item.kind === 'link' ? hostOf(item.url) : '') || '';

  let media;
  if (kind === 'image' || kind === 'svg') media = <img src={url} alt="" loading="lazy" />;
  else if (kind === 'video') media = <video src={`${url}#t=0.1`} preload="metadata" muted playsInline />;
  else if (video?.provider === 'youtube') media = <img src={`https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`} alt="" loading="lazy" referrerPolicy="no-referrer" />;
  else if (kind === 'text') media = <div className="ib-text">{item.text || item.title}</div>;
  else {
    const Icon = kind === 'pdf' ? FileText : kind === 'video-link' ? Film : kind === 'link' ? Link2 : FileIcon;
    media = <div className="ib-icon"><Icon size={26} /><span>{kind === 'link' || kind === 'video-link' ? hostOf(item.url) : (item.name || '').split('.').pop()?.toUpperCase()}</span></div>;
  }

  const menu = [
    ...types.map((t) => ({ label: `New ${NEW_META[t].label}`, icon: (() => { const I = NEW_META[t].icon; return <I size={15} />; })(), onClick: () => onNew(t) })),
    { label: 'Add to plan…', icon: <PencilRuler size={15} />, onClick: onPlan },
    { separator: true },
    ...(item.url ? [{ label: 'Open link', icon: <ExternalLink size={15} />, onClick: () => window.open(normalizeUrl(item.url), '_blank', 'noopener') }] : []),
    ...(url ? [{ label: 'Open file', icon: <ExternalLink size={15} />, onClick: () => window.open(url, '_blank', 'noopener') }] : []),
    ...(item.kind !== 'file' ? [{ label: 'Copy', icon: <Copy size={15} />, onClick: onCopy }] : []),
    { label: 'Delete', icon: <Trash2 size={15} />, danger: true, onClick: onRemove },
  ];

  return (
    <div className={`inbox-card ${selected ? 'selected' : ''}`}>
      <div className={`ib-media ib-${kind}`}>
        {media}
        {video && <span className="ib-badge">{PROVIDER_LABEL[video.provider]}</span>}
        <button className={`ib-select ${selected ? 'on' : ''}`} onClick={onToggle} title={selected ? 'Deselect' : 'Select'} aria-pressed={selected} aria-label="Select">
          {selected && <Check size={13} />}
        </button>
      </div>
      <div className="ib-body">
        {heading && <div className="ib-title" title={heading}>{heading}</div>}
        {item.kind !== 'text' && item.text && <div className="ib-note">{item.text}</div>}
        {item.kind === 'file' && item.url && <div className="ib-note">{hostOf(item.url)}</div>}
        <div className="ib-meta">{kind === 'text' ? <StickyNote size={12} /> : item.via === 'share' || item.via === 'shortcut' ? <Smartphone size={12} /> : <InboxIcon size={12} />} {VIA[item.via] || 'Added'} · {timeAgo(item.createdAt || Date.now())}</div>
      </div>
      <div className="ib-actions">
        {main
          ? <button className="btn btn-sm" onClick={() => onNew(main)} disabled={busy}><MainIcon size={14} /> {NEW_META[main].label.replace(/ \(.*\)$/, '')}</button>
          : <button className="btn btn-sm" onClick={onPlan} disabled={busy}><PencilRuler size={14} /> Add to plan</button>}
        {main && <button className="icon-btn" onClick={onPlan} title="Add to plan…" aria-label="Add to plan" disabled={busy}><PencilRuler size={15} /></button>}
        <Menu align="right" title="Sort into…" trigger={<button className="icon-btn" aria-label="More"><MoreHorizontal size={16} /></button>} items={menu} />
      </div>
    </div>
  );
}

function EmptyInbox() {
  return (
    <div className="empty inbox-empty">
      <InboxIcon size={30} />
      <h3>Nothing to sort</h3>
      <p>Drop files here, paste an image or a link (⌘V / Ctrl+V), or share from your phone.</p>
      <ShareHelp open />
    </div>
  );
}

function ShareHelp({ open = false }) {
  return (
    <details className="share-help" open={open}>
      <summary><Smartphone size={15} /> Share from your phone</summary>
      <ul>
        <li><b>Android:</b> open Confinium in Chrome (over HTTPS, e.g. <code>tailscale serve</code>) and choose ⋮ → <i>Install app</i>. After that, <i>Share → Confinium</i> works from any app — photos, screenshots, videos, PDFs and links.</li>
        <li><b>iPhone / iPad:</b> iOS doesn’t offer web apps in the share sheet. Set up the “Confinium Inbox” Shortcut once (see the README) and pick it from the share sheet.</li>
        <li><b>Computer:</b> drop files onto this page or paste them.</li>
      </ul>
    </details>
  );
}
