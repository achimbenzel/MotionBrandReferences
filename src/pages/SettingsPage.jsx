import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Keyboard, SlidersHorizontal, RotateCcw, Database, Sparkles, Download, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/ConfirmDialog.jsx';

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
        <p>Library maintenance, keyboard shortcuts and per-browser preferences.</p>
      </div>

      <LibrarySection />

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

const fmtBytes = (n) => {
  const u = ['B', 'KB', 'MB', 'GB']; let v = n || 0; let i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
};

/** Data-format migration, unused-file cleanup and backups. */
function LibrarySection() {
  const toast = useToast();
  const navigate = useNavigate();
  const [status, setStatus] = useState(null); // null = loading, false = failed
  const [scan, setScan] = useState(null);     // { count, bytes, files }
  const [busy, setBusy] = useState(null);     // 'migrate' | 'scan' | 'clean'
  const [showFiles, setShowFiles] = useState(false);
  const [dialog, ask] = useConfirm();

  useEffect(() => { api.maintenanceStatus().then(setStatus).catch(() => setStatus(false)); }, []);

  const migrate = () => ask({
    title: 'Update the data format?', confirmLabel: 'Migrate', icon: <Database size={18} />,
    message: 'Rewrites data/db.json so every entry is stored in the current format. Nothing you see changes and no files are touched — '
      + 'a copy of the current db.json is saved to data/backups/ first, so this can always be undone.',
    onConfirm: async () => {
      setBusy('migrate');
      try {
        const r = await api.migrate();
        setStatus(r);
        toast(r.migrated ? `Library migrated — backup: ${r.backup}` : 'Already up to date');
      } catch (e) { toast(`Migration failed: ${e.message}`, 'error'); }
      finally { setBusy(null); }
    },
  });

  const runScan = async () => {
    setBusy('scan');
    try { setScan(await api.scanUnused()); setShowFiles(false); }
    catch (e) { toast(`Scan failed: ${e.message}`, 'error'); }
    finally { setBusy(null); }
  };

  const clean = () => ask({
    title: 'Move unused files to Trash?', confirmLabel: 'Move to Trash', icon: <Sparkles size={18} />,
    message: `${scan.count} file${scan.count === 1 ? '' : 's'} (${fmtBytes(scan.bytes)}) that nothing in your library uses any more. `
      + 'They go to Trash as one item, so you can restore them for 30 days.',
    onConfirm: async () => {
      setBusy('clean');
      try {
        const r = await api.trashUnused();
        setScan({ count: 0, bytes: 0, files: [] });
        toast(`Moved ${r.count} file${r.count === 1 ? '' : 's'} to Trash`, 'ok', r.trashId ? { label: 'Undo', onClick: async () => {
          try { await api.restoreTrash(r.trashId); toast('Restored'); runScan(); } catch (e) { toast(`Undo failed: ${e.message}`, 'error'); }
        } } : null);
      } catch (e) { toast(`Cleanup failed: ${e.message}`, 'error'); }
      finally { setBusy(null); }
    },
  });

  return (
    <div className="section">
      <div className="section-head"><h2><Database size={16} /> Library</h2></div>
      <div className="pref-list">
        <div className="pref-row pref-row-top">
          <div className="pref-main">
            <div className="pref-title">
              Data format
              {status && !status.needsMigration && <span className="pref-badge ok"><CheckCircle2 size={12} /> Up to date</span>}
              {status && status.needsMigration && <span className="pref-badge warn">Update available</span>}
            </div>
            {status === null && <div className="pref-sub">Checking…</div>}
            {status === false && <div className="pref-sub">Couldn’t check the data format.</div>}
            {status && !status.needsMigration && (
              <div className="pref-sub">
                Version {status.schemaVersion}{status.migratedAt ? ` · migrated ${new Date(status.migratedAt).toLocaleDateString()}` : ''}.
                Everything is stored in the current format.
              </div>
            )}
            {status && status.needsMigration && (
              <>
                <div className="pref-sub">
                  Your library was created with an older version of the app (format v{status.schemaVersion}). It works as it is —
                  migrating stores it in the current format (v{status.currentVersion}) once, instead of converting it on every load.
                </div>
                {status.changes.length > 0 && (
                  <ul className="maint-changes">
                    {status.changes.map((c) => <li key={c.key}><b>{c.count}</b> {c.label}</li>)}
                  </ul>
                )}
              </>
            )}
          </div>
          {status && status.needsMigration && (
            <button className="btn btn-sm btn-primary" onClick={migrate} disabled={!!busy}>{busy === 'migrate' ? 'Migrating…' : 'Migrate'}</button>
          )}
        </div>

        <div className="pref-row pref-row-top">
          <div className="pref-main">
            <div className="pref-title">Unused files</div>
            <div className="pref-sub">
              Files in the library folder that no project, plan or software points to any more — e.g. images older versions left behind
              when a banner or cover was replaced.
            </div>
            {scan && scan.count === 0 && <div className="pref-sub pref-result"><CheckCircle2 size={13} /> Nothing to clean up.</div>}
            {scan && scan.count > 0 && (
              <>
                <button className="maint-toggle" onClick={() => setShowFiles((v) => !v)}>
                  {showFiles ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  {scan.count} file{scan.count === 1 ? '' : 's'} · {fmtBytes(scan.bytes)}
                </button>
                {showFiles && (
                  <ul className="maint-files">
                    {scan.files.map((f) => <li key={f.rel}><span>{f.rel}</span><span>{fmtBytes(f.size)}</span></li>)}
                    {scan.count > scan.files.length && <li className="more">…and {scan.count - scan.files.length} more</li>}
                  </ul>
                )}
              </>
            )}
          </div>
          <div className="pref-actions">
            <button className="btn btn-sm" onClick={runScan} disabled={!!busy}>{busy === 'scan' ? 'Scanning…' : scan ? 'Scan again' : 'Scan'}</button>
            {scan && scan.count > 0 && (
              <button className="btn btn-sm btn-primary" onClick={clean} disabled={!!busy}>{busy === 'clean' ? 'Moving…' : 'Move to Trash'}</button>
            )}
          </div>
        </div>

        <div className="pref-row">
          <div className="pref-main">
            <div className="pref-title">Backups</div>
            <div className="pref-sub">
              The last 10 versions of your metadata are kept in <code>data/backups/</code> automatically. For a full copy including
              all files, export the library — or back up the whole <code>data/</code> folder.
            </div>
          </div>
          <div className="pref-actions">
            <button className="btn btn-sm" onClick={() => { window.location.href = api.exportUrl; }}><Download size={14} /> Export</button>
            <button className="btn btn-sm btn-ghost" onClick={() => navigate('/trash')}>Trash</button>
          </div>
        </div>
      </div>
      {dialog}
    </div>
  );
}
