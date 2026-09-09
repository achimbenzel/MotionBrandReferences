import { useEffect, useRef, useState } from 'react';
import { FlaskConical, UploadCloud, RefreshCw, X } from 'lucide-react';

const BGS = [
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
  { key: 'checker', label: 'Transparent' },
  { key: 'custom', label: 'Custom' },
];
const CHECKER = 'repeating-conic-gradient(#c9c9c9 0% 25%, #ffffff 0% 50%) 50% / 20px 20px';
const FAVICON_SIZES = [16, 32, 48];
const SAMPLE_SIZES = [24, 32, 48, 64, 96];

const bgValue = (bg, custom) =>
  bg === 'light' ? '#ffffff'
    : bg === 'dark' ? '#0f0f12'
      : bg === 'checker' ? CHECKER
        : custom;

export default function LogoTester() {
  const [logo, setLogo] = useState(null); // { url, name }
  const [bg, setBg] = useState('light');
  const [custom, setCustom] = useState('#2ec5d3');
  const [scale, setScale] = useState(0.6);
  const [blur, setBlur] = useState(0);
  const [grayscale, setGrayscale] = useState(false);
  const [invert, setInvert] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => () => { if (logo?.url) URL.revokeObjectURL(logo.url); }, [logo]);

  const pick = (file) => {
    if (!file || !/^image\//.test(file.type) && !/\.svg$/i.test(file.name)) return;
    setLogo((prev) => { if (prev?.url) URL.revokeObjectURL(prev.url); return { url: URL.createObjectURL(file), name: file.name }; });
  };
  const clear = () => setLogo((prev) => { if (prev?.url) URL.revokeObjectURL(prev.url); return null; });

  const tileFilter = [grayscale ? 'grayscale(1)' : '', invert ? 'invert(1)' : ''].join(' ').trim() || 'none';
  const stageFilter = [blur ? `blur(${blur}px)` : '', tileFilter !== 'none' ? tileFilter : ''].join(' ').trim() || 'none';
  const bgStyle = { background: bgValue(bg, custom) };

  const Logo = ({ style }) => <img src={logo.url} alt={logo.name} style={style} />;

  return (
    <div>
      <div className="page-head">
        <h1><FlaskConical size={22} style={{ verticalAlign: '-3px', marginRight: 8 }} />Logo Tester</h1>
        <p>Upload a logo (PNG or SVG) and preview it at different scales, blurs and as a favicon / app icon.</p>
      </div>

      {!logo ? (
        <Dropzone onPick={pick} inputRef={fileRef} />
      ) : (
        <>
          <div className="lt-toolbar">
            <div className="segmented">
              {BGS.map((b) => <button key={b.key} className={bg === b.key ? 'on' : ''} onClick={() => setBg(b.key)}>{b.label}</button>)}
            </div>
            {bg === 'custom' && <input type="color" className="lt-color" value={custom} onChange={(e) => setCustom(e.target.value)} />}
            <label className="lt-check"><input type="checkbox" checked={grayscale} onChange={(e) => setGrayscale(e.target.checked)} /> Grayscale</label>
            <label className="lt-check"><input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} /> Invert</label>
            <div className="lt-spacer" />
            <button className="btn btn-sm" onClick={() => fileRef.current?.click()}><RefreshCw size={14} /> Replace</button>
            <button className="btn btn-sm btn-ghost" onClick={clear}><X size={15} /> Clear</button>
            <input ref={fileRef} type="file" accept="image/*,.svg" className="visually-hidden-input"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pick(f); }} />
          </div>

          <div className="lt-sliders">
            <label className="lt-slider">Scale <span>{Math.round(scale * 100)}%</span>
              <input type="range" min="0.1" max="1" step="0.01" value={scale} onChange={(e) => setScale(+e.target.value)} />
            </label>
            <label className="lt-slider">Blur <span>{blur}px</span>
              <input type="range" min="0" max="24" step="1" value={blur} onChange={(e) => setBlur(+e.target.value)} />
            </label>
          </div>

          {/* Main stage */}
          <div className="lt-stage" style={bgStyle}>
            <Logo style={{ width: `${scale * 100}%`, maxHeight: '100%', objectFit: 'contain', filter: stageFilter }} />
          </div>

          {/* Real-world previews */}
          <div className="lt-previews">
            <div className="lt-card">
              <div className="lt-card-title">Browser tab</div>
              <div className="lt-tab">
                <img src={logo.url} alt="" style={{ width: 16, height: 16, objectFit: 'contain', filter: tileFilter }} />
                <span>Your Project</span>
                <X size={12} className="lt-tab-x" />
              </div>
            </div>

            <div className="lt-card">
              <div className="lt-card-title">App icon</div>
              <div className="lt-appicons">
                {[128, 64].map((s) => (
                  <div key={s} className="lt-appicon" style={{ width: s, height: s, ...bgStyle }}>
                    <img src={logo.url} alt="" style={{ width: '70%', height: '70%', objectFit: 'contain', filter: tileFilter }} />
                  </div>
                ))}
              </div>
            </div>

            <div className="lt-card">
              <div className="lt-card-title">Favicon sizes</div>
              <div className="lt-sizes">
                {FAVICON_SIZES.map((s) => (
                  <div key={s} className="lt-size">
                    <div className="lt-size-box" style={bgStyle}>
                      <img src={logo.url} alt="" style={{ width: s, height: s, objectFit: 'contain', filter: tileFilter }} />
                    </div>
                    <span>{s}px</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lt-card lt-card-wide">
              <div className="lt-card-title">Small sizes (legibility)</div>
              <div className="lt-sizes" style={bgStyle}>
                {SAMPLE_SIZES.map((s) => (
                  <div key={s} className="lt-size">
                    <img src={logo.url} alt="" style={{ height: s, width: 'auto', maxWidth: 160, objectFit: 'contain', filter: tileFilter }} />
                    <span>{s}px</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Dropzone({ onPick, inputRef }) {
  return (
    <div className="dropzone lt-drop" onClick={() => inputRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); onPick(e.dataTransfer.files?.[0]); }}>
      <UploadCloud size={26} />
      <div>Upload a logo — PNG or SVG</div>
      <div className="hint">Drop it here or click to choose · nothing is saved, it's just a sandbox</div>
      <input ref={inputRef} type="file" accept="image/*,.svg" className="visually-hidden-input"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPick(f); }} />
    </div>
  );
}
