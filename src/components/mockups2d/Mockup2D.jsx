import { useState } from 'react';
import {
  Heart, MessageCircle, Send, Bookmark, MoreHorizontal, BadgeCheck, ChevronLeft, ChevronRight, RotateCw, Lock, Plus, X as Close,
  Repeat2, BarChart2, Share, MapPin, Link as LinkIcon, CalendarDays, Grid3x3, Clapperboard, SquareUser, Menu as MenuIcon, ChevronDown, UserPlus, ImageIcon,
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

const RENDER = { browser: Browser, 'ig-post': IgPost, 'ig-story': IgStory, 'ig-profile': IgProfile, 'x-post': XPost, 'x-profile': XProfile };

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
