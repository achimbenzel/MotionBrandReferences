import { useSyncExternalStore } from 'react';
import { api } from './api.js';

/**
 * The focus timer (Pomodoro): one for the whole app, so it keeps running when
 * you leave the dashboard — the sidebar (and the phone's top bar) show it
 * while it runs, the tab title counts down, a soft chime and a notification
 * say when it's done. Finished focus sessions count as focus minutes on the
 * dashboard's activity map. Kept in localStorage, so a reload doesn't lose it.
 */
export const TIMER_MODES = {
  focus: { label: 'Focus', minutes: [25, 50, 90] },
  short: { label: 'Short break', minutes: [5, 10] },
  long: { label: 'Long break', minutes: [15, 30] },
};
const KEY = 'focusTimer';
const today = () => new Date().toDateString();
const DEFAULT = { mode: 'focus', minutes: 25, endsAt: null, left: 25 * 60, sessions: 0, day: today(), done: false };

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!s || !TIMER_MODES[s.mode]) return { ...DEFAULT };
    const st = { ...DEFAULT, ...s };
    if (st.day !== today()) { st.sessions = 0; st.day = today(); }
    return st;
  } catch { return { ...DEFAULT }; }
}
let state = typeof window === 'undefined' ? { ...DEFAULT } : load();
const subs = new Set();
let tick = 0;
let baseTitle = null;

const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ } };
const set = (patch) => { state = { ...state, ...patch }; persist(); subs.forEach((f) => f()); sync(); };

/** Seconds left right now. */
export const secondsLeft = (s = state) => (s.endsAt ? Math.max(0, Math.round((s.endsAt - Date.now()) / 1000)) : s.left);
export const fmtTime = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

// A soft two-note chime (no sound file needed).
function chime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    [[660, 0], [880, 0.22], [990, 0.44]].forEach(([f, at]) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.9);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + 1);
    });
    setTimeout(() => ctx.close().catch(() => {}), 2000);
  } catch { /* no audio */ }
}

function finish() {
  // With the app open in two tabs, only the first one to get here counts it.
  const fresh = load();
  if (fresh.endsAt !== state.endsAt) { state = fresh; subs.forEach((f) => f()); sync(); return; }
  const wasFocus = state.mode === 'focus';
  const minutes = state.minutes;
  chime();
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
      new Notification(wasFocus ? 'Focus session done' : 'Break is over', { body: wasFocus ? `${minutes} minutes of focus — time for a break.` : 'Back to it.', silent: true });
    }
  } catch { /* no notifications */ }
  if (wasFocus) {
    api.addFocusMinutes(minutes).catch(() => {});
    const sessions = state.sessions + 1;
    // After four focus sessions a long break, else a short one — ready to start.
    const mode = sessions % 4 === 0 ? 'long' : 'short';
    const m = TIMER_MODES[mode].minutes[0];
    set({ sessions, mode, minutes: m, left: m * 60, endsAt: null, done: true });
  } else {
    const m = TIMER_MODES.focus.minutes.includes(state.lastFocus) ? state.lastFocus : 25;
    set({ mode: 'focus', minutes: m, left: m * 60, endsAt: null, done: true });
  }
}

// One ticker for the app while the timer runs: re-renders subscribers each second, updates the tab title, finishes on time.
function sync() {
  const running = !!state.endsAt;
  if (running && !tick) {
    tick = setInterval(() => {
      if (state.endsAt && Date.now() >= state.endsAt) finish();
      else subs.forEach((f) => f());
      title();
    }, 1000);
  }
  if (!running && tick) { clearInterval(tick); tick = 0; }
  title();
}
function title() {
  if (typeof document === 'undefined') return;
  const prefix = /^[⏱☕] \d+:\d\d · /;
  const clean = document.title.replace(prefix, '');
  if (baseTitle == null || !prefix.test(document.title)) baseTitle = clean;
  document.title = state.endsAt ? `${state.mode === 'focus' ? '⏱' : '☕'} ${fmtTime(secondsLeft())} · ${baseTitle}` : baseTitle;
}

export const timer = {
  start() {
    if (state.endsAt) return;
    try { if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); } catch { /* ignore */ }
    const left = state.left > 0 ? state.left : state.minutes * 60;
    set({ endsAt: Date.now() + left * 1000, done: false, ...(state.mode === 'focus' ? { lastFocus: state.minutes } : {}) });
  },
  pause() { if (state.endsAt) set({ left: secondsLeft(), endsAt: null }); },
  reset() { set({ left: state.minutes * 60, endsAt: null, done: false }); },
  /** Straight to the end of this session (a skipped focus session doesn't count). */
  skip() {
    if (state.mode === 'focus') { const m = TIMER_MODES.short.minutes[0]; set({ mode: 'short', minutes: m, left: m * 60, endsAt: null, done: false }); } else { set({ mode: 'focus', minutes: 25, left: 25 * 60, endsAt: null, done: false }); }
  },
  setMode(mode, minutes = TIMER_MODES[mode].minutes[0]) { set({ mode, minutes, left: minutes * 60, endsAt: null, done: false }); },
  setMinutes(minutes) { set({ minutes, left: minutes * 60, endsAt: null, done: false }); },
};

const subscribe = (f) => { subs.add(f); sync(); return () => subs.delete(f); };
let snap = null; let snapKey = '';
// A fresh object each second while running, so components re-render with the time.
const getSnapshot = () => {
  const key = `${JSON.stringify(state)}|${state.endsAt ? secondsLeft() : ''}`;
  if (key !== snapKey) { snapKey = key; snap = { ...state, seconds: secondsLeft() }; }
  return snap;
};
export const useFocusTimer = () => useSyncExternalStore(subscribe, getSnapshot);

// Another tab changed it (or this one reloads): pick it up.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key === KEY) { state = load(); subs.forEach((f) => f()); sync(); } });
  if (state.endsAt && Date.now() >= state.endsAt) setTimeout(finish, 0); // it ran out while the app was closed
  else sync();
}
