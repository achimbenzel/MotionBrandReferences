import { Film, Images, Type } from 'lucide-react';
import { contentFileUrl } from '../../lib/api.js';
import { coverOf, autoCoverColors } from '../../lib/content.js';

/** A cover made of type: the title (or the hook) on a gradient in the post's colour. */
export function AutoCover({ c, text: own, className = '' }) {
  const [a, b] = autoCoverColors(c);
  const text = (own ?? (c.title || c.hook) ?? '').trim();
  const size = text.length > 70 ? 'l' : text.length > 32 ? 'm' : 's';
  return (
    <span className={`ct-auto ${className}`} style={{ '--ca': a, '--cb': b }}>
      {text ? <b className={`ct-auto-${size}`}>{text}</b> : <Type size={22} className="ct-auto-icon" />}
    </span>
  );
}

/**
 * The post as it shows in a grid or on a card: its cover picture (or a frame
 * of its video) — or, without one, a cover made of its title.
 */
export default function PostCover({ c, badges = true, className = '' }) {
  const m = coverOf(c);
  if (!m) return <span className={`ct-cover ${className}`}><AutoCover c={c} /></span>;
  const url = contentFileUrl(c, m.file);
  const videos = c.media.filter((x) => x.kind === 'video').length;
  return (
    <span className={`ct-cover ${className}`}>
      {m.kind === 'video' ? <video src={`${url}#t=0.1`} muted preload="metadata" /> : <img src={url} alt="" loading="lazy" draggable={false} />}
      {badges && c.media.length > 1 && <i className="ct-cover-badge">{c.format === 'carousel' ? <Images size={11} /> : null}{c.media.length}</i>}
      {badges && c.media.length === 1 && videos === 1 && <i className="ct-cover-badge"><Film size={11} /></i>}
    </span>
  );
}
