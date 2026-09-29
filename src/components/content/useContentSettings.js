import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api.js';

// Content's own settings — how you appear in the previews, your pillars and
// your posting rhythm — loaded once and shared by every page that uses them.
const DEFAULT = { contentProfile: { name: '', handle: '' }, contentPillars: [], contentRhythm: { goal: 0, slots: [] } };
const KEYS = Object.keys(DEFAULT);
let cache = null;
let loading = null;
const subs = new Set();
const pick = (s) => Object.fromEntries(KEYS.map((k) => [k, s?.[k] ?? DEFAULT[k]]));
const publish = (next) => { cache = next; subs.forEach((f) => f(next)); };

/** → [{ contentProfile, contentPillars, contentRhythm }, update(patch)] — update saves right away. */
export default function useContentSettings() {
  const [s, setS] = useState(cache || DEFAULT);
  useEffect(() => {
    subs.add(setS);
    if (cache) setS(cache);
    else if (!loading) {
      loading = api.getSettings().then((x) => publish(pick(x))).catch(() => {}).finally(() => { loading = null; });
    }
    return () => { subs.delete(setS); };
  }, []);
  const update = useCallback(async (patch) => {
    publish({ ...(cache || DEFAULT), ...patch });
    const saved = await api.updateSettings(patch);
    // What you typed stays; only the handle comes back cleaned up.
    if (patch.contentProfile && saved?.contentProfile) publish({ ...cache, contentProfile: saved.contentProfile });
  }, []);
  return [s, update];
}

/** How you appear in the post previews ({ name, handle }) and a way to change it. */
export function useContentProfile() {
  const [s, update] = useContentSettings();
  const set = useCallback((p) => update({
    contentProfile: { name: String(p.name || '').trim(), handle: String(p.handle || '').replace(/^@+/, '').replace(/[^\w.]/g, '') },
  }), [update]);
  return [s.contentProfile, set];
}
