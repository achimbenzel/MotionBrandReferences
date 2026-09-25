import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FlaskConical, UploadCloud, RefreshCw, X, Library, Download, FolderInput, Search, Square } from 'lucide-react';
import { api, fileUrl } from '../lib/api.js';
import { logoSource, logoActive, logoRenditionList } from '../lib/types.js';
import { loadLogo, tintedCanvas, renderSheet, SQUIRCLE_MASK } from '../lib/brandSheet.js';
import { isTouch } from '../lib/useMedia.js';
import { useToast } from '../components/Toast.jsx';
import LogoImage from '../components/LogoImage.jsx';

const BGS = [
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
  { key: 'checker', label: 'Transparent' },
  { key: 'custom', label: 'Custom' },
];
const CHECKER = 'repeating-conic-gradient(#c9c9c9 0% 25%, #ffffff 0% 50%) 50% / 20px 20px';
const FAVICON_SIZES = [16, 32, 48];
const MIN_STRIP = [16, 24, 32, 48, 64, 96, 128];
const STORE = 'brandTester';

const bgValue = (bg, custom) => (bg === 'light' ? '#ffffff' : bg === 'dark' ? '#0f0f12' : bg === 'checker' ? CHECKER : custom);
const readStore = () => { try { return JSON.parse(sessionStorage.getItem(STORE) || '{}'); } catch { return {}; } };

/**
 * Brand Tester: put a logo (uploaded, or straight from the library) through
 * its paces — backgrounds and brand colours, recoloured, as profile picture
 * and app icon, with its clear space and minimum size — and keep the result
 * as a test sheet (PNG) in a plan.
 */
export default function LogoTester() {
  const toast = useToast();
  const navigate = useNavigate();
  const saved = useRef(readStore());
  const [logo, setLogo] = useState(null); // { url, name, blob?, projectId?, colors? }
  const [art, setArt] = useState(null);   // loaded image + visible bounds
  const [bg, setBg] = useState(saved.current.bg || 'light');
  const [custom, setCustom] = useState(saved.current.custom || '#2ec5d3');
  const [tint, setTint] = useState('original');
  const [scale, setScale] = useState(0.6);
  const [blur, setBlur] = useState(0);
  const [pixel, setPixel] = useState(0);
  const [grayscale, setGrayscale] = useState(false);
  const [invert, setInvert] = useState(false);
  const [showClear, setShowClear] = useState(saved.current.showClear ?? true);
  const [clearPct, setClearPct] = useState(saved.current.clearPct ?? 25);
  const [minPx, setMinPx] = useState(saved.current.minPx ?? 24);
  const [minMm, setMinMm] = useState(saved.current.minMm ?? 15);
  const [iconPad, setIconPad] = useState(saved.current.iconPad ?? 0.62);
  const [brandColors, setBrandColors] = useState([]);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const fileRef = useRef(null);
  const stageRef = useRef(null);

  // Settings (and a library logo) are remembered for this session.
  useEffect(() => {
    try { sessionStorage.setItem(STORE, JSON.stringify({ bg, custom, showClear, clearPct, minPx, minMm, iconPad, projectId: logo?.projectId || null })); } catch { /* ignore */ }
  }, [bg, custom, showClear, clearPct, minPx, minMm, iconPad, logo?.projectId]);
  useEffect(() => {
    const id = saved.current.projectId;
    if (id) api.get(id).then((p) => applyProject(p)).catch(() => {});
    api.list('color').then((ps) => {
      const seen = new Set();
      const hexes = [];
      for (const p of ps) for (const c of (p.colors || [])) {
        const hex = String(c.hex || '').toUpperCase();
        if (/^#[0-9A-F]{6}$/.test(hex) && !seen.has(hex)) { seen.add(hex); hexes.push(hex); }
      }
      setBrandColors(hexes.slice(0, 12));
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (logo?.blob) URL.revokeObjectURL(logo.url); }, [logo]);
  useEffect(() => {
    let alive = true;
    setArt(null);
    if (logo) loadLogo(logo.url).then((a) => { if (alive) setArt(a); }).catch(() => { if (alive) toast('Could not read this image.', 'error'); });
    return () => { alive = false; };
  }, [logo?.url]); // eslint-disable-line react-hooks/exhaustive-deps

  // The stage's size, to place the logo and its clear space in pixels.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setStage({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [logo]);

  const pick = (file) => {
    if (!file || (!/^image\//.test(file.type) && !/\.svg$/i.test(file.name))) return;
    setTint('original');
    setLogo({ url: URL.createObjectURL(file), name: file.name.replace(/\.[^.]+$/, ''), blob: true });
  };
  function applyProject(p) {
    const src = logoSource(p);
    if (!src) { toast('This logo has no image.', 'error'); return; }
    const colors = [...new Set(logoRenditionList(p).map((r) => r.color).filter((c) => c && c !== 'original'))];
    const active = logoActive(p);
    setTint(active.color && active.color !== 'original' ? active.color : 'original');
    setLogo({ url: fileUrl(p, src), name: p.title || 'Logo', projectId: p.id, colors });
  }
  const clear = () => { setLogo(null); setArt(null); };

  const tileFilter = [grayscale ? 'grayscale(1)' : '', invert ? 'invert(1)' : ''].join(' ').trim() || 'none';
  const stageFilter = [blur ? `blur(${blur}px)` : '', tileFilter !== 'none' ? tileFilter : ''].join(' ').trim() || 'none';
  const bgCss = bgValue(bg, custom);
  const bgStyle = { background: bgCss };
  const tintChoices = ['original', ...(logo?.colors || []), '#111114', '#FFFFFF']
    .filter((c, i, a) => a.findIndex((x) => x.toLowerCase() === c.toLowerCase()) === i);

  // Logo box on the stage (contain-fit, scaled) and its clear space.
  const fit = useMemo(() => {
    if (!art || !stage.w) return null;
    const aw = Math.max(1, stage.w * scale); const ah = Math.max(1, stage.h * scale); // content box (padding excluded)
    const r = Math.min(aw / art.w, ah / art.h);
    return { w: art.w * r, h: art.h * r };
  }, [art, stage, scale]);
  const clearBox = fit && art && showClear ? (() => {
    const b = art.box;
    const t = { l: b.x0 * fit.w, t: b.y0 * fit.h, w: (b.x1 - b.x0) * fit.w, h: (b.y1 - b.y0) * fit.h };
    const cs = (clearPct / 100) * t.h;
    return { t, o: { l: t.l - cs, t: t.t - cs, w: t.w + cs * 2, h: t.h + cs * 2 }, cs };
  })() : null;

  const sheetOpts = () => ({
    name: logo?.name, tint, filter: tileFilter, bg: bg === 'checker' ? 'checker' : bgCss,
    bgLabel: bg === 'custom' ? custom.toUpperCase() : BGS.find((b) => b.key === bg)?.label.toLowerCase(),
    showClear, clearPct, minPx, minMm, iconPad, brandColors,
  });
  const sheetFile = async () => {
    const blob = await renderSheet(art, sheetOpts());
    const slug = (logo?.name || 'logo').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'logo';
    return new File([blob], `brand-test-${slug}.png`, { type: 'image/png' });
  };
  const download = async () => {
    try {
      const f = await sheetFile();
      const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { toast(`Could not render: ${e.message}`, 'error'); }
  };

  return (
    <div>
      <div className="page-head">
        <h1><FlaskConical size={22} style={{ verticalAlign: '-3px', marginRight: 8 }} />Brand Tester</h1>
        <p>Put a logo through its paces — backgrounds and brand colours, as profile picture and app icon, clear space and minimum size — and keep the test sheet in a plan.</p>
      </div>

      {!logo ? (
        <div className="bt-start">
          <Dropzone onPick={pick} inputRef={fileRef} />
          <button className="bt-library" onClick={() => setPicking(true)}>
            <Library size={24} /><span>Choose from your library</span><span className="hint">Logos you’ve added under Logos</span>
          </button>
        </div>
      ) : (
        <>
          <div className="lt-toolbar">
            <span className="bt-name" title={logo.name}>{logo.name}</span>
            <button className="btn btn-sm" onClick={() => setPicking(true)}><Library size={14} /> Library</button>
            <button className="btn btn-sm" onClick={() => fileRef.current?.click()}><RefreshCw size={14} /> Upload</button>
            <button className="btn btn-sm btn-ghost" onClick={clear}><X size={15} /> Clear</button>
            <div className="lt-spacer" />
            <button className="btn btn-sm" onClick={download} disabled={!art}><Download size={14} /> Sheet (PNG)</button>
            <button className="btn btn-sm btn-primary" onClick={() => setSaving(true)} disabled={!art}><FolderInput size={14} /> Save to plan…</button>
            <input ref={fileRef} type="file" accept="image/*,.svg" className="visually-hidden-input"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pick(f); }} />
          </div>

          <div className="lt-toolbar">
            <span className="bt-label">Background</span>
            <div className="segmented">
              {BGS.map((b) => <button key={b.key} className={bg === b.key ? 'on' : ''} onClick={() => setBg(b.key)}>{b.label}</button>)}
            </div>
            {bg === 'custom' && <input type="color" className="lt-color" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Background colour" />}
            {brandColors.length > 0 && (
              <span className="bt-swatches" title="Your colours (from Colors)">
                {brandColors.map((hex) => (
                  <button key={hex} className={`bt-swatch ${bg === 'custom' && custom.toUpperCase() === hex ? 'on' : ''}`} style={{ background: hex }}
                    onClick={() => { setBg('custom'); setCustom(hex.toLowerCase()); }} aria-label={`Background ${hex}`} />
                ))}
              </span>
            )}
          </div>

          <div className="lt-toolbar">
            <span className="bt-label">Logo colour</span>
            <span className="bt-swatches">
              {tintChoices.map((c) => (
                <button key={c} className={`bt-swatch ${tint.toLowerCase() === c.toLowerCase() ? 'on' : ''} ${c === 'original' ? 'bt-original' : ''}`}
                  style={c === 'original' ? undefined : { background: c }} onClick={() => setTint(c)}
                  title={c === 'original' ? 'Original colours' : c} aria-label={c === 'original' ? 'Original colours' : `Colour ${c}`}>{c === 'original' ? 'Aa' : ''}</button>
              ))}
              <input type="color" className="lt-color" value={tint === 'original' ? '#111114' : tint} onChange={(e) => setTint(e.target.value)} aria-label="Custom logo colour" title="Any colour (the logo as a silhouette)" />
            </span>
            <label className="lt-check"><input type="checkbox" checked={grayscale} onChange={(e) => setGrayscale(e.target.checked)} /> Grayscale</label>
            <label className="lt-check"><input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} /> Invert</label>
          </div>

          <div className="lt-sliders">
            <label className="lt-slider">Scale <span>{Math.round(scale * 100)}%</span>
              <input type="range" min="0.1" max="1" step="0.01" value={scale} onChange={(e) => setScale(+e.target.value)} />
            </label>
            <label className="lt-slider">Blur <span>{blur}px</span>
              <input type="range" min="0" max="24" step="1" value={blur} onChange={(e) => setBlur(+e.target.value)} />
            </label>
            <label className="lt-slider">Pixelate <span>{pixel ? `${pixel}px` : 'off'}</span>
              <input type="range" min="0" max="24" step="1" value={pixel} onChange={(e) => setPixel(+e.target.value)} />
            </label>
            <label className="lt-slider"><input type="checkbox" checked={showClear} onChange={(e) => setShowClear(e.target.checked)} /> Clear space <span>{clearPct}%</span>
              <input type="range" min="5" max="100" step="5" value={clearPct} onChange={(e) => setClearPct(+e.target.value)} disabled={!showClear} />
            </label>
          </div>

          {/* Main stage, with the clear space drawn around the visible mark */}
          <div className="lt-stage" style={bgStyle} ref={stageRef}>
            {fit && (
              <div className="lt-logo" style={{ width: fit.w, height: fit.h }}>
                {pixel > 0
                  ? <PixelStage img={art.img} tint={tint} filter={stageFilter} pixel={pixel} />
                  : <LogoArt url={logo.url} tint={tint} filter={stageFilter} />}
                {clearBox && (
                  <>
                    <span className="lt-clear-inner" style={{ left: clearBox.t.l, top: clearBox.t.t, width: clearBox.t.w, height: clearBox.t.h }} />
                    <span className="lt-clear-outer" style={{ left: clearBox.o.l, top: clearBox.o.t, width: clearBox.o.w, height: clearBox.o.h }}>
                      <span className="lt-clear-x" style={{ height: clearBox.cs }}>x</span>
                    </span>
                  </>
                )}
              </div>
            )}
            {!art && <div className="spinner" />}
          </div>
          {showClear && <div className="hint" style={{ margin: '-12px 0 18px' }}>Dashed: clear space — {clearPct}% of the logo’s height (x) on every side, measured from the visible mark.</div>}

          {/* Real-world previews */}
          <div className="lt-previews">
            <div className="lt-card">
              <div className="lt-card-title">Browser tab</div>
              <div className="lt-tab">
                <LogoArt url={logo.url} tint={tint} filter={tileFilter} size={16} />
                <span>Your Project</span>
                <X size={12} className="lt-tab-x" />
              </div>
              <div className="lt-card-title" style={{ marginTop: 18 }}>Favicon sizes</div>
              <div className="lt-sizes">
                {FAVICON_SIZES.map((s) => (
                  <div key={s} className="lt-size">
                    <div className="lt-size-box" style={bgStyle}><LogoArt url={logo.url} tint={tint} filter={tileFilter} size={s} /></div>
                    <span>{s}px</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lt-card">
              <div className="lt-card-title">Profile picture</div>
              <div className="lt-appicons">
                {[110, 48, 32].map((s) => (
                  <div key={s} className="lt-size">
                    <div className="bt-avatar" style={{ width: s, height: s, ...bgStyle }}>
                      <LogoArt url={logo.url} tint={tint} filter={tileFilter} size={s * iconPad} />
                    </div>
                    <span>{s}px</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lt-card">
              <div className="lt-card-title">App icon</div>
              <div className="lt-appicons">
                {[120, 60, 29].map((s) => (
                  <div key={s} className="lt-size">
                    <div className="bt-squircle" style={{ width: s, height: s, ...bgStyle, WebkitMaskImage: SQUIRCLE_MASK, maskImage: SQUIRCLE_MASK }}>
                      <LogoArt url={logo.url} tint={tint} filter={tileFilter} size={s * iconPad} />
                    </div>
                    <span>{s}px</span>
                  </div>
                ))}
              </div>
              <label className="lt-slider bt-pad">Padding <span>{Math.round((1 - iconPad) * 50)}%</span>
                <input type="range" min="0.3" max="0.95" step="0.01" value={iconPad} onChange={(e) => setIconPad(+e.target.value)} />
              </label>
            </div>

            <div className="lt-card lt-card-wide">
              <div className="bt-min-head">
                <div className="lt-card-title" style={{ margin: 0 }}>Minimum size</div>
                <label className="bt-min">Screen <input className="input" inputMode="numeric" value={minPx} onChange={(e) => setMinPx(Math.max(1, Math.min(2000, Number(e.target.value) || 0)))} /> px wide</label>
                <label className="bt-min">Print <input className="input" inputMode="numeric" value={minMm} onChange={(e) => setMinMm(Math.max(1, Math.min(2000, Number(e.target.value) || 0)))} /> mm</label>
              </div>
              <div className="lt-sizes bt-minstrip" style={{ background: bg === 'checker' ? CHECKER : bgCss }}>
                {MIN_STRIP.map((w) => {
                  const h = art ? w * (art.h / art.w) : w;
                  const small = w < minPx;
                  return (
                    <div key={w} className={`lt-size ${small ? 'bt-small' : ''}`}>
                      <LogoArt url={logo.url} tint={tint} filter={tileFilter} width={w} height={Math.min(h, 140)} />
                      <span>{w}px{small ? ' · too small' : ''}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {brandColors.length > 0 && (
              <div className="lt-card lt-card-wide">
                <div className="lt-card-title">On brand colours</div>
                <div className="bt-brand">
                  {brandColors.map((hex) => (
                    <div key={hex} className="bt-brand-tile">
                      <div className="bt-brand-bg" style={{ background: hex }}><LogoArt url={logo.url} tint={tint} filter={tileFilter} width={90} height={48} /></div>
                      <span>{hex}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {picking && <LogoPicker onPick={(p) => { applyProject(p); setPicking(false); }} onClose={() => setPicking(false)} />}
      {saving && art && (
        <SaveToPlan onClose={() => setSaving(false)} makeFile={sheetFile}
          onSaved={(plan) => { setSaving(false); toast(`Test sheet saved to “${plan.name}”`, 'ok', { label: 'Open plan', onClick: () => navigate(`/plan/${plan.id}`) }); }} />
      )}
    </div>
  );
}

/**
 * The logo as-is, or recoloured to a solid colour (silhouette via CSS mask).
 * `size` = a square box; else `width`/`height`; else it fills its parent.
 */
function LogoArt({ url, tint = 'original', filter = 'none', size, width, height }) {
  const w = size ?? width; const h = size ?? height;
  const box = w != null ? { width: w, height: h } : { width: '100%', height: '100%' };
  if (!tint || tint === 'original') return <img src={url} alt="" draggable={false} style={{ ...box, objectFit: 'contain', filter, display: 'block' }} />;
  return (
    <div style={{
      ...box, background: tint, filter,
      WebkitMaskImage: `url("${url}")`, maskImage: `url("${url}")`,
      WebkitMaskSize: 'contain', maskSize: 'contain', WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center', maskPosition: 'center',
    }} />
  );
}

/** The logo pixelated: downscale to 1/pixel, then back up with smoothing off. */
function PixelStage({ img, tint, filter, pixel }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !img) return;
    const iw = img.naturalWidth || 512; const ih = img.naturalHeight || 512;
    const base = 1024;
    const W = iw >= ih ? base : Math.max(1, Math.round((base * iw) / ih));
    const H = iw >= ih ? Math.max(1, Math.round((base * ih) / iw)) : base;
    canvas.width = W; canvas.height = H;
    const src = tintedCanvas(img, W, H, tint);
    const p = Math.max(1, pixel);
    const sw = Math.max(1, Math.round(W / p)); const sh = Math.max(1, Math.round(H / p));
    const tmp = document.createElement('canvas'); tmp.width = sw; tmp.height = sh;
    const tctx = tmp.getContext('2d'); tctx.imageSmoothingEnabled = true; tctx.drawImage(src, 0, 0, sw, sh);
    const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, W, H); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, sw, sh, 0, 0, W, H);
  }, [img, tint, pixel]);
  return <canvas ref={ref} style={{ width: '100%', height: '100%', filter, imageRendering: 'pixelated', display: 'block' }} />;
}

function Dropzone({ onPick, inputRef }) {
  return (
    <div className="dropzone lt-drop" onClick={() => inputRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); onPick(e.dataTransfer.files?.[0]); }}>
      <UploadCloud size={26} />
      <div>Upload a logo — PNG or SVG</div>
      <div className="hint">Drop it here or click to choose · nothing is saved unless you save a test sheet</div>
      <input ref={inputRef} type="file" accept="image/*,.svg" className="visually-hidden-input"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPick(f); }} />
    </div>
  );
}

/** Pick a logo from the library (Logos). */
function LogoPicker({ onPick, onClose }) {
  const [logos, setLogos] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => { api.list('logo').then(setLogos).catch(() => setLogos([])); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const shown = (logos || []).filter((p) => !q.trim() || `${p.title} ${(p.tags || []).join(' ')}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal bt-picker" role="dialog" aria-modal="true" aria-label="Choose a logo">
        <div className="modal-head">
          <h2>Choose a logo</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <label className="pp-search"><Search size={15} /><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search logos…" autoFocus={!isTouch()} /></label>
          {logos === null ? <div className="spinner" /> : shown.length ? (
            <div className="bt-picker-grid">
              {shown.map((p) => {
                const src = logoSource(p); const a = logoActive(p);
                return (
                  <button key={p.id} className="bt-pick" onClick={() => onPick(p)} title={p.title}>
                    <span className="bt-pick-plate" style={{ background: a.bg === 'transparent' ? CHECKER : a.bg }}>
                      {src ? <LogoImage url={fileUrl(p, src)} rendition={a.color} scalePct={70} alt={p.title} /> : <Square size={20} />}
                    </span>
                    <span className="bt-pick-name">{p.title}</span>
                  </button>
                );
              })}
            </div>
          ) : <div className="hint" style={{ padding: 10 }}>{logos.length ? 'No logo matches.' : 'No logos in your library yet — add some under Logos.'}</div>}
        </div>
      </div>
    </div>
  );
}

/** Save the test sheet into a plan: into one of its moodboards, or a new "Brand tests" one. */
function SaveToPlan({ makeFile, onSaved, onClose }) {
  const toast = useToast();
  const [plans, setPlans] = useState(null);
  const [planId, setPlanId] = useState('');
  const [plan, setPlan] = useState(null);
  const [target, setTarget] = useState('new');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.listPlans().then((ps) => { setPlans(ps); if (ps[0]) setPlanId(ps.find((p) => p.status !== 'archived')?.id || ps[0].id); }).catch(() => setPlans([])); }, []);
  useEffect(() => {
    setPlan(null);
    if (!planId) return;
    api.getPlan(planId).then((p) => {
      setPlan(p);
      const boards = p.blocks.filter((b) => b.type === 'moodboard');
      setTarget(boards.find((b) => /brand|logo|test/i.test(b.title))?.id || 'new');
    }).catch(() => {});
  }, [planId]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const save = async () => {
    if (!plan || busy) return;
    setBusy(true);
    try {
      const file = await makeFile();
      let blockId = target;
      if (target === 'new') {
        const before = new Set(plan.blocks.map((b) => b.id));
        const next = await api.addBlock(plan.id, 'moodboard');
        blockId = next.blocks.find((b) => !before.has(b.id))?.id;
        await api.updateBlock(plan.id, blockId, { title: 'Brand tests' });
      }
      await api.addBlockFiles(plan.id, blockId, [file]);
      onSaved(plan);
    } catch (e) { toast(`Could not save: ${e.message}`, 'error'); setBusy(false); }
  };

  const boards = (plan?.blocks || []).filter((b) => b.type === 'moodboard');
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Save test sheet to plan" style={{ maxWidth: 440 }}>
        <div className="modal-head">
          <h2>Save test sheet to plan</h2>
          <button className="icon-btn" onClick={onClose} disabled={busy} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">
          {plans === null ? <div className="spinner" /> : !plans.length ? (
            <div className="hint">No plans yet — create one under Plans first.</div>
          ) : (
            <>
              <div className="field">
                <label>Plan</label>
                <select className="input" value={planId} onChange={(e) => setPlanId(e.target.value)}>
                  {plans.map((p) => <option key={p.id} value={p.id}>{p.avatarEmoji ? `${p.avatarEmoji} ` : ''}{p.name}{p.status === 'archived' ? ' (archived)' : ''}</option>)}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Moodboard</label>
                <select className="input" value={target} onChange={(e) => setTarget(e.target.value)} disabled={!plan}>
                  <option value="new">New moodboard “Brand tests”</option>
                  {boards.map((b) => <option key={b.id} value={b.id}>{b.title || 'Moodboard'}</option>)}
                </select>
              </div>
              <div className="hint" style={{ marginTop: 10 }}>The sheet (PNG) shows every test on one page — backgrounds, profile picture, app icon, minimum size, clear space and your colours.</div>
            </>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={!plan || busy}>{busy ? 'Saving…' : 'Save sheet'}</button>
        </div>
      </div>
    </div>
  );
}
