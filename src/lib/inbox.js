import { useEffect, useState } from 'react';
import { api } from './api.js';

// Inbox helpers: what a shared item is, its file as a File (to hand it to
// the upload dialog), and the item count for the sidebar.

export const inboxFileUrl = (item) => (item?.file ? `/data/inbox/${item.id}/${item.file}` : null);

/** 'image' | 'svg' | 'video' | 'pdf' | 'file' | 'video-link' | 'link' | 'text' */
export function inboxKind(item) {
  if (item.kind === 'link') return item.provider ? 'video-link' : 'link';
  if (item.kind === 'text') return 'text';
  const f = String(item.file || '').toLowerCase();
  const mime = String(item.mime || '');
  if (f.endsWith('.svg')) return 'svg';
  if (/\.(png|jpe?g|gif|webp|avif|heic|heif)$/.test(f) || mime.startsWith('image/')) return 'image';
  if (/\.(mp4|m4v|mov|webm|mkv|ogv)$/.test(f) || mime.startsWith('video/')) return 'video';
  if (f.endsWith('.pdf')) return 'pdf';
  return 'file';
}

/** The item's file, fetched back as a File for the upload dialog. */
export async function inboxFile(item) {
  const res = await fetch(inboxFileUrl(item));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  return new File([blob], item.name || item.file, { type: item.mime || blob.type });
}

const EVENT = 'inbox:changed';
export const notifyInbox = () => window.dispatchEvent(new Event(EVENT));

/** Items waiting in the Inbox (re-read on navigation, on return, on change). */
export function useInboxCount(pathname) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let on = true;
    const load = () => api.listInbox().then((items) => { if (on) setCount(items.length); }).catch(() => {});
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    load();
    window.addEventListener(EVENT, load);
    document.addEventListener('visibilitychange', onVisible);
    return () => { on = false; window.removeEventListener(EVENT, load); document.removeEventListener('visibilitychange', onVisible); };
  }, [pathname]);
  return count;
}
