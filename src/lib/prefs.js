// Per-browser preferences in localStorage — a view, a filter, the video volume.
// A private window (or full storage) may refuse: reads fall back, writes are skipped.
import { useCallback, useState } from 'react';

/** The stored string, or `fallback` when there's none (an empty string counts as none). */
export function getPref(key, fallback = null) {
  try { const v = localStorage.getItem(key); return v == null || v === '' ? fallback : v; } catch { return fallback; }
}
/** Store a value as a string; null / undefined removes it. */
export function setPref(key, value) {
  try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, String(value)); } catch { /* private window */ }
}
export const getBoolPref = (key, fallback = false) => { const v = getPref(key); return v == null ? fallback : v === '1'; };
export const setBoolPref = (key, on) => setPref(key, on ? '1' : '0');
export function getJSONPref(key, fallback) {
  try { const v = getPref(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
export const setJSONPref = (key, value) => setPref(key, JSON.stringify(value));

/**
 * useState that's remembered in this browser → [value, set]. `valid` (optional)
 * drops a stored value that no longer makes sense (a view that was removed);
 * `fallback` may be a function, asked only when nothing usable is stored.
 */
export function usePref(key, fallback, valid) {
  const [value, setValue] = useState(() => {
    const v = getPref(key);
    if (v != null && (!valid || valid(v))) return v;
    return typeof fallback === 'function' ? fallback() : fallback;
  });
  const set = useCallback((v) => { setValue(v); setPref(key, v); }, [key]);
  return [value, set];
}
