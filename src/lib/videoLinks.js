// YouTube / Vimeo links (same rules as the server's): recognise one, and the
// embed / thumbnail addresses for it.

/** → { provider, id, hash?, url } or null. */
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

/** The first link in a piece of text (shared text often wraps one). */
export const firstUrl = (text) => (String(text || '').match(/https?:\/\/[^\s<>"']+/) || [])[0] || null;

export const PROVIDER_LABEL = { youtube: 'YouTube', vimeo: 'Vimeo' };

// Embeds: YouTube's privacy-enhanced domain; Vimeo with Do Not Track.
export function embedUrl(provider, id, hash) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  if (provider === 'youtube') {
    return `https://www.youtube-nocookie.com/embed/${id}?enablejsapi=1&playsinline=1&rel=0&modestbranding=1&origin=${encodeURIComponent(origin)}`;
  }
  return `https://player.vimeo.com/video/${id}?${hash ? `h=${hash}&` : ''}dnt=1&title=0&byline=0&portrait=0`;
}
export const EMBED_ORIGINS = {
  youtube: ['https://www.youtube-nocookie.com', 'https://www.youtube.com'],
  vimeo: ['https://player.vimeo.com'],
};
