import { useState } from 'react';
import { Settings, Keyboard, SlidersHorizontal, RotateCcw } from 'lucide-react';
import { useToast } from '../components/Toast.jsx';

const K = (s) => <kbd className="sc-key" key={s}>{s}</kbd>;

const GROUPS = [
  {
    title: 'Global',
    rows: [
      { keys: ['⌘', 'K'], sep: ' / ', alt: ['Ctrl', 'K'], desc: 'Open search & command palette' },
      { keys: ['Esc'], desc: 'Close a dialog, the palette or the fullscreen viewer' },
    ],
  },
  {
    title: 'Images — fullscreen viewer',
    rows: [
      { keys: ['Scroll'], desc: 'Zoom in / out (toward the cursor)' },
      { keys: ['Drag'], desc: 'Pan the image while zoomed in' },
      { keys: ['Double-click'], desc: 'Toggle zoom' },
      { keys: ['←', '→'], sep: ' ', desc: 'Previous / next image' },
    ],
  },
  {
    title: 'Motion video',
    rows: [
      { keys: [',', '.'], sep: ' ', desc: 'Step one frame back / forward (while paused)' },
      { keys: ['Volume'], desc: 'Your volume is remembered across reloads' },
    ],
  },
  {
    title: 'Project detail',
    rows: [
      { keys: ['←', '→'], sep: ' ', desc: 'Previous / next project in the same section' },
    ],
  },
  {
    title: 'Editing',
    rows: [
      { keys: ['Enter'], desc: 'Confirm in a dialog · add a tag' },
    ],
  },
];

export default function SettingsPage() {
  const toast = useToast();
  const [vol, setVol] = useState(() => {
    try { const v = parseFloat(localStorage.getItem('videoVolume')); return Number.isFinite(v) ? v : null; } catch { return null; }
  });

  const resetVolume = () => {
    try { localStorage.removeItem('videoVolume'); localStorage.removeItem('videoMuted'); } catch { /* ignore */ }
    setVol(null);
    toast('Remembered volume reset');
  };

  return (
    <div className="settings-page">
      <div className="page-head">
        <h1><Settings size={22} style={{ verticalAlign: '-4px', marginRight: 8 }} />Settings</h1>
        <p>Keyboard shortcuts and per-browser preferences.</p>
      </div>

      <div className="section">
        <div className="section-head"><h2><Keyboard size={16} /> Keyboard shortcuts</h2></div>
        <div className="shortcuts">
          {GROUPS.map((g) => (
            <div className="sc-group" key={g.title}>
              <div className="sc-group-title">{g.title}</div>
              {g.rows.map((r, i) => (
                <div className="sc-row" key={i}>
                  <div className="sc-keys">
                    {r.keys.map((k, j) => (
                      <span key={j}>{K(k)}{r.sep && j < r.keys.length - 1 ? <span className="sc-plus">{r.sep}</span> : null}</span>
                    ))}
                    {r.alt && <><span className="sc-or">or</span>{r.alt.map((k, j) => (
                      <span key={`a${j}`}>{K(k)}{j < r.alt.length - 1 ? <span className="sc-plus"> </span> : null}</span>
                    ))}</>}
                  </div>
                  <div className="sc-desc">{r.desc}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2><SlidersHorizontal size={16} /> Preferences</h2></div>
        <div className="pref-list">
          <div className="pref-row">
            <div>
              <div className="pref-title">Video volume</div>
              <div className="pref-sub">{vol == null ? 'Not set yet — it saves automatically when you change a video’s volume.' : `Remembered at ${Math.round(vol * 100)}%.`}</div>
            </div>
            <button className="btn btn-sm" onClick={resetVolume} disabled={vol == null}><RotateCcw size={14} /> Reset</button>
          </div>
          <div className="pref-row">
            <div>
              <div className="pref-title">Remembered UI state</div>
              <div className="pref-sub">The collapsed sidebar and video volume are stored in <b>this browser only</b> (localStorage) — nothing leaves your device.</div>
            </div>
          </div>
          <div className="pref-row">
            <div>
              <div className="pref-title">Storage limit</div>
              <div className="pref-sub">Edit it from the <b>storage meter</b> menu (the ⋯ next to the space bar, bottom-left).</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
