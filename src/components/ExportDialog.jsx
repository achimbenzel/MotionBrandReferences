import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Download, FolderInput, Film, Image as ImageIcon } from 'lucide-react';

const EXT = { png: 'png', jpg: 'jpg', webp: 'webp', mp4: 'mp4', webm: 'webm' };
const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm' };
const FORMAT_LABEL = { png: 'PNG', jpg: 'JPG', webp: 'WebP', mp4: 'MP4', webm: 'WebM' };
const clampInt = (v, a, b) => Math.min(b, Math.max(a, Math.round(Number(v) || a)));
const slug = (s) => String(s || 'export').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'export';

function load(key) { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; } }
function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode */ } }

/**
 * Export options, shared by the mockup editor and the Brand Tester: what to
 * export (`targets`), its size (presets or your own), background
 * (transparent, a colour …), file format and quality — or, for a video,
 * resolution, frame rate and format with a progress bar.
 *
 * A target: { key, label, kind: 'image' | 'video', aspect (w / h, or null =
 * free), sizes: [{ label, w, h? }], backgrounds: [{ key, label, swatch? }],
 * allowColor, formats, options: [{ key, label, type: 'range' | 'select', … }],
 * fps: [24, 30, 60], note, maxSize }.
 * `onExport(target, opts, { onProgress, signal })` → Blob.
 */
export default function ExportDialog({ title = 'Export', targets, initial, storeKey, name: name0, onExport, onSaveToPlan, onClose }) {
  const saved = useMemo(() => (storeKey ? load(storeKey) : {}), [storeKey]);
  const [targetKey, setTargetKey] = useState(() => (targets.some((t) => t.key === (initial || saved.target)) ? (initial || saved.target) : targets[0].key));
  const target = targets.find((t) => t.key === targetKey) || targets[0];
  const mem = saved[target.key] || {};
  const [sizeIdx, setSizeIdx] = useState(mem.sizeIdx ?? target.defaultSize ?? 0);
  const [custom, setCustom] = useState(mem.custom || { w: target.sizes[0]?.w || 1920, h: target.sizes[0]?.h || 1080 });
  const [bg, setBg] = useState(mem.bg || target.defaultBackground || target.backgrounds?.[0]?.key || 'scene');
  const [color, setColor] = useState(mem.color || '#FFFFFF');
  const [format, setFormat] = useState(mem.format && target.formats.includes(mem.format) ? mem.format : target.formats[0]);
  const [quality, setQuality] = useState(mem.quality || 0.92);
  const [fps, setFps] = useState(mem.fps || 30);
  const [opts, setOpts] = useState(() => Object.fromEntries((target.options || []).map((o) => [o.key, mem.opts?.[o.key] ?? o.default])));
  const [name, setName] = useState(name0 || 'export');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const abort = useRef(null);

  // Switching what to export: take that target's remembered settings.
  const switchTarget = (key) => {
    const t = targets.find((x) => x.key === key);
    const m = saved[key] || {};
    setTargetKey(key);
    setSizeIdx(m.sizeIdx ?? t.defaultSize ?? 0);
    setCustom(m.custom || { w: t.sizes[0]?.w || 1920, h: t.sizes[0]?.h || 1080 });
    setBg(m.bg || t.defaultBackground || t.backgrounds?.[0]?.key || 'scene');
    setFormat(m.format && t.formats.includes(m.format) ? m.format : t.formats[0]);
    setOpts(Object.fromEntries((t.options || []).map((o) => [o.key, m.opts?.[o.key] ?? o.default])));
    setError('');
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);
  useEffect(() => () => abort.current?.abort(), []);

  const max = target.maxSize || 8192;
  const preset = sizeIdx === 'custom' ? null : target.sizes[sizeIdx] || target.sizes[0];
  const width = clampInt(preset ? preset.w : custom.w, 16, max);
  const height = clampInt(preset ? (preset.h ?? width / target.aspect) : target.aspect ? width / target.aspect : custom.h, 16, max);
  const isVideo = target.kind === 'video';
  const transparent = bg === 'transparent';
  const noAlpha = format === 'jpg' || isVideo;

  const pickBg = (key) => {
    setBg(key);
    if (key === 'transparent' && format === 'jpg') setFormat(target.formats.includes('png') ? 'png' : target.formats[0]);
  };
  const pickFormat = (f) => {
    setFormat(f);
    if ((f === 'jpg' || isVideo) && bg === 'transparent') setBg(target.backgrounds.find((b) => b.key !== 'transparent')?.key || 'color');
  };

  const run = async () => {
    setBusy(true); setError(''); setProgress(0);
    const ctrl = new AbortController();
    abort.current = ctrl;
    const o = { width, height, background: bg, color, format, mime: MIME[format], quality, fps, ...opts };
    if (storeKey) save(storeKey, { ...saved, target: target.key, [target.key]: { sizeIdx, custom, bg, color, format, quality, fps, opts } });
    try {
      const blob = await onExport(target, o, { onProgress: setProgress, signal: ctrl.signal });
      if (!blob) throw new Error('Rendering failed');
      return new File([blob], `${slug(name)}.${EXT[format]}`, { type: MIME[format] });
    } catch (e) {
      if (e?.name !== 'AbortError') setError(e.message || String(e));
      return null;
    } finally { setBusy(false); abort.current = null; }
  };
  const download = async () => {
    const file = await run();
    if (!file) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 8000);
    onClose();
  };
  const toPlan = async () => {
    const file = await run();
    if (file) onSaveToPlan(file);
  };

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal xd" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} disabled={busy} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body xd-body">
          {targets.length > 1 && (
            <div className="segmented xd-targets" role="tablist">
              {targets.map((t) => (
                <button key={t.key} type="button" role="tab" aria-selected={t.key === target.key} className={t.key === target.key ? 'on' : ''} onClick={() => switchTarget(t.key)} disabled={busy}>
                  {t.kind === 'video' ? <Film size={13} /> : <ImageIcon size={13} />} {t.label}
                </button>
              ))}
            </div>
          )}
          {target.note && <div className="hint xd-note">{target.note}</div>}

          <div className="xd-field">
            <span className="xd-label">{isVideo ? 'Resolution' : 'Size'}</span>
            <div className="xd-chips">
              {target.sizes.map((s, i) => {
                const h = s.h ?? Math.round(s.w / target.aspect);
                return <button key={s.label} type="button" className={sizeIdx === i ? 'on' : ''} onClick={() => setSizeIdx(i)} title={`${s.w} × ${h} px`}>{s.label}<small>{s.w} × {h}</small></button>;
              })}
              <button type="button" className={sizeIdx === 'custom' ? 'on' : ''} onClick={() => setSizeIdx('custom')}>Custom<small>your size</small></button>
            </div>
            {sizeIdx === 'custom' && (
              <div className="xd-custom">
                <label>Width <input className="input" type="number" min="16" max={max} value={custom.w} onChange={(e) => setCustom({ ...custom, w: e.target.value })} /></label>
                <span>×</span>
                <label>Height <input className="input" type="number" min="16" max={max} value={target.aspect ? Math.round(width / target.aspect) : custom.h} disabled={!!target.aspect}
                  onChange={(e) => setCustom({ ...custom, h: e.target.value })} /></label>
                <span className="hint">{target.aspect ? 'Height follows the format' : `up to ${max} px`}</span>
              </div>
            )}
          </div>

          {(target.options || []).map((o) => (
            <div className="xd-field" key={o.key}>
              <span className="xd-label">{o.label}</span>
              {o.type === 'range' ? (
                <label className="xd-range">
                  <input type="range" min={o.min} max={o.max} step={o.step || 1} value={opts[o.key]} onChange={(e) => setOpts({ ...opts, [o.key]: Number(e.target.value) })} />
                  <span>{o.format ? o.format(opts[o.key]) : opts[o.key]}</span>
                </label>
              ) : (
                <div className="xd-chips">
                  {o.choices.map((c) => <button key={c.key} type="button" className={opts[o.key] === c.key ? 'on' : ''} onClick={() => setOpts({ ...opts, [o.key]: c.key })}>{c.label}</button>)}
                </div>
              )}
            </div>
          ))}

          <div className="xd-field">
            <span className="xd-label">Background</span>
            <div className="xd-chips">
              {target.backgrounds.map((b) => (
                <button key={b.key} type="button" className={`${bg === b.key ? 'on' : ''} ${b.key === 'transparent' ? 'xd-transparent' : ''}`}
                  disabled={b.key === 'transparent' && noAlpha && !target.formats.some((f) => f !== 'jpg')} onClick={() => pickBg(b.key)}>
                  {b.swatch && <i className="xd-swatch" style={{ background: b.swatch }} />}{b.label}
                </button>
              ))}
              {target.allowColor && (
                <label className={`xd-color ${bg === 'color' ? 'on' : ''}`}>
                  <input type="color" value={color.toLowerCase()} onChange={(e) => { setColor(e.target.value.toUpperCase()); setBg('color'); }} />
                  Colour
                </label>
              )}
            </div>
            {isVideo && <div className="hint">Videos can’t be transparent.</div>}
          </div>

          <div className="xd-field">
            <span className="xd-label">Format</span>
            <div className="xd-chips">
              {target.formats.map((f) => (
                <button key={f} type="button" className={format === f ? 'on' : ''} onClick={() => pickFormat(f)}
                  title={f === 'jpg' ? 'Smaller, no transparency' : f === 'webp' ? 'Small, with transparency' : undefined}>{FORMAT_LABEL[f]}</button>
              ))}
              {!target.formats.length && <span className="hint">This browser can’t write video — try Chrome, Edge or Safari.</span>}
            </div>
            {(format === 'jpg' || format === 'webp') && (
              <label className="xd-range">Quality <input type="range" min="0.5" max="1" step="0.01" value={quality} onChange={(e) => setQuality(Number(e.target.value))} /><span>{Math.round(quality * 100)}%</span></label>
            )}
          </div>

          {isVideo && (
            <div className="xd-field">
              <span className="xd-label">Frame rate</span>
              <div className="xd-chips">
                {(target.fps || [24, 30, 60]).map((f) => <button key={f} type="button" className={fps === f ? 'on' : ''} onClick={() => setFps(f)}>{f} fps</button>)}
              </div>
              <div className="hint">{target.duration} s · {Math.round(target.duration * fps)} frames — rendered one by one, so it stays smooth.</div>
            </div>
          )}

          <div className="xd-field">
            <span className="xd-label">File name</span>
            <div className="xd-name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /><span>.{EXT[format]}</span></div>
          </div>

          <div className="xd-summary">
            {width} × {height} px · {FORMAT_LABEL[format]}{transparent && !noAlpha ? ' · transparent' : ''}{isVideo ? ` · ${fps} fps` : ''}
          </div>
          {busy && isVideo && (
            <div className="xd-progress"><span style={{ width: `${Math.round(progress * 100)}%` }} /><em>{Math.round(progress * 100)}%</em></div>
          )}
          {error && <div className="xd-error">{error}</div>}
        </div>
        <div className="modal-foot">
          {busy && isVideo
            ? <button className="btn" onClick={() => abort.current?.abort()}>Cancel</button>
            : <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Close</button>}
          {onSaveToPlan && !isVideo && <button className="btn" onClick={toPlan} disabled={busy}><FolderInput size={14} /> Save to plan…</button>}
          <button className="btn btn-primary" onClick={download} disabled={busy || !format}>
            <Download size={14} /> {busy ? (isVideo ? 'Rendering…' : 'Exporting…') : 'Download'}
          </button>
        </div>
      </div>
    </div>
  );
}
