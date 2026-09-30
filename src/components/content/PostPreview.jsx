import { useEffect, useRef, useState } from 'react';
import {
  Heart, MessageCircle, Send, MoreHorizontal, Music2, Bookmark, Forward, Search, Camera, Repeat2, BarChart2, Plus, Share, ScanLine, Pencil, Check,
} from 'lucide-react';
import { contentFileUrl } from '../../lib/api.js';
import { isTouch } from '../../lib/useMedia.js';
import { PLATFORMS, textFor, threadParts, clipOf, coverOf, fmtDay, fmtNum, charCount } from '../../lib/content.js';
import { AutoCover } from './PostCover.jsx';
import PlatformIcon from './PlatformIcon.jsx';
import { getBoolPref, setBoolPref } from '../../lib/prefs.js';

const PREVIEWABLE = ['instagram', 'tiktok', 'x'];

// Hashtags, @mentions and links in the platform's link colour.
const RICH = /(#[\p{L}\p{N}_]+|@[\w.]+|https?:\/\/\S+)/gu;
function Rich({ text }) {
  const parts = String(text || '').split(RICH);
  return parts.map((p, i) => (i % 2 ? <span key={i} className="pv-tag">{p}</span> : p));
}
const firstLine = (s, max) => {
  const t = String(s || '').trim();
  const line = t.split('\n')[0];
  const cut = line.length > max ? `${line.slice(0, max).replace(/\s+\S*$/, '')}` : line;
  return { text: cut, more: cut.length < t.length };
};
const Avatar = ({ profile, size = 32 }) => (
  <span className="pv-av" style={{ width: size, height: size, fontSize: size * 0.4 }}>{(profile.name || profile.handle || 'Y').trim()[0]?.toUpperCase()}</span>
);
const count = (n) => (n == null ? '' : fmtNum(n));

/** The picture / video filling a phone screen — or the cover made of type. */
function Clip({ c, m, onScreen }) {
  const ref = useRef(null);
  if (!m) return <AutoCover c={c} className="pv-auto" />;
  const url = contentFileUrl(c, m.file);
  const toggle = () => { const v = ref.current; if (v) { if (v.paused) v.play().catch(() => {}); else v.pause(); } };
  return (
    <>
      {m.kind === 'video'
        ? <video ref={ref} src={isTouch() ? `${url}#t=0.1` : url} muted loop playsInline autoPlay={!isTouch()} preload="metadata" onClick={toggle} />
        : <img src={url} alt="" draggable={false} />}
      {onScreen && <span className="pv-onscreen">{onScreen}</span>}
    </>
  );
}

// Roughly what each app's buttons and text cover (share of the screen).
const SAFE = {
  instagram: { top: 14, bottom: 35, left: 6, right: 16 },
  tiktok: { top: 9, bottom: 26, left: 5, right: 16 },
};
const SafeZone = ({ z }) => (
  <span className="pv-safe" aria-hidden="true">
    <i style={{ top: 0, left: 0, right: 0, height: `${z.top}%` }} />
    <i style={{ bottom: 0, left: 0, right: 0, height: `${z.bottom}%` }} />
    <i style={{ top: `${z.top}%`, bottom: `${z.bottom}%`, left: 0, width: `${z.left}%` }} />
    <i style={{ top: `${z.top}%`, bottom: `${z.bottom}%`, right: 0, width: `${z.right}%` }} />
    <b style={{ top: `${z.top}%`, bottom: `${z.bottom}%`, left: `${z.left}%`, right: `${z.right}%` }}><em>Safe zone</em></b>
  </span>
);

function Reel({ c, profile, safe, onScreen }) {
  const cap = firstLine(textFor(c, 'instagram'), 44);
  const m = c.metrics || {};
  return (
    <div className="pv-phone pv-reel">
      <div className="pv-media"><Clip c={c} m={clipOf(c)} onScreen={onScreen} /></div>
      <span className="pv-shade" />
      <div className="pv-top"><b>Reels</b><Camera size={22} /></div>
      <div className="pv-rail">
        <span><Heart size={25} />{count(m.likes)}</span>
        <span><MessageCircle size={25} style={{ transform: 'scaleX(-1)' }} />{count(m.comments)}</span>
        <span><Send size={24} />{count(m.shares)}</span>
        <span><MoreHorizontal size={22} /></span>
        <span className="pv-audio-sq"><Avatar profile={profile} size={26} /></span>
      </div>
      <div className="pv-bottom">
        <div className="pv-who"><Avatar profile={profile} /><b>{profile.handle || 'yourname'}</b><span className="pv-follow">Follow</span></div>
        {cap.text && <p className="pv-cap"><Rich text={cap.text} />{cap.more && <span className="pv-more">… more</span>}</p>}
        <div className="pv-music"><Music2 size={12} /> {profile.handle || 'yourname'} · Original audio</div>
      </div>
      {safe && <SafeZone z={SAFE.instagram} />}
    </div>
  );
}

function TikTok({ c, profile, safe, onScreen }) {
  const cap = firstLine(textFor(c, 'tiktok'), 80);
  const m = c.metrics || {};
  return (
    <div className="pv-phone pv-tt">
      <div className="pv-media"><Clip c={c} m={clipOf(c)} onScreen={onScreen} /></div>
      <span className="pv-shade" />
      <div className="pv-top pv-tt-top"><span>Following</span><b>For You</b><Search size={20} className="pv-tt-search" /></div>
      <div className="pv-rail pv-tt-rail">
        <span className="pv-tt-av"><Avatar profile={profile} size={40} /><i><Plus size={11} strokeWidth={3.5} /></i></span>
        <span><Heart size={28} fill="#fff" stroke="none" />{count(m.likes)}</span>
        <span><MessageCircle size={27} fill="#fff" stroke="none" />{count(m.comments)}</span>
        <span><Bookmark size={26} fill="#fff" stroke="none" />{count(m.saves)}</span>
        <span><Forward size={27} fill="#fff" stroke="none" />{count(m.shares)}</span>
        <span className="pv-disc"><Avatar profile={profile} size={22} /></span>
      </div>
      <div className="pv-bottom pv-tt-bottom">
        <b>{profile.name || profile.handle || 'Your name'}</b>
        {cap.text && <p className="pv-cap"><Rich text={cap.text} />{cap.more && <span className="pv-more"> … more</span>}</p>}
        <div className="pv-music"><Music2 size={12} /> original sound – {profile.handle || 'yourname'}</div>
      </div>
      {safe && <SafeZone z={SAFE.tiktok} />}
    </div>
  );
}

function IgFeed({ c, profile }) {
  const text = textFor(c, 'instagram');
  const short = text.length > 125;
  const m = coverOf(c);
  const images = c.media.length;
  return (
    <div className="pv-ig">
      <div className="pv-ig-head"><Avatar profile={profile} /><b>{profile.handle || 'yourname'}</b><MoreHorizontal size={18} /></div>
      <div className="pv-ig-media">
        {m ? (m.kind === 'video' ? <video src={`${contentFileUrl(c, m.file)}#t=0.1`} muted preload="metadata" /> : <img src={contentFileUrl(c, m.file)} alt="" />) : <AutoCover c={c} className="pv-auto" />}
        {c.format === 'carousel' && images > 1 && <span className="pv-ig-count">1/{images}</span>}
      </div>
      <div className="pv-ig-actions">
        <Heart size={22} /><MessageCircle size={22} style={{ transform: 'scaleX(-1)' }} /><Send size={21} />
        {c.format === 'carousel' && images > 1 && <span className="pv-ig-dots">{Array.from({ length: Math.min(images, 6) }, (_, i) => <i key={i} className={i ? '' : 'on'} />)}</span>}
        <Bookmark size={22} className="pv-ig-save" />
      </div>
      <div className="pv-ig-body">
        {c.metrics?.likes != null && <b>{c.metrics.likes.toLocaleString()} likes</b>}
        {text && <p><b>{profile.handle || 'yourname'}</b> <Rich text={short ? text.slice(0, 125) : text} />{short && <span className="pv-more">… more</span>}</p>}
      </div>
    </div>
  );
}

export function XPost({ c, profile }) {
  const text = textFor(c, 'x');
  const parts = c.format === 'thread' ? threadParts(text) : [text.trim()];
  const shown = parts.length ? parts : [''];
  const media = c.media.slice(0, 4);
  const when = c.date ? fmtDay(c.date, { day: 'numeric', month: 'short' }) : 'now';
  const m = c.metrics || {};
  return (
    <div className="pv-x">
      {shown.map((t, i) => {
        const len = charCount(t);
        return (
          <div key={i} className={`pv-x-post ${i < shown.length - 1 ? 'thread' : ''}`}>
            <Avatar profile={profile} size={38} />
            <div className="pv-x-main">
              <div className="pv-x-head"><b>{profile.name || 'Your name'}</b><span>@{profile.handle || 'yourname'} · {when}</span><MoreHorizontal size={16} /></div>
              {t ? <p className="pv-x-text"><Rich text={t} /></p> : <p className="pv-x-text pv-x-empty">What’s happening?</p>}
              {len > 280 && <span className="pv-x-over">{len} / 280 — too long for one post</span>}
              {i === 0 && media.length > 0 && (
                <div className={`pv-x-media n${media.length}`}>
                  {media.map((x) => (x.kind === 'video'
                    ? <video key={x.id} src={`${contentFileUrl(c, x.file)}#t=0.1`} muted preload="metadata" />
                    : <img key={x.id} src={contentFileUrl(c, x.file)} alt="" />))}
                </div>
              )}
              <div className="pv-x-actions">
                <span><MessageCircle size={16} />{i === 0 ? count(m.comments) : ''}</span>
                <span><Repeat2 size={17} />{i === 0 ? count(m.shares) : ''}</span>
                <span><Heart size={16} />{i === 0 ? count(m.likes) : ''}</span>
                <span><BarChart2 size={16} />{i === 0 ? count(m.views) : ''}</span>
                <span className="pv-x-end"><Bookmark size={16} /><Share size={16} /></span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Which preview a platform gets for this format. */
export const previewKind = (c, p) => (p === 'x' ? 'x' : p === 'tiktok' ? 'tiktok' : ['post', 'carousel', 'text', 'thread'].includes(c.format) ? 'igfeed' : 'reel');

/**
 * The post as it'll look — a Reel, on TikTok, on X (or in the Instagram
 * feed for a post / carousel): its video or cover, the text as it goes out
 * on that platform, your name. Safe zones show what the app's buttons cover.
 */
export default function PostPreview({ c, profile, onProfile, platform, onPlatform }) {
  const tabs = PREVIEWABLE.filter((p) => c.platforms.includes(p));
  const list = tabs.length ? tabs : PREVIEWABLE;
  const tab = list.includes(platform) ? platform : list[0];
  const [safe, setSafe] = useState(() => getBoolPref('contentSafe'));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile);
  useEffect(() => { if (!editing) setDraft(profile); }, [profile, editing]);
  const kind = previewKind(c, tab);
  const onScreen = c.beats?.find((b) => b.kind === 'hook')?.screen?.trim() || '';
  const done = () => { setEditing(false); if (draft.name !== profile.name || draft.handle !== profile.handle) onProfile(draft); };

  return (
    <div className="pv">
      <div className="pv-tabs" role="tablist" aria-label="Preview">
        {list.map((p) => (
          <button key={p} type="button" role="tab" aria-selected={tab === p} className={tab === p ? 'on' : ''} onClick={() => onPlatform(p)}>
            <PlatformIcon platform={p} size={13} /> {p === 'instagram' ? (kind === 'igfeed' && tab === p ? 'Feed' : 'Reel') : PLATFORMS[p].label}
          </button>
        ))}
        {(kind === 'reel' || kind === 'tiktok') && (
          <button type="button" className={`pv-safe-btn ${safe ? 'on' : ''}`} onClick={() => { setSafe(!safe); setBoolPref('contentSafe', !safe); }} aria-pressed={safe} title="Show what the app's buttons and text cover">
            <ScanLine size={14} /> Safe zone
          </button>
        )}
      </div>
      <div className={`pv-stage pv-stage-${kind}`}>
        {kind === 'reel' && <Reel c={c} profile={profile} safe={safe} onScreen={onScreen} />}
        {kind === 'tiktok' && <TikTok c={c} profile={profile} safe={safe} onScreen={onScreen} />}
        {kind === 'igfeed' && <IgFeed c={c} profile={profile} />}
        {kind === 'x' && <XPost c={c} profile={profile} />}
      </div>
      {editing ? (
        <form className="pv-profile editing" onSubmit={(e) => { e.preventDefault(); done(); }}>
          <input className="input" value={draft.name} placeholder="Your name" aria-label="Name" maxLength={60} autoFocus onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <span className="pv-at">@<input className="input" value={draft.handle} placeholder="handle" aria-label="Handle" maxLength={30} onChange={(e) => setDraft({ ...draft, handle: e.target.value.replace(/^@+/, '') })} /></span>
          <button type="submit" className="icon-btn" aria-label="Done"><Check size={15} /></button>
        </form>
      ) : (
        <button type="button" className="pv-profile" onClick={() => setEditing(true)} title="How you appear in the previews">
          Shown as <b>{profile.name || 'Your name'}</b> <span>@{profile.handle || 'yourname'}</span> <Pencil size={12} />
        </button>
      )}
    </div>
  );
}
