import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api.js';

// Your saved hooks, hashtag sets and calls to action — loaded once, shared.
let cache = null;
let loading = null;
const subs = new Set();
const publish = (next) => { cache = next; subs.forEach((f) => f(next)); };
const load = () => {
  if (!loading) loading = api.listContentLibrary().then(publish).catch(() => {}).finally(() => { loading = null; });
  return loading;
};

/** → [items | null, { save, use, update, remove, reload }] */
export default function useContentLibrary() {
  const [items, setItems] = useState(cache);
  useEffect(() => {
    subs.add(setItems);
    if (cache) setItems(cache); else load();
    return () => { subs.delete(setItems); };
  }, []);
  const save = useCallback(async (kind, text, name = '') => {
    const { item, existed } = await api.saveContentSnippet({ kind, text, name });
    if (!existed) publish([...(cache || []), item]);
    return { item, existed };
  }, []);
  const use = useCallback((item) => {
    publish((cache || []).map((x) => (x.id === item.id ? { ...x, uses: x.uses + 1, usedAt: Date.now() } : x)));
    api.updateContentSnippet(item.id, { use: true }).catch(() => {});
  }, []);
  const update = useCallback(async (id, patch) => {
    publish((cache || []).map((x) => (x.id === id ? { ...x, ...patch } : x)));
    return api.updateContentSnippet(id, patch);
  }, []);
  const remove = useCallback(async (item) => {
    publish((cache || []).filter((x) => x.id !== item.id));
    const { trashId } = await api.removeContentSnippet(item.id);
    return async () => { await api.restoreTrash(trashId); cache = null; await load(); };
  }, []);
  const reload = useCallback(() => { cache = null; return load(); }, []);
  return [items, { save, use, update, remove, reload }];
}
