import {
  Image, Monitor, User, Star, Building2, Car, Plane, Gamepad2, Trophy, Rocket, Music, Film, Camera, Award, Heart, Zap, Crown,
  Globe, Mic, Palette, PenTool, Sparkles, Flame, Target, Handshake, Briefcase, Megaphone, Coins, Users, Medal, Gem, Mountain,
  Clapperboard, Box, Brush, GraduationCap, PartyPopper, TrendingUp, Headphones, Tv, Laptop, Lightbulb, Coffee, Compass, Lock,
} from 'lucide-react';
import { achievementFileUrl } from '../../lib/api.js';
import { RARITIES, fmtDate, fmtValue, progressOf } from '../../lib/achievements.js';

// "A person you know": lucide has no user-with-star, so one on top of the other.
const UserStar = ({ size = 24, ...rest }) => (
  <span className="ach-userstar" style={{ width: size, height: size }}>
    <User size={size} {...rest} />
    <Star size={Math.round(size * 0.5)} {...rest} fill="currentColor" />
  </span>
);

export const SYMBOLS = {
  trophy: Trophy, star: Star, crown: Crown, medal: Medal, award: Award, gem: Gem, flame: Flame, zap: Zap, rocket: Rocket, target: Target,
  mountain: Mountain, sparkles: Sparkles, image: Image, monitor: Monitor, film: Film, clapperboard: Clapperboard, camera: Camera,
  palette: Palette, brush: Brush, pen: PenTool, music: Music, headphones: Headphones, mic: Mic, tv: Tv, laptop: Laptop, gamepad: Gamepad2,
  'user-star': UserStar, users: Users, building: Building2, handshake: Handshake, briefcase: Briefcase, coins: Coins, trending: TrendingUp,
  megaphone: Megaphone, heart: Heart, globe: Globe, car: Car, plane: Plane, compass: Compass, graduation: GraduationCap,
  party: PartyPopper, lightbulb: Lightbulb, coffee: Coffee, box: Box,
};

/** The round badge: a short text ("10K", "500€"), a symbol or a picture. */
export function Badge({ a, iconUrl, size = 62 }) {
  const img = iconUrl !== undefined ? iconUrl : achievementFileUrl(a, a.iconImage);
  const Sym = SYMBOLS[a.icon.symbol];
  const text = a.icon.text || (a.title || '?').slice(0, 1).toUpperCase();
  let inner;
  if (a.icon.type === 'image' && img) inner = <img src={img} alt="" draggable={false} />;
  else if (a.icon.type === 'symbol' && Sym) inner = <Sym size={Math.round(size * 0.42)} strokeWidth={2} />;
  else inner = <b style={{ fontSize: Math.round(size * (text.length > 4 ? 0.2 : text.length > 3 ? 0.24 : text.length > 2 ? 0.28 : 0.34)) }}>{text}</b>;
  return <span className={`ach-badge ${a.icon.type === 'image' && img ? 'pic' : ''}`} style={{ width: size, height: size }}>{inner}</span>;
}

/**
 * One achievement, like a collectible card: a frame in its rarity, the
 * badge, the name, what it takes — and the day it was reached (or how far
 * you are / locked).
 */
export default function AchievementCard({ a, metrics, onClick, glow = false, iconUrl, stickerUrl, as = 'button' }) {
  const r = RARITIES[a.rarity] || RARITIES.stone;
  const sticker = stickerUrl !== undefined ? stickerUrl : achievementFileUrl(a, a.sticker);
  const p = progressOf(a, metrics);
  const Tag = as;
  return (
    <Tag type={as === 'button' ? 'button' : undefined} className={`ach-card r-${a.rarity} ${a.achievedAt ? 'got' : 'locked'} ${glow ? 'glow' : ''}`}
      onClick={onClick} style={{ '--rc': r.color }} title={as === 'button' ? `${r.label} · ${r.xp} XP` : undefined}>
      <span className="ach-paper">
        {sticker && <img className="ach-sticker" src={sticker} alt="" draggable={false} />}
        <span className="ach-rarity">{r.label}</span>
        <Badge a={a} iconUrl={iconUrl} />
        <b className={`ach-title ${a.title ? '' : 'untitled'}`}>{a.title || 'Untitled'}</b>
        {a.description && <span className="ach-desc">{a.description}</span>}
        <span className="ach-foot">
          {a.achievedAt ? <>Unlocked <time dateTime={a.achievedAt}>{fmtDate(a.achievedAt)}</time></>
            : p != null ? (
              <span className="ach-progress">
                <span className="ach-bar"><i style={{ width: `${Math.max(2, p * 100)}%` }} /></span>
                <span>{fmtValue(a.metric, metrics?.[a.metric] || 0)} / {fmtValue(a.metric, a.target)}</span>
              </span>
            ) : <><Lock size={10} /> Locked</>}
        </span>
      </span>
    </Tag>
  );
}
