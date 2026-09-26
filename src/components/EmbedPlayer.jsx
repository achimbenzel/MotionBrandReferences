import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { embedUrl, EMBED_ORIGINS } from '../lib/videoLinks.js';

/**
 * Talks to an embedded YouTube / Vimeo player over postMessage and exposes the
 * parts of an HTMLVideoElement the motion page uses (currentTime, duration,
 * paused, play(), pause(), playbackRate, 'ended'), so sections, moments, loop
 * and speed work the same as for an uploaded video. Frames can't be captured
 * from another site's player, so videoWidth stays 0.
 */
class EmbedController {
  constructor(provider) {
    this.provider = provider;
    this.win = null;
    this.t = 0; this.stamp = 0; this.dur = 0; this.isPaused = true; this.rate = 1;
    this.handlers = {};
  }
  send(msg) {
    if (!this.win) return;
    const target = EMBED_ORIGINS[this.provider][0];
    if (this.provider === 'youtube') this.win.postMessage(JSON.stringify({ ...msg, id: 1, channel: 'widget' }), '*');
    else this.win.postMessage(JSON.stringify(msg), target);
  }
  // Updates come a few times a second; between them the time runs on.
  get currentTime() {
    if (!this.isPaused && this.stamp) return Math.min(this.dur || Infinity, this.t + ((performance.now() - this.stamp) / 1000) * this.rate);
    return this.t;
  }
  set currentTime(v) {
    this.t = Math.max(0, Number(v) || 0); this.stamp = performance.now();
    if (this.provider === 'youtube') this.send({ event: 'command', func: 'seekTo', args: [this.t, true] });
    else this.send({ method: 'setCurrentTime', value: this.t });
  }
  get duration() { return this.dur || NaN; }
  get paused() { return this.isPaused; }
  get readyState() { return this.dur ? 4 : 0; }
  get videoWidth() { return 0; }
  get playbackRate() { return this.rate; }
  set playbackRate(r) {
    this.t = this.currentTime; this.stamp = performance.now(); this.rate = r;
    if (this.provider === 'youtube') this.send({ event: 'command', func: 'setPlaybackRate', args: [r] });
    else this.send({ method: 'setPlaybackRate', value: r });
  }
  play() {
    if (this.provider === 'youtube') this.send({ event: 'command', func: 'playVideo', args: [] });
    else this.send({ method: 'play' });
    return Promise.resolve();
  }
  pause() {
    if (this.provider === 'youtube') this.send({ event: 'command', func: 'pauseVideo', args: [] });
    else this.send({ method: 'pause' });
  }
  addEventListener(type, fn) { (this.handlers[type] ||= new Set()).add(fn); }
  removeEventListener(type, fn) { this.handlers[type]?.delete(fn); }
  emit(type) { this.handlers[type]?.forEach((fn) => fn({ type, target: this })); }
}

const EmbedPlayer = forwardRef(function EmbedPlayer({ provider, videoId, hash, title, onPlay, onPause, onTime, onDuration }, ref) {
  const frame = useRef(null);
  const ctl = useMemo(() => new EmbedController(provider), [provider, videoId]); // eslint-disable-line react-hooks/exhaustive-deps
  useImperativeHandle(ref, () => ctl, [ctl]);
  const cb = useRef({});
  cb.current = { onPlay, onPause, onTime, onDuration };

  useEffect(() => {
    const origins = EMBED_ORIGINS[provider];
    const setTime = (t) => { if (Number.isFinite(t)) { ctl.t = t; ctl.stamp = performance.now(); cb.current.onTime?.(t); } };
    const setDur = (d) => { if (Number.isFinite(d) && d > 0 && Math.abs(d - ctl.dur) > 0.01) { ctl.dur = d; cb.current.onDuration?.(d); } };
    const setPlaying = (playing) => {
      if (playing === !ctl.isPaused) return;
      ctl.t = ctl.currentTime; ctl.stamp = performance.now(); ctl.isPaused = !playing;
      (playing ? cb.current.onPlay : cb.current.onPause)?.();
      ctl.emit(playing ? 'play' : 'pause');
    };
    const onMessage = (e) => {
      if (!origins.includes(e.origin) || e.source !== frame.current?.contentWindow) return;
      let d = e.data;
      if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return; } }
      if (!d || typeof d !== 'object') return;
      ctl.heard = true;
      if (provider === 'youtube') {
        const info = d.info && typeof d.info === 'object' ? d.info : null;
        if (info) {
          if ('duration' in info) setDur(info.duration);
          if ('currentTime' in info) setTime(info.currentTime);
          if ('playbackRate' in info && Number.isFinite(info.playbackRate)) ctl.rate = info.playbackRate;
          if ('playerState' in info) {
            if (info.playerState === 1) setPlaying(true);
            else if (info.playerState === 2 || info.playerState === 0 || info.playerState === 5) setPlaying(false);
            if (info.playerState === 0) ctl.emit('ended');
          }
        }
        if (d.event === 'onStateChange') {
          if (d.info === 1) setPlaying(true);
          else if (d.info === 2 || d.info === 0) setPlaying(false);
          if (d.info === 0) ctl.emit('ended');
        }
      } else {
        if (d.event === 'ready') {
          ['timeupdate', 'play', 'pause', 'ended', 'seeked', 'playbackratechange'].forEach((ev) => ctl.send({ method: 'addEventListener', value: ev }));
          ctl.send({ method: 'getDuration' });
        }
        if (d.method === 'getDuration') setDur(Number(d.value));
        const data = d.data || {};
        if (d.event === 'timeupdate' || d.event === 'seeked') { setDur(Number(data.duration)); setTime(Number(data.seconds)); }
        if (d.event === 'play') setPlaying(true);
        if (d.event === 'pause') setPlaying(false);
        if (d.event === 'ended') { setPlaying(false); ctl.emit('ended'); }
        if (d.event === 'playbackratechange' && Number.isFinite(data.playbackRate)) ctl.rate = data.playbackRate;
      }
    };
    window.addEventListener('message', onMessage);
    return () => { window.removeEventListener('message', onMessage); clearInterval(ctl.hello); };
  }, [provider, ctl]);

  // Once the player page has loaded: ask it to report state (YouTube needs a
  // "listening" handshake; Vimeo announces "ready" by itself).
  const onLoad = () => {
    ctl.win = frame.current?.contentWindow || null;
    if (provider === 'youtube') {
      // Say hello until the player answers (it may still be starting up).
      const hello = () => {
        ctl.send({ event: 'listening' });
        ['onReady', 'onStateChange', 'onPlaybackRateChange'].forEach((ev) => ctl.send({ event: 'command', func: 'addEventListener', args: [ev] }));
      };
      hello();
      clearInterval(ctl.hello);
      let tries = 0;
      ctl.hello = setInterval(() => { tries += 1; if (ctl.heard || tries > 20) clearInterval(ctl.hello); else hello(); }, 500);
    } else {
      ['timeupdate', 'play', 'pause', 'ended', 'seeked'].forEach((ev) => ctl.send({ method: 'addEventListener', value: ev }));
      ctl.send({ method: 'getDuration' });
    }
  };

  return (
    <iframe ref={frame} className="embed-player" src={embedUrl(provider, videoId, hash)} title={title || 'Video'} onLoad={onLoad}
      allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
  );
});

export default EmbedPlayer;
