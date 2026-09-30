// Software: plugins, scripts, expressions, tutorials.
// Part of the record shapes (see ../schema.js, which re-exports all of it).
import { nanoid } from 'nanoid';
import { CURRENCIES, TAG_KEYS, str } from './base.js';

// ---------------------------------------------------------------------------
// Software — a topic per app with plugins, expressions and tutorials
// ---------------------------------------------------------------------------
export function normalizePlugin(p) {
  return {
    id: p?.id || nanoid(8),
    name: str(p?.name, 160), category: str(p?.category, 80),
    url: str(p?.url, 500), account: str(p?.account, 200), key: str(p?.key, 400),
    price: str(p?.price, 40), currency: CURRENCIES.has(p?.currency) ? p.currency : 'EUR',
    version: str(p?.version, 60), purchasedAt: str(p?.purchasedAt, 20), notes: str(p?.notes, 4000),
    file: p?.file ? str(p.file, 300) : null, fileName: p?.fileName ? str(p.fileName, 200) : null,
    size: Number.isFinite(p?.size) ? p.size : 0,
    image: p?.image ? str(p.image, 300) : null, imageName: p?.imageName ? str(p.imageName, 200) : null,
  };
}
export const normTags = (t) => (Array.isArray(t) ? t : []).slice(0, 24).map((x) => str(x, 40)).filter(Boolean);
export const normalizeExpr = (e) => ({ id: e?.id || nanoid(8), title: str(e?.title, 200), code: str(e?.code, 20000), notes: str(e?.notes, 4000), color: TAG_KEYS.has(e?.color) ? e.color : null, tags: normTags(e?.tags) });
export const normalizeExprGroup = (g) => ({
  id: g?.id || nanoid(8), name: str(g?.name, 160), collapsed: !!g?.collapsed,
  image: g?.image ? str(g.image, 300) : null, imageName: g?.imageName ? str(g.imageName, 200) : null,
  items: (Array.isArray(g?.items) ? g.items : []).slice(0, 500).map(normalizeExpr),
});
export const normalizeTut = (t) => ({ id: t?.id || nanoid(8), title: str(t?.title, 200), url: str(t?.url, 500), channel: str(t?.channel, 120), tags: normTags(t?.tags) });
export const isLegacySoftware = (s) => !!s && ('icon' in s || 'scripts' in s || 'expressions' in s || !Array.isArray(s.expressionGroups));
export function normalizeSoftware(s) {
  if (!s || typeof s !== 'object') return s;
  if (!s.id) s.id = nanoid(10);
  s.name = str(s.name, 120) || 'Untitled software';
  // Banner + avatar (like plans). `icon` is the legacy emoji → avatarEmoji.
  if (typeof s.avatarEmoji !== 'string') s.avatarEmoji = typeof s.icon === 'string' ? s.icon : '';
  delete s.icon;
  if (!('banner' in s)) s.banner = null;
  s.bannerGradient = s.bannerGradient != null ? str(s.bannerGradient, 40) : null;
  if (!('avatar' in s)) s.avatar = null;
  if (!Number.isFinite(s.createdAt)) s.createdAt = 0;
  // Legacy `scripts` fold into `plugins` (one combined list now).
  let plugins = Array.isArray(s.plugins) ? s.plugins : [];
  if (Array.isArray(s.scripts) && s.scripts.length) {
    plugins = [...plugins, ...s.scripts.map((sc, i) => ({ id: sc?.id || `script-${i + 1}`, name: sc?.name || sc?.fileName || 'Script', category: 'Script', notes: sc?.notes || '', file: sc?.file || null, fileName: sc?.fileName || null, size: sc?.size || 0 }))];
  }
  delete s.scripts;
  s.plugins = plugins.map(normalizePlugin);
  // Legacy flat `expressions` fold into a single default group.
  if (!Array.isArray(s.expressionGroups)) {
    const flat = Array.isArray(s.expressions) ? s.expressions : [];
    s.expressionGroups = flat.length ? [{ id: 'expressions', name: '', image: null, imageName: null, items: flat.map((e, i) => ({ ...e, id: e?.id || `expression-${i + 1}` })) }] : [];
  }
  delete s.expressions;
  s.expressionGroups = s.expressionGroups.map(normalizeExprGroup);
  s.tutorials = (Array.isArray(s.tutorials) ? s.tutorials : []).map(normalizeTut);
  return s;
}
