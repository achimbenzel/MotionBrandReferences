import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';

let cache = null; // the same for every page, loaded once

/** How you appear in the post previews ({ name, handle }) and a way to change it. */
export default function useContentProfile() {
  const [profile, setProfile] = useState(cache || { name: '', handle: '' });
  useEffect(() => {
    let alive = true;
    if (!cache) {
      api.getSettings().then((s) => {
        cache = { name: '', handle: '', ...(s.contentProfile || {}) };
        if (alive) setProfile(cache);
      }).catch(() => {});
    }
    return () => { alive = false; };
  }, []);
  const update = async (p) => {
    const next = { name: String(p.name || '').trim(), handle: String(p.handle || '').replace(/^@+/, '').replace(/[^\w.]/g, '') };
    cache = next;
    setProfile(next);
    const s = await api.updateSettings({ contentProfile: next });
    cache = { ...next, ...(s?.contentProfile || {}) };
    setProfile(cache);
  };
  return [profile, update];
}
