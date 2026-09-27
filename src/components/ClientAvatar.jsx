import { clientFileUrl } from '../lib/api.js';
import { tagColor } from '../lib/types.js';

const initials = (name) => (name || '?').split(/[\s&·,-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

/** A client's logo — or its initials on its colour. size: 'sm' | 'md' | 'lg' | 'xl'. */
export default function ClientAvatar({ client, size = 'md' }) {
  if (!client) return null;
  const c = tagColor(client.color);
  const logo = clientFileUrl(client, client.logo);
  return (
    <span className={`client-av client-av-${size} ${logo ? 'has-logo' : ''}`} style={logo ? undefined : { background: c.bg, color: c.fg }} aria-hidden="true">
      {logo ? <img src={logo} alt="" /> : initials(client.name)}
    </span>
  );
}
