// Something picked "from the app" (MediaPicker → { source, url, name, kind })
// as a File — for the places that work with files the same way as with an
// upload (cropping, covers, palettes, new references …).

const TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.ogv': 'video/ogg',
};
const EXT = Object.fromEntries(Object.entries(TYPES).reverse().map(([e, t]) => [t, e]));

// A picture without a telling name (older profile pictures were saved as `.img`): by its first bytes.
async function sniff(blob) {
  const b = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const s = (i, str) => [...str].every((ch, k) => b[i + k] === ch.charCodeAt(0));
  if (b[0] === 0x89 && s(1, 'PNG')) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (s(0, 'GIF8')) return 'image/gif';
  if (s(0, 'RIFF') && s(8, 'WEBP')) return 'image/webp';
  if (s(4, 'ftypavif')) return 'image/avif';
  if (s(0, '<svg') || s(0, '<?xml')) return 'image/svg+xml';
  return '';
}

/** { url, name } → a File named after it, with its real type. */
export async function fileFromPick({ url, name }) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load it (${res.status})`);
  const blob = await res.blob();
  const urlExt = (/\.[a-z0-9]{2,5}$/i.exec(url.split(/[?#]/)[0]) || [''])[0].toLowerCase();
  let type = TYPES[urlExt] || (/^(image|video)\//.test(blob.type) ? blob.type : '');
  if (!type) type = await sniff(blob);
  const ext = TYPES[urlExt] ? urlExt : EXT[type] || '';
  const base = String(name || 'picture').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'picture';
  const fileName = ext && base.toLowerCase().endsWith(ext) ? base : `${base}${ext}`;
  return new File([blob], fileName, { type });
}
