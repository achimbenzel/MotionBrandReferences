import { useCallback, useState } from 'react';
import { Library } from 'lucide-react';
import MediaPicker from './mockups/MediaPicker.jsx';
import { useToast } from './Toast.jsx';
import { fileFromPick } from '../lib/fromApp.js';

/**
 * The "from the app" picker as a promise: `const [picker, pick] = useFromApp()`,
 * render {picker}, then `await pick({ title, accept })` → { source, url, name,
 * kind } or null (closed). Clicks inside the picker don't reach what's around
 * it (a dropzone that would open the file dialog, a card that would open).
 */
export function useFromApp() {
  const [req, setReq] = useState(null);
  const pick = useCallback((opts = {}) => new Promise((resolve) => { setReq({ ...opts, resolve }); }), []);
  const done = (value) => { req?.resolve(value); setReq(null); };
  const picker = req ? (
    <div className="from-app-host" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}
      onDragOver={(e) => e.stopPropagation()} onDrop={(e) => e.stopPropagation()}>
      <MediaPicker accept={req.accept || 'image'} title={req.title || 'Picture from the app'}
        onPick={(source, meta) => done({ source, ...meta })} onClose={() => done(null)} />
    </div>
  ) : null;
  return [picker, pick];
}

/**
 * A "From the app" button. `onFile(file)` gets the pick as a File (like an
 * upload); `onPick(pick)` instead gets { source, url, name, kind } for routes
 * that copy it on the server.
 */
export default function FromAppButton({ onFile, onPick, accept = 'image', title, className = 'btn btn-sm', label = 'From the app', iconSize = 14, disabled }) {
  const toast = useToast();
  const [picker, pick] = useFromApp();
  const [busy, setBusy] = useState(false);
  const go = async (e) => {
    e?.preventDefault(); e?.stopPropagation();
    const got = await pick({ accept, title });
    if (!got) return;
    if (onPick) { onPick(got); return; }
    setBusy(true);
    try { await onFile(await fileFromPick(got)); } catch (err) { toast(`Could not use it: ${err.message}`, 'error'); } finally { setBusy(false); }
  };
  return (
    <>
      <button type="button" className={className} onClick={go} disabled={disabled || busy} title="A picture that's already in the app">
        <Library size={iconSize} /> {busy ? 'Loading…' : label}
      </button>
      {picker}
    </>
  );
}
