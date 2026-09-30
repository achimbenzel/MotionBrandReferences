// A plan's banner (a gradient or a picture) and its profile picture (an
// emoji or a picture), with their pickers, above the plan's name.
import { useState } from 'react';
import { Image as ImageIcon, UploadCloud, Library, Camera } from 'lucide-react';
import { api, planFileUrl } from '../../lib/api.js';
import { PLAN_GRADIENTS, gradientCss } from '../../lib/types.js';

const PLAN_EMOJIS = ['🎨', '✏️', '🖌️', '🧠', '💡', '🚀', '🔥', '⭐', '🌈', '🎯',
  '📦', '🏷️', '🖼️', '📐', '🧩', '🎬', '📸', '🎵', '🏗️', '🛠️',
  '💎', '🌱', '☕', '📊', '🗂️', '🔮', '🦄', '🍎', '🌍', '🏀'];
function firstEmoji(str) {
  const t = String(str || '').trim();
  if (!t) return '';
  try { const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' }); return [...seg.segment(t)][0].segment; }
  catch { return [...t][0]; }
}

/** onUpload(kind) / onFromApp(kind): a new 'banner' or 'avatar' picture from a file or from the app. */
export default function PlanIdentity({ plan, setPlan, toast, onUpload, onFromApp }) {
  const [bannerPicker, setBannerPicker] = useState(false);
  const [avatarPicker, setAvatarPicker] = useState(false);
  const [emojiInput, setEmojiInput] = useState('');

  const pickGradient = async (gid) => {
    try { if (plan.banner) await api.removePlanImage(plan.id, 'banner'); setPlan(await api.updatePlan(plan.id, { bannerGradient: gid })); setBannerPicker(false); }
    catch (e) { toast(`Failed: ${e.message}`, 'error'); }
  };
  const removeBanner = async () => {
    try { if (plan.banner) setPlan(await api.removePlanImage(plan.id, 'banner')); else setPlan(await api.updatePlan(plan.id, { bannerGradient: null })); }
    catch (e) { toast(`Failed: ${e.message}`, 'error'); }
  };
  const pickEmoji = async (raw) => {
    const emoji = firstEmoji(raw); if (!emoji) return;
    try { if (plan.avatar) await api.removePlanImage(plan.id, 'avatar'); setPlan(await api.updatePlan(plan.id, { avatarEmoji: emoji })); setEmojiInput(''); setAvatarPicker(false); }
    catch (e) { toast(`Failed: ${e.message}`, 'error'); }
  };
  const removeAvatar = async () => {
    try { if (plan.avatar) setPlan(await api.removePlanImage(plan.id, 'avatar')); else setPlan(await api.updatePlan(plan.id, { avatarEmoji: null })); setAvatarPicker(false); }
    catch (e) { toast(`Failed: ${e.message}`, 'error'); }
  };

  const bannerUrl = plan.banner ? planFileUrl(plan, plan.banner) : null;
  const bannerGrad = !bannerUrl ? gradientCss(plan.bannerGradient) : null;
  const hasBanner = !!(bannerUrl || bannerGrad);
  const bannerStyle = bannerUrl ? { backgroundImage: `url("${bannerUrl}")` } : bannerGrad ? { backgroundImage: bannerGrad } : undefined;
  const avatarUrl = plan.avatar ? planFileUrl(plan, plan.avatar) : null;
  const avatarEmoji = !avatarUrl ? (plan.avatarEmoji || null) : null;
  return (
    <>
      <div className={`plan-banner ${hasBanner ? '' : 'empty'}`} style={bannerStyle}>
        <div className="plan-banner-actions">
          <button className="btn btn-sm" onClick={() => setBannerPicker((v) => !v)}><ImageIcon size={15} /> {hasBanner ? 'Change banner' : 'Add banner'}</button>
          {hasBanner && <button className="btn btn-sm btn-ghost" onClick={removeBanner}>Remove</button>}
        </div>
        {bannerPicker && <div className="banner-picker-backdrop" onClick={() => setBannerPicker(false)} />}
        {bannerPicker && (
          <div className="banner-picker" onMouseDown={(e) => e.stopPropagation()}>
            <div className="banner-picker-head">Gradients</div>
            <div className="banner-picker-grid">
              {PLAN_GRADIENTS.map((g) => (
                <button key={g.id} className={`banner-swatch ${plan.bannerGradient === g.id && !bannerUrl ? 'on' : ''}`}
                  style={{ backgroundImage: g.css }} title={g.id} onClick={() => pickGradient(g.id)} />
              ))}
            </div>
            <div className="banner-picker-row">
              <button className="btn btn-sm banner-picker-upload" onClick={() => { setBannerPicker(false); onUpload('banner'); }}>
                <UploadCloud size={14} /> Upload…
              </button>
              <button className="btn btn-sm banner-picker-upload" onClick={() => { setBannerPicker(false); onFromApp('banner'); }}>
                <Library size={14} /> From the app…
              </button>
            </div>
          </div>
        )}
      </div>
      <div className={`plan-idrow ${avatarPicker ? 'picking' : ''}`}>
        <div className="plan-avatar-wrap">
          <button className="plan-avatar" onClick={() => setAvatarPicker((v) => !v)} title="Change profile image">
            {avatarUrl ? <img src={avatarUrl} alt="" />
              : avatarEmoji ? <span className="plan-avatar-emoji">{avatarEmoji}</span>
                : <span>{(plan.name || '?').charAt(0).toUpperCase()}</span>}
            <span className="plan-avatar-edit"><Camera size={15} /></span>
          </button>
          {avatarPicker && <div className="avatar-picker-backdrop" onClick={() => setAvatarPicker(false)} />}
          {avatarPicker && (
            <div className="avatar-picker" onMouseDown={(e) => e.stopPropagation()}>
              <div className="avatar-picker-emojis">
                {PLAN_EMOJIS.map((e) => (
                  <button key={e} className={`ap-emoji ${plan.avatarEmoji === e && !avatarUrl ? 'on' : ''}`} onClick={() => pickEmoji(e)}>{e}</button>
                ))}
              </div>
              <input className="input ap-input" value={emojiInput} placeholder="Type or paste an emoji…"
                onChange={(ev) => setEmojiInput(ev.target.value)}
                onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); pickEmoji(emojiInput); } }} />
              <div className="ap-actions">
                <button className="btn btn-sm" onClick={() => { setAvatarPicker(false); onUpload('avatar'); }}><UploadCloud size={14} /> Upload…</button>
                <button className="btn btn-sm" onClick={() => { setAvatarPicker(false); onFromApp('avatar'); }}><Library size={14} /> From the app…</button>
                {(avatarUrl || plan.avatarEmoji) && <button className="btn btn-sm btn-ghost" onClick={removeAvatar}>Remove</button>}
              </div>
            </div>
          )}
        </div>
        <h1 className="plan-name">{plan.name}</h1>
      </div>
    </>
  );
}
