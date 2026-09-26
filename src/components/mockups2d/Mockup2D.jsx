import { useState } from 'react';
import {
  Heart, MessageCircle, Send, Bookmark, MoreHorizontal, BadgeCheck, ChevronLeft, ChevronRight, RotateCw, Lock, Plus, X as Close,
  Repeat2, BarChart2, Share, MapPin, Link as LinkIcon, CalendarDays, Grid3x3, Clapperboard, SquareUser, Menu as MenuIcon, ChevronDown, UserPlus, ImageIcon,
  Globe, ThumbsUp, MessageSquare,
} from 'lucide-react';
import { contentBox } from '../../lib/mockup3d/fit.js';
import { TYPES_2D, values, compact, full, xMediaRatio } from '../../lib/mockup2d.js';

/**
 * A picture slot: the picture fills it (or fits in it) with your own size and
 * position (the same maths as the screens of the 3D devices), or a grey
 * placeholder. Click it in the editor to pick what goes there.
 */
export function Slot({ d, k, ratio, round, url, onPick, active, className = '', label }) {
  const slot = d.slots?.[k];
  const [nat, setNat] = useState(null);
  const src = slot ? url(slot) : null;
  const box = contentBox({ screenAspect: ratio, contentAspect: nat || ratio, turn: 0, fit: slot?.fit || 'cover' });
  const s = slot?.adjust?.scale ?? 1;
  const w = box.w * s; const h = box.h * s;
  const pos = { left: `${(0.5 + (slot?.adjust?.x || 0) - w / 2) * 100}%`, top: `${(0.5 + (slot?.adjust?.y || 0) - h / 2) * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` };
  return (
    <div className={`m2-slot ${round ? 'round' : ''} ${active ? 'active' : ''} ${src ? '' : 'm2-none'} ${className}`} style={{ aspectRatio: ratio }}
      data-slot={k} onClick={onPick ? (e) => { e.stopPropagation(); onPick(k); } : undefined}>
      {src && slot.kind === 'video' && (
        <video src={src} style={pos} muted loop autoPlay playsInline onLoadedMetadata={(e) => setNat(e.target.videoWidth / e.target.videoHeight || null)} />
      )}
      {src && slot.kind !== 'video' && (
        <img src={src} style={pos} alt="" draggable={false} onLoad={(e) => setNat(e.target.naturalWidth / e.target.naturalHeight || null)} />
      )}
      {!src && !round && <span className="m2-ph"><ImageIcon size={18} />{label}</span>}
    </div>
  );
}

const Verified = ({ color }) => <BadgeCheck className="m2-verified" size={16} fill={color} color="#fff" strokeWidth={2.2} />;

function Browser({ v, slot }) {
  return (
    <div className="m2-browser">
      <div className="m2b-top">
        <span className="m2b-dots"><i /><i /><i /></span>
        <div className="m2b-tabs">
          <div className="m2b-tab on">{slot('favicon', 1, { round: false, className: 'm2b-fav' })}<span>{v.title}</span><Close size={12} /></div>
          {v.tabs && <div className="m2b-tab"><span className="m2b-fav-ph" /><span>New Tab</span></div>}
          <Plus size={14} className="m2b-plus" />
        </div>
      </div>
      <div className="m2b-bar">
        <ChevronLeft size={16} /><ChevronRight size={16} className="dim" /><RotateCw size={14} />
        <div className="m2b-url"><Lock size={11} /><span>{v.url}</span></div>
        <MoreHorizontal size={16} />
      </div>
      {slot('screen', null, { className: 'm2b-page' })}
    </div>
  );
}

function IgPost({ v, slot }) {
  return (
    <div className="m2-igpost">
      <div className="m2i-head">
        {slot('avatar', 1, { round: true, className: 'm2i-av' })}
        <div className="m2i-who">
          <div><b>{v.username}</b>{v.verified && <Verified color="#0095f6" />}{v.location && !v.sponsored && <span className="m2i-dot"> • </span>}</div>
          {v.sponsored ? <small>Sponsored</small> : v.location ? <small>{v.location}</small> : null}
        </div>
        <MoreHorizontal size={20} />
      </div>
      {slot('media', null, { className: 'm2i-media' })}
      <div className="m2i-actions">
        <Heart size={24} className={v.liked ? 'liked' : ''} fill={v.liked ? '#ff3040' : 'none'} />
        <MessageCircle size={24} style={{ transform: 'scaleX(-1)' }} />
        <Send size={23} />
        {v.carousel && <span className="m2i-dots"><i className="on" /><i /><i /><i /></span>}
        <Bookmark size={24} className="m2i-save" fill={v.saved ? 'currentColor' : 'none'} />
      </div>
      <div className="m2i-body">
        <b>{full(v.likes)} likes</b>
        {v.caption && <p><b>{v.username}</b> {v.caption}</p>}
        {v.comments > 0 && <p className="m2i-sub">View all {full(v.comments)} comments</p>}
        {v.time && <p className="m2i-time">{v.time}</p>}
      </div>
    </div>
  );
}

function IgStory({ v, slot }) {
  const n = Math.max(1, Math.min(8, Math.round(v.segments || 1)));
  const cur = Math.max(1, Math.min(n, Math.round(v.current || 1)));
  return (
    <div className="m2-igstory">
      {slot('media', 9 / 16, { className: 'm2s-media' })}
      <div className="m2s-top">
        <div className="m2s-bars">{Array.from({ length: n }, (_, i) => <i key={i} className={i + 1 < cur ? 'done' : i + 1 === cur ? 'now' : ''} />)}</div>
        <div className="m2s-head">
          {slot('avatar', 1, { round: true, className: 'm2s-av' })}
          <b>{v.username}</b>{v.verified && <Verified color="#0095f6" />}<span className="m2s-time">{v.time}</span>
          <MoreHorizontal size={20} className="m2s-more" /><Close size={22} />
        </div>
      </div>
      {v.reply && (
        <div className="m2s-reply"><span>Send message</span><Heart size={24} /><Send size={22} /></div>
      )}
    </div>
  );
}

function IgProfile({ v, slot }) {
  const grid = v.grid === '1:1' ? 1 : 3 / 4;
  return (
    <div className="m2-igprofile">
      <div className="m2p-top">
        <b>{v.username}</b>{v.verified && <Verified color="#0095f6" />}<ChevronDown size={16} />
        <span className="m2p-grow" /><Plus size={24} /><MenuIcon size={24} />
      </div>
      <div className="m2p-row">
        {slot('avatar', 1, { round: true, className: 'm2p-av' })}
        <div className="m2p-stats">
          <div><b>{compact(v.posts)}</b><span>posts</span></div>
          <div><b>{compact(v.followers)}</b><span>followers</span></div>
          <div><b>{compact(v.following)}</b><span>following</span></div>
        </div>
      </div>
      <div className="m2p-bio">
        <b>{v.name}</b>
        {v.category && <span className="m2p-cat">{v.category}</span>}
        {v.bio && <p>{v.bio}</p>}
        {v.link && <span className="m2p-link"><LinkIcon size={12} /> {v.link}</span>}
      </div>
      <div className="m2p-buttons"><span className="primary">Follow</span><span>Message</span><span className="icon"><UserPlus size={16} /></span></div>
      {v.highlights && (
        <div className="m2p-hl">
          {[0, 1, 2, 3].map((i) => (
            <div key={i}>{slot(`hl-${i}`, 1, { round: true, className: 'm2p-hl-av' })}<span>{v[`h${i}`]}</span></div>
          ))}
        </div>
      )}
      <div className="m2p-tabs"><span className="on"><Grid3x3 size={22} /></span><span><Clapperboard size={22} /></span><span><SquareUser size={22} /></span></div>
      <div className="m2p-grid">{Array.from({ length: 9 }, (_, i) => <div key={i}>{slot(`grid-${i}`, grid, { className: 'm2p-post' })}</div>)}</div>
    </div>
  );
}

function XPost({ d, v, slot }) {
  const used = [0, 1, 2, 3].filter((i) => d.slots?.[`media-${i}`]);
  const count = used.length;
  return (
    <div className="m2-xpost">
      {slot('avatar', 1, { round: true, className: 'm2x-av' })}
      <div className="m2x-main">
        <div className="m2x-head"><b>{v.name}</b>{v.verified && <Verified color="#1d9bf0" />}<span className="m2x-sub">@{v.handle} · {v.time}</span><MoreHorizontal size={18} className="m2x-more" /></div>
        {v.text && <p className="m2x-text">{v.text}</p>}
        {count > 0 ? (
          <div className={`m2x-media n${count}`}>
            {used.map((i, n) => <div key={i} className={`m2x-m m${n}`}>{slot(`media-${i}`, xMediaRatio(count, n), { className: 'm2x-img' })}</div>)}
          </div>
        ) : (
          <div className="m2x-media n1 m2x-media-empty">{slot('media-0', 16 / 9, { className: 'm2x-img' })}</div>
        )}
        <div className="m2x-actions">
          <span><MessageCircle size={18} /> {compact(v.replies)}</span>
          <span><Repeat2 size={18} /> {compact(v.reposts)}</span>
          <span><Heart size={18} /> {compact(v.likes)}</span>
          <span><BarChart2 size={18} /> {compact(v.views)}</span>
          <span className="m2x-end"><Bookmark size={18} /><Share size={18} /></span>
        </div>
      </div>
    </div>
  );
}

function XProfile({ v, slot }) {
  return (
    <div className="m2-xprofile">
      {slot('banner', 3, { className: 'm2x-banner' })}
      <div className="m2x-prow">
        {slot('avatar', 1, { round: true, className: 'm2x-bigav' })}
        <span className="m2x-follow">Follow</span>
      </div>
      <div className="m2x-pinfo">
        <div className="m2x-pname"><b>{v.name}</b>{v.verified && <Verified color="#1d9bf0" />}</div>
        <span className="m2x-sub">@{v.handle}</span>
        {v.bio && <p>{v.bio}</p>}
        <div className="m2x-meta">
          {v.location && <span><MapPin size={15} /> {v.location}</span>}
          {v.website && <span className="m2x-link"><LinkIcon size={15} /> {v.website}</span>}
          {v.joined && <span><CalendarDays size={15} /> {v.joined}</span>}
        </div>
        <div className="m2x-counts"><span><b>{compact(v.following)}</b> Following</span><span><b>{compact(v.followers)}</b> Followers</span></div>
      </div>
      <div className="m2x-ptabs"><span className="on">Posts</span><span>Replies</span><span>Highlights</span><span>Media</span></div>
    </div>
  );
}

// ---- App icon: on a home screen, or at every size it's shown ----------------------------
// Neutral stand-ins for the other apps (no real apps' icons).
const OTHER_APPS = ['#6f7cf7', '#43c59e', '#f59f45', '#e8617a', '#4bb3f0', '#9a78e8', '#f2c94c', '#56ccf2', '#eb5757', '#27ae60', '#bb6bd9', '#f2994a', '#2d9cdb', '#6fcf97', '#f78fb3', '#7f8c8d', '#e0a458', '#5c7cfa', '#20c997', '#ff8787'];
function StatusBar({ time }) {
  const c = '#fff';
  return (
    <div className="m2a-status" style={{ color: c }}>
      <b>{time}</b>
      <span className="m2a-ind">
        <svg width="18" height="11" viewBox="0 0 18 11" fill={c}><rect x="0" y="7" width="3" height="4" rx="1" /><rect x="5" y="5" width="3" height="6" rx="1" /><rect x="10" y="2.5" width="3" height="8.5" rx="1" /><rect x="15" y="0" width="3" height="11" rx="1" /></svg>
        <svg width="16" height="11" viewBox="0 0 16 11" fill="none" stroke={c} strokeWidth="1.9" strokeLinecap="round"><path d="M1.5 4.2a9.5 9.5 0 0 1 13 0" /><path d="M4.2 6.9a5.6 5.6 0 0 1 7.6 0" /><circle cx="8" cy="9.4" r="1" fill={c} stroke="none" /></svg>
        <svg width="26" height="12" viewBox="0 0 26 12" fill="none"><rect x="0.5" y="0.5" width="22" height="11" rx="3.5" stroke={c} opacity=".45" /><rect x="2" y="2" width="17" height="8" rx="2" fill={c} /><rect x="23.6" y="4" width="1.8" height="4" rx="1" fill={c} opacity=".5" /></svg>
      </span>
    </div>
  );
}
function AppIcon({ d, v, slot }) {
  if (v.layout === 'sizes') {
    const sizes = [[180, 'Home screen · 60 pt @3×'], [120, '@2×'], [87, 'Settings'], [60, 'Spotlight'], [40, 'Notifications'], [29, 'Small']];
    return (
      <div className="m2-appsizes">
        <div className="m2a-hero">{slot('icon', 1, { className: 'm2a-icon m2a-big' })}<div><b>{v.name}</b><span>Your app icon at the sizes people see it</span></div></div>
        <div className="m2a-row">
          {sizes.map(([px, label]) => (
            <div key={px} className="m2a-size">
              <div style={{ width: px }}>{slot('icon', 1, { className: 'm2a-icon' })}</div>
              <b>{px} px</b><span>{label}</span>
            </div>
          ))}
        </div>
        <div className="m2a-row m2a-round">
          {[108, 72, 48].map((px) => (
            <div key={px} className="m2a-size">
              <div style={{ width: px }}>{slot('icon', 1, { round: true, className: 'm2a-icon' })}</div>
              <b>{px} px</b><span>Round (Android)</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  const mine = <div className="m2a-app">{slot('icon', 1, { className: 'm2a-icon' })}{v.badge > 0 && <i className="m2a-badge">{Math.min(99, v.badge)}</i>}<span>{v.name}</span></div>;
  const other = (i) => <div key={i} className="m2a-app"><div className="m2a-icon m2a-other" style={{ background: OTHER_APPS[i % OTHER_APPS.length] }} /><span className="m2a-label" /></div>;
  return (
    <div className={`m2-apphome ${d.theme === 'dark' ? 'dark' : ''}`}>
      {slot('wallpaper', 390 / 844, { className: 'm2a-wall' })}
      <div className="m2a-overlay">
        <StatusBar time={v.time} />
        <div className="m2a-grid">
          {Array.from({ length: 20 }, (_, i) => (i === 5 ? <div key="mine">{mine}</div> : other(i)))}
        </div>
        <div className="m2a-dots"><i className="on" /><i /><i /></div>
        <div className="m2a-dock">
          {v.dock ? <div className="m2a-app m2a-docked">{slot('icon', 1, { className: 'm2a-icon' })}</div> : other(20)}
          {[21, 22, 23].map(other)}
        </div>
      </div>
    </div>
  );
}

// ---- Profile pictures: your logo as a profile picture, big to tiny ----------------------
function Avatars({ d, v, slot }) {
  const fill = { white: '#fff', black: '#000', brand: v.color, none: 'transparent' }[v.fill] || '#fff';
  const av = (px, round, extra = '') => (
    <div className={`m2v-av ${round ? 'round' : 'square'} ${v.ring && round ? 'ring' : ''} ${extra}`} style={{ width: px, background: fill }}>
      {slot('avatar', 1, { round, className: 'm2v-pic' })}
    </div>
  );
  return (
    <div className={`m2-avatars ${d.theme === 'dark' ? 'dark' : ''}`}>
      <div className="m2v-top">
        {av(168, true)}
        <div className="m2v-who"><b>{v.name}</b><span>@{v.handle}</span></div>
      </div>
      <div className="m2v-rows">
        <div className="m2v-row">{av(44, true)}<div className="m2v-lines"><b>{v.name}</b><i style={{ width: '70%' }} /><i style={{ width: '45%' }} /></div><small>In a feed · 44</small></div>
        <div className="m2v-row">{av(32, true)}<div className="m2v-lines"><b>{v.handle}</b><i style={{ width: '60%' }} /></div><small>A comment · 32</small></div>
        <div className="m2v-row">{av(24, true)}<div className="m2v-lines"><i style={{ width: '50%' }} /></div><small>A mention · 24</small></div>
        <div className="m2v-row m2v-tiny">{av(16, true)}<div className="m2v-lines"><i style={{ width: '35%' }} /></div><small>Tiny · 16</small></div>
      </div>
      {v.squares && (
        <div className="m2v-squares">
          {[[120, 'Company page · 120'], [64, 'App / channel list · 64'], [36, 'Small · 36']].map(([px, label]) => (
            <div key={px} className="m2v-sq">{av(px, false)}<small>{label}</small></div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- A video channel page ---------------------------------------------------------------
function YtChannel({ v, slot }) {
  return (
    <div className="m2-yt">
      {slot('banner', 6.2, { className: 'm2y-banner' })}
      <div className="m2y-head">
        {slot('avatar', 1, { round: true, className: 'm2y-av' })}
        <div className="m2y-info">
          <h2>{v.name}{v.verified && <BadgeCheck size={20} className="m2y-check" />}</h2>
          <div className="m2y-meta"><b>@{v.handle}</b> · {compact(v.subs)} subscribers · {full(v.videos)} videos</div>
          {v.about && <p>{v.about} <b>…more</b></p>}
          <div className="m2y-buttons"><span className="primary">Subscribe</span><span>Join</span></div>
        </div>
      </div>
      <div className="m2y-tabs"><span className="on">Home</span><span>Videos</span><span>Shorts</span><span>Playlists</span><span>Posts</span></div>
      <div className="m2y-grid">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="m2y-video">
            <div className="m2y-thumb">{slot(`video-${i}`, 16 / 9, { className: 'm2y-pic' })}<i>{['12:04', '4:31', '1:00', '8:47'][i]}</i></div>
            <b>{v[`t${i}`]}</b>
            <span>{compact([184000, 52300, 910000, 23800][i])} views · {['3 days', '2 weeks', '1 month', '2 months'][i]} ago</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- A company page ---------------------------------------------------------------------
function LiPage({ v, slot }) {
  return (
    <div className="m2-li">
      <div className="m2l-card">
        {slot('banner', 5.9, { className: 'm2l-banner' })}
        <div className="m2l-body">
          {slot('logo', 1, { className: 'm2l-logo' })}
          <h2>{v.name}</h2>
          {v.tagline && <p className="m2l-tag">{v.tagline}</p>}
          <p className="m2l-meta">{[v.industry, v.location, `${compact(v.followers)} followers`, v.size].filter(Boolean).join(' · ')}</p>
          <div className="m2l-buttons"><span className="primary"><Plus size={16} /> Follow</span><span>Visit website</span><span className="icon"><MoreHorizontal size={16} /></span></div>
        </div>
        <div className="m2l-tabs"><span className="on">Home</span><span>About</span><span>Posts</span><span>Jobs</span><span>People</span></div>
      </div>
      {v.showPost && (
        <div className="m2l-card m2l-post">
          <div className="m2l-phead">
            {slot('logo', 1, { className: 'm2l-plogo' })}
            <div><b>{v.name}</b><span>{compact(v.followers)} followers</span><span>2d · <Globe size={11} /></span></div>
          </div>
          {v.post && <p className="m2l-ptext">{v.post}</p>}
          {slot('post', 1.91, { className: 'm2l-pic' })}
          <div className="m2l-counts"><span className="m2l-reacts"><i className="a" /><i className="b" /><i className="c" /> {full(v.reactions)}</span><span>{full(v.comments)} comments</span></div>
          <div className="m2l-actions"><span><ThumbsUp size={18} /> Like</span><span><MessageSquare size={18} /> Comment</span><span><Repeat2 size={18} /> Repost</span><span><Send size={18} /> Send</span></div>
        </div>
      )}
    </div>
  );
}

const RENDER = {
  browser: Browser, 'ig-post': IgPost, 'ig-story': IgStory, 'ig-profile': IgProfile, 'x-post': XPost, 'x-profile': XProfile,
  'app-icon': AppIcon, avatars: Avatars, 'yt-channel': YtChannel, 'li-page': LiPage,
};

/**
 * One 2D mockup at its natural size (in CSS px). `url(slot)` = where a slot's
 * file is; `onPick(slotKey)` when a picture slot is clicked; `active` = the
 * slot being edited.
 */
export default function Mockup2D({ d, url, onPick, active }) {
  const type = TYPES_2D[d.type] ? d.type : 'browser';
  const R = RENDER[type];
  const v = values(d);
  const defs = Object.fromEntries(TYPES_2D[type].slots.map((s) => [s.key, s]));
  const slot = (k, ratio, opts = {}) => (
    <Slot d={d} k={k} url={url} onPick={onPick} active={active === k} label={defs[k]?.label}
      ratio={ratio ?? defs[k]?.ratio(d, 0) ?? 1} round={opts.round ?? defs[k]?.round} className={opts.className} />
  );
  return (
    // Keyed by type: switching types builds the mockup fresh (nothing of the old one lingers).
    <div key={type} className={`m2 m2-t-${type} m2-theme-${d.theme}`}>
      <R d={d} v={v} slot={slot} />
    </div>
  );
}
