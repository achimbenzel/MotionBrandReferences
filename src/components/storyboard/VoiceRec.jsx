import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Play, Pause, Trash2, Timer } from 'lucide-react';

const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg'];
const EXT = { 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg' };
const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

/**
 * Record the voice-over of one shot with the microphone, listen to it, record
 * again or remove it. It plays from the shot's start in the animatic and goes
 * into the exported video; longer than the shot? One click makes the shot fit.
 */
export default function VoiceRec({ voice, url, duration, n, onRecorded, onRemove, onFit }) {
  const [state, setState] = useState('idle'); // idle | asking | recording | saving
  const [secs, setSecs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const rec = useRef(null);
  const audio = useRef(null);
  const timer = useRef(0);

  useEffect(() => () => {
    clearInterval(timer.current);
    if (rec.current?.state === 'recording') rec.current.stop();
    rec.current?.stream?.getTracks().forEach((t) => t.stop());
    audio.current?.pause();
  }, []);

  const start = async () => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setError('This browser can’t record here.'); return; }
    setState('asking');
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch {
      setState('idle'); setError('No microphone — allow it in the browser to record.'); return;
    }
    const type = TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || '';
    const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks = [];
    r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const t0 = performance.now();
    r.onstop = async () => {
      clearInterval(timer.current);
      stream.getTracks().forEach((t) => t.stop());
      const seconds = Math.round((performance.now() - t0) / 100) / 10;
      const mime = (r.mimeType || type || 'audio/webm').split(';')[0];
      const blob = new Blob(chunks, { type: mime });
      if (!blob.size) { setState('idle'); return; }
      setState('saving');
      try { await onRecorded(new File([blob], `voice-${n}.${EXT[mime] || 'webm'}`, { type: mime }), seconds); } finally { setState('idle'); }
    };
    rec.current = r;
    r.start(250);
    setSecs(0);
    timer.current = setInterval(() => setSecs((performance.now() - t0) / 1000), 100);
    setState('recording');
  };
  const stop = () => { if (rec.current?.state === 'recording') rec.current.stop(); };
  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) { a.currentTime = 0; a.play().catch(() => {}); } else a.pause();
  };

  const long = voice && voice.duration > duration + 0.05;
  return (
    <div className={`vrec ${state}`}>
      {state === 'recording' ? (
        <button type="button" className="btn btn-sm vrec-stop" onClick={stop}><Square size={12} fill="currentColor" /> Stop · {fmt(secs)}</button>
      ) : voice ? (
        <>
          <button type="button" className="icon-btn vrec-play" onClick={toggle} aria-label={playing ? 'Pause the voice-over' : 'Play the voice-over'}>
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <span className="vrec-len">VO {fmt(voice.duration || 0)}</span>
          {long && <button type="button" className="btn btn-sm btn-ghost vrec-fit" onClick={() => onFit(Math.ceil(voice.duration * 10) / 10)} title="Make the shot as long as its voice-over"><Timer size={12} /> Fit shot</button>}
          <button type="button" className="icon-btn" onClick={start} disabled={state !== 'idle'} aria-label="Record again" title="Record again"><Mic size={14} /></button>
          <button type="button" className="icon-btn" onClick={onRemove} aria-label="Remove the voice-over"><Trash2 size={13} /></button>
          <audio ref={audio} src={url} preload="none" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
        </>
      ) : (
        <button type="button" className="btn btn-sm btn-ghost vrec-start" onClick={start} disabled={state !== 'idle'}>
          <Mic size={13} /> {state === 'asking' ? 'Allow the microphone…' : state === 'saving' ? 'Saving…' : 'Record voice-over'}
        </button>
      )}
      {error && <span className="vrec-error">{error}</span>}
    </div>
  );
}
