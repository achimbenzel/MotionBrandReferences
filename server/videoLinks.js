/**
 * YouTube / Vimeo links as motion references: recognise a link, and look up
 * its title, length, size and thumbnail (oEmbed). Only these fixed hosts are
 * ever contacted, with a short timeout — offline, a link still works, just
 * without the extras. LINK_LOOKUP=off turns the lookups off altogether.
 */
const lookupsOff = () => process.env.LINK_LOOKUP === 'off';

// → { provider, id, hash?, url } or null.
export function parseVideoLink(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'music.youtube.com') {
    id = u.searchParams.get('v') || (u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/) || [])[1] || null;
  }
  if (id && /^[\w-]{11}$/.test(id)) return { provider: 'youtube', id, url: `https://www.youtube.com/watch?v=${id}` };
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const m = u.pathname.match(/(?:^|\/)(\d{5,12})(?:\/([0-9a-f]{6,20}))?\/?$/i);
    if (m) {
      const hash = m[2] || u.searchParams.get('h') || null;
      return { provider: 'vimeo', id: m[1], hash: hash && /^[0-9a-f]{6,20}$/i.test(hash) ? hash : null, url: `https://vimeo.com/${m[1]}${hash ? `/${hash}` : ''}` };
    }
  }
  return null;
}

const OEMBED = {
  youtube: (l) => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(l.url)}`,
  vimeo: (l) => `https://vimeo.com/api/oembed.json?width=1280&url=${encodeURIComponent(l.url)}`,
};
const THUMB_HOST = /(^|\.)(ytimg\.com|youtube\.com|vimeocdn\.com)$/i;

/** → { title, author, duration, width, height, thumbs: [url…] } (empty when offline). */
export async function fetchVideoMeta(link, { timeout = 6000 } = {}) {
  const out = { thumbs: [] };
  if (link.provider === 'youtube') out.thumbs.push(`https://i.ytimg.com/vi/${link.id}/maxresdefault.jpg`, `https://i.ytimg.com/vi/${link.id}/hqdefault.jpg`);
  if (lookupsOff()) return out;
  try {
    const r = await fetch(OEMBED[link.provider](link), { signal: AbortSignal.timeout(timeout), headers: { accept: 'application/json' } });
    if (r.ok) {
      const j = await r.json();
      if (typeof j.title === 'string') out.title = j.title.slice(0, 200);
      if (typeof j.author_name === 'string') out.author = j.author_name.slice(0, 120);
      if (Number.isFinite(j.duration) && j.duration > 0) out.duration = j.duration;
      // YouTube reports the player's size, not the video's — only Vimeo's is the real one.
      if (link.provider === 'vimeo' && j.width > 0 && j.height > 0) { out.width = Math.round(j.width); out.height = Math.round(j.height); }
      if (typeof j.thumbnail_url === 'string' && link.provider === 'vimeo') out.thumbs.unshift(j.thumbnail_url);
    }
  } catch { /* offline or blocked: go without */ }
  return out;
}

/** The first thumbnail that downloads (image, ≤ 5 MB) → { buf, ext } or null. */
export async function downloadThumb(urls, { timeout = 6000, maxBytes = 5 * 1024 * 1024 } = {}) {
  if (lookupsOff()) return null;
  for (const url of urls) {
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:' || !THUMB_HOST.test(u.hostname)) continue;
      const r = await fetch(u, { signal: AbortSignal.timeout(timeout) });
      const type = r.headers.get('content-type') || '';
      if (!r.ok || !type.startsWith('image/')) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (!buf.length || buf.length > maxBytes) continue;
      // YouTube serves a 120×90 grey placeholder instead of a 404 for missing sizes.
      if (buf.length < 2000) continue;
      return { buf, ext: type.includes('png') ? '.png' : type.includes('webp') ? '.webp' : '.jpg' };
    } catch { /* next */ }
  }
  return null;
}
