import { useEffect, useMemo, useState } from 'react';
import { X, Archive, Film, Images, Palette, Check, FileText } from 'lucide-react';
import { api, planFileUrl, fileUrl } from '../../lib/api.js';
import { probeVideo, captureCover } from '../../lib/media.js';
import { expandColor } from '../../lib/color.js';
import TagInput from '../TagInput.jsx';

const VIDEO = /\.(mp4|m4v|mov|webm|mkv|ogv)$/i;
const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg)$/i;
const PDF = /\.pdf$/i;
// Groups whose name sounds like the final look are ticked from the start.
const KEEP = /styleframe|logo|final|brand|key ?visual|design|guideline|concept|abgabe|entwurf/i;

// What in this plan can go to the library: videos (review versions and video
// files), groups of images / PDFs (moodboards, PDF and file blocks), and the
// palette colours.
function candidates(plan) {
  const videos = [];
  const groups = [];
  const colors = [];
  for (const b of plan.blocks || []) {
    if (b.type === 'review') {
      (b.versions || []).forEach((v, i) => {
        if (VIDEO.test(v.file || '')) videos.push({ blockId: b.id, itemId: v.id, file: v.file, label: `${b.title} · ${v.label || `v${i + 1}`}${v.approved ? ' · approved' : ''}`, approved: v.approved, order: i });
      });
    }
    if (b.type === 'files') {
      for (const f of b.files || []) if (VIDEO.test(f.file || '')) videos.push({ blockId: b.id, itemId: f.id, file: f.file, label: `${b.title} · ${f.title || f.name}` });
    }
    if (b.type === 'moodboard' || b.type === 'pdf' || b.type === 'files') {
      const list = b.type === 'moodboard' ? (b.images || []) : (b.files || []);
      const items = list.filter((f) => IMAGE.test(f.file || '') || PDF.test(f.file || ''))
        .map((f) => ({ key: `${b.id}:${f.id}`, blockId: b.id, itemId: f.id, file: f.file, pdf: PDF.test(f.file), name: f.title || f.name || '' }));
      if (items.length) groups.push({ id: b.id, title: b.title || 'Untitled', items });
    }
    if (b.type === 'palette') {
      for (const c of b.items || []) if (/^#[0-9a-f]{6}$/i.test(c.hex || '') && !colors.some((x) => x.hex.toUpperCase() === c.hex.toUpperCase())) colors.push(c);
    }
  }
  return { videos, groups, colors };
}

// The version to keep by default: the last approved one, else the newest.
function defaultVideo(videos) {
  const review = videos.filter((v) => v.order !== undefined);
  const approved = review.filter((v) => v.approved);
  const pick = approved[approved.length - 1] || review[review.length - 1] || videos[0];
  return pick ? `${pick.blockId}:${pick.itemId}` : '';
}

/**
 * Keep a finished plan in the library: the final video becomes a Motion
 * reference, the chosen images / PDFs a Branding reference and the palette
 * a Color reference — as copies, the plan stays as it is.
 */
export default function ArchiveModal({ plan, client, flush, onDone, onClose }) {
  const { videos, groups, colors } = useMemo(() => candidates(plan), [plan]);
  const [video, setVideo] = useState(() => defaultVideo(videos));
  const [picked, setPicked] = useState(() => new Set(groups.filter((g) => KEEP.test(g.title)).flatMap((g) => g.items.map((i) => i.key))));
  const [keepColors, setKeepColors] = useState(colors.length > 0);
  const [title, setTitle] = useState(plan.name || '');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [tags, setTags] = useState(() => [client, 'Own work'].map((t) => (t || '').trim()).filter(Boolean));
  const [setArchived, setSetArchived] = useState(plan.status !== 'archived');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const toggle = (key) => setPicked((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const toggleGroup = (g) => setPicked((s) => {
    const n = new Set(s);
    const all = g.items.every((i) => n.has(i.key));
    for (const i of g.items) { if (all) n.delete(i.key); else n.add(i.key); }
    return n;
  });

  const chosenVideo = videos.find((v) => `${v.blockId}:${v.itemId}` === video) || null;
  const chosenItems = groups.flatMap((g) => g.items.filter((i) => picked.has(i.key)));
  const count = (chosenVideo ? 1 : 0) + (chosenItems.length ? 1 : 0) + (keepColors && colors.length ? 1 : 0);

  const submit = async () => {
    if (!count || busy) return;
    setBusy('Saving the plan…');
    try {
      await flush?.();
      const name = title.trim() || plan.name;
      const body = { title: name, year: year.trim(), tags, archive: setArchived };
      if (chosenVideo) {
        setBusy('Reading the video…');
        const meta = await probeVideo(planFileUrl(plan, chosenVideo.file));
        body.motion = { blockId: chosenVideo.blockId, itemId: chosenVideo.itemId, title: name, duration: meta?.d || 0, width: meta?.w || 0, height: meta?.h || 0 };
      }
      if (chosenItems.length) body.branding = { title: name, items: chosenItems.map((i) => ({ blockId: i.blockId, itemId: i.itemId })) };
      if (keepColors && colors.length) {
        body.color = {
          title: `${name} palette`,
          colors: colors.map((c) => {
            const x = expandColor('hex', c.hex);
            return { name: c.name || '', hex: c.hex, ...(x ? { rgb: x.rgb, cmyk: x.cmyk, pantone: x.pantone } : {}) };
          }),
        };
      }
      setBusy('Copying files…');
      const res = await api.archivePlan(plan.id, body);
      // The motion reference gets a cover frame like any uploaded video.
      const motion = res.projects.find((p) => p.type === 'motion');
      if (motion?.video) {
        setBusy('Making a cover…');
        const blob = await captureCover(fileUrl(motion, motion.video));
        if (blob) {
          try { Object.assign(motion, await api.setThumb(motion.id, blob, null)); } catch { /* the card falls back to the video */ }
        }
      }
      onDone(res);
    } catch (e) {
      setBusy('');
      onDone(null, e);
    }
  };

  const nothing = !videos.length && !groups.length && !colors.length;

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal archive-modal" role="dialog" aria-modal="true" aria-label="Archive as reference">
        <div className="modal-head">
          <h2>Archive as reference</h2>
          <button className="icon-btn" onClick={onClose} disabled={!!busy} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <p className="hint" style={{ marginTop: 0 }}>
            The finished work goes into your library as references, next to the work of others. The files are copied — this plan stays as it is.
          </p>
          {nothing && <div className="empty-hint">This plan has no videos, images, PDFs or colours yet.</div>}

          {videos.length > 0 && (
            <div className="ar-part">
              <div className="ar-head"><Film size={15} /> Motion <span className="hint">the final video</span></div>
              <div className="ar-videos">
                {videos.map((v) => {
                  const key = `${v.blockId}:${v.itemId}`;
                  return (
                    <label key={key} className={`ar-video ${video === key ? 'on' : ''}`}>
                      <input type="radio" name="ar-video" checked={video === key} onChange={() => setVideo(key)} />
                      <span>{v.label}</span>
                    </label>
                  );
                })}
                <label className={`ar-video ${!video ? 'on' : ''}`}>
                  <input type="radio" name="ar-video" checked={!video} onChange={() => setVideo('')} />
                  <span className="muted">No video</span>
                </label>
              </div>
            </div>
          )}

          {groups.length > 0 && (
            <div className="ar-part">
              <div className="ar-head"><Images size={15} /> Branding <span className="hint">images and PDFs — tap to leave one out</span></div>
              {groups.map((g) => {
                const n = g.items.filter((i) => picked.has(i.key)).length;
                return (
                  <div className="ar-group" key={g.id}>
                    <label className="ar-group-head">
                      <input type="checkbox" checked={n === g.items.length} ref={(el) => { if (el) el.indeterminate = n > 0 && n < g.items.length; }} onChange={() => toggleGroup(g)} />
                      <span>{g.title}</span> <span className="count">{n}/{g.items.length}</span>
                    </label>
                    <div className="ar-thumbs">
                      {g.items.map((i) => (
                        <button type="button" key={i.key} className={`ar-thumb ${picked.has(i.key) ? 'on' : ''}`} onClick={() => toggle(i.key)} title={i.name || undefined} aria-pressed={picked.has(i.key)}>
                          {i.pdf ? <span className="ar-pdf"><FileText size={18} /><span>{i.name || 'PDF'}</span></span> : <img src={planFileUrl(plan, i.file)} alt="" loading="lazy" />}
                          {picked.has(i.key) && <span className="ar-tick"><Check size={12} /></span>}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {colors.length > 0 && (
            <div className="ar-part">
              <label className="ar-head ar-check">
                <input type="checkbox" checked={keepColors} onChange={(e) => setKeepColors(e.target.checked)} />
                <Palette size={15} /> Colour palette <span className="count">{colors.length}</span>
              </label>
              <div className="ar-swatches">{colors.map((c) => <span key={c.id || c.hex} style={{ background: c.hex }} title={c.name || c.hex} />)}</div>
            </div>
          )}

          {!nothing && (
            <>
              <div className="row-2" style={{ marginTop: 14 }}>
                <div className="field">
                  <label>Title</label>
                  <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={plan.name} />
                </div>
                <div className="field">
                  <label>Year</label>
                  <input className="input" value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" />
                </div>
              </div>
              <div className="field">
                <label>Tags</label>
                <TagInput tags={tags} onChange={setTags} />
              </div>
              <label className="ar-check ar-status">
                <input type="checkbox" checked={setArchived} onChange={(e) => setSetArchived(e.target.checked)} />
                Set this plan to <b>Archived</b>
              </label>
            </>
          )}
        </div>
        <div className="modal-foot">
          {busy && <span className="hint ar-busy">{busy}</span>}
          <button className="btn btn-ghost" onClick={onClose} disabled={!!busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={!count || !!busy}>
            <Archive size={15} /> {count ? `Add ${count} reference${count === 1 ? '' : 's'}` : 'Choose something'}
          </button>
        </div>
      </div>
    </div>
  );
}
