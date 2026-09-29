import {
  Image, Monitor, User, Star, Building2, Car, Plane, Gamepad2, Trophy, Rocket, Music, Film, Camera, Award, Heart, Zap, Crown,
  Globe, Mic, Palette, PenTool, Sparkles, Flame, Target, Handshake, Briefcase, Megaphone, Coins, Users, Medal, Gem, Mountain,
  Clapperboard, Box, Brush, GraduationCap, PartyPopper, TrendingUp, Headphones, Tv, Laptop, Lightbulb, Coffee, Compass, Lock,
} from 'lucide-react';
import { achievementFileUrl } from '../../lib/api.js';
import { RARITIES, HOLO, SHINE, fmtDate, fmtValue, progressOf } from '../../lib/achievements.js';

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

// The tilt that follows the pointer (holo cards): where it is, as CSS variables.
const tilt = (e) => {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width; const y = (e.clientY - r.top) / r.height;
  el.style.setProperty('--mx', `${x * 100}%`); el.style.setProperty('--my', `${y * 100}%`);
  el.style.setProperty('--rx', `${(0.5 - y) * 10}deg`); el.style.setProperty('--ry', `${(x - 0.5) * 12}deg`);
};
const untilt = (e) => { for (const k of ['--mx', '--my', '--rx', '--ry']) e.currentTarget.style.removeProperty(k); };

/**
 * The frame's shine: a light that runs along it (Silver, Gold, Emerald) — or,
 * on holo cards, a rainbow foil that circles it with glitter (Pokémon-style).
 */
function FrameFx({ foil }) {
  return <span className={`ach-frame-fx ${foil ? 'foil' : 'shine'}`} aria-hidden="true"><i />{foil && <b />}</span>;
}
const looks = (a, got) => ({ holo: got && HOLO.has(a.rarity), shine: got && SHINE.has(a.rarity) });

/**
 * One achievement, like a collectible card: a frame in its rarity, the
 * badge, the name, what it takes — and the day it was reached (or how far
 * you are / locked). Once reached, the frame shines from Silver up; Diamond,
 * Mythic, quests and dream quests are holo — a sheen over the paper, foil
 * and glitter on the frame and the badge ring. `showcase` shows it as reached
 * (the editor's preview); `still` leaves the tilt to whoever holds it (the
 * big view).
 */
export default function AchievementCard({ a, metrics, onClick, glow = false, iconUrl, stickerUrl, as = 'button', showcase = false, still = false, drag, className = '' }) {
  const r = RARITIES[a.rarity] || RARITIES.stone;
  const sticker = stickerUrl !== undefined ? stickerUrl : achievementFileUrl(a, a.sticker);
  const p = progressOf(a, metrics);
  const got = !!a.achievedAt || showcase;
  const { holo, shine } = looks(a, got);
  const Tag = as;
  const moves = holo && !still;
  return (
    <Tag type={as === 'button' ? 'button' : undefined} className={`ach-card r-${a.rarity} ${got ? 'got' : 'locked'} ${holo ? 'holo' : ''} ${still ? 'still' : ''} ${glow ? 'glow' : ''} ${className}`}
      onClick={onClick} style={{ '--rc': r.color }} title={as === 'button' ? `${r.label} · ${r.xp} XP` : undefined} {...(drag || {})}
      onPointerMove={moves ? tilt : undefined} onPointerLeave={moves ? untilt : undefined}>
      {(holo || shine) && <FrameFx foil={holo} />}
      <span className="ach-paper">
        <span className="ach-rarity">{r.label}</span>
        <span className="ach-badge-wrap">
          <Badge a={a} iconUrl={iconUrl} />
          {!got && <span className="ach-lock" aria-hidden="true"><Lock size={11} strokeWidth={2.5} /></span>}
        </span>
        <b className={`ach-title ${a.title ? '' : 'untitled'}`}>{a.title || 'Untitled'}</b>
        {a.description && <span className="ach-desc">{a.description}</span>}
        <span className="ach-foot">
          {a.achievedAt ? <>Unlocked <time dateTime={a.achievedAt}>{fmtDate(a.achievedAt)}</time></>
            : p != null ? (
              <span className="ach-progress">
                <span className="ach-bar"><i style={{ width: `${Math.max(2, p * 100)}%` }} /></span>
                <span>{fmtValue(a.metric, metrics?.[a.metric] || 0)} / {fmtValue(a.metric, a.target)}</span>
              </span>
            ) : <><Lock size={10} /> {showcase ? 'Not reached yet' : 'Locked'}</>}
        </span>
        {holo && <span className="ach-holo" aria-hidden="true"><i /></span>}
      </span>
      {sticker && <img className="ach-sticker" src={sticker} alt="" draggable={false} />}
    </Tag>
  );
}

/** The back of a card (the big view turns it round): its rarity, XP, group and day. */
export function CardBack({ a }) {
  const r = RARITIES[a.rarity] || RARITIES.stone;
  const got = !!a.achievedAt;
  const { holo, shine } = looks(a, got);
  return (
    <div className={`ach-card ach-back r-${a.rarity} ${got ? 'got' : 'locked'} ${holo ? 'holo' : ''} still`} style={{ '--rc': r.color }} aria-hidden="true">
      {(holo || shine) && <FrameFx foil={holo} />}
      <span className="ach-back-in">
        <span className="ach-back-emblem"><Trophy size={30} /></span>
        <b>{r.label}</b>
        <span className="ach-back-xp">{r.xp} XP</span>
        <span className="ach-back-group">{a.group}</span>
        <span className="ach-back-day">{got ? `Unlocked ${fmtDate(a.achievedAt)}` : 'Not reached yet'}</span>
        <span className="ach-back-brand">Confinium · Achievements</span>
        {holo && <span className="ach-holo"><i /></span>}
      </span>
    </div>
  );
}

/** Your rank as an emblem: a hexagon in the tier's colours with the division (1–3). */
export function RankEmblem({ rank, size = 88 }) {
  return (
    <span className={`ach-emblem r-${rank.tier} ${HOLO.has(rank.tier) ? 'holo' : ''}`} style={{ width: size, '--rc': RARITIES[rank.tier].color }} title={rank.label}>
      <span className="ach-emblem-in">
        <b style={{ fontSize: Math.round(size * 0.36) }}>{rank.div}</b>
        <small style={{ fontSize: Math.max(8, Math.round(size * 0.1)) }}>{RARITIES[rank.tier].label}</small>
      </span>
      <span className="ach-emblem-pips">{[1, 2, 3].map((d) => <i key={d} className={d <= rank.div ? 'on' : ''} />)}</span>
    </span>
  );
}
