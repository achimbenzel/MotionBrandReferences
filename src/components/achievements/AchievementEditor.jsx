import { useEffect, useRef, useState } from 'react';
import { X, UploadCloud, Library, Trash2, Lightbulb, CalendarCheck, Type, Shapes, ImageIcon } from 'lucide-react';
import { api, achievementFileUrl } from '../../lib/api.js';
import { isTouch } from '../../lib/useMedia.js';
import { RARITIES, RARITY_ORDER, METRICS, fmtValue } from '../../lib/achievements.js';
import { dayKey } from '../../lib/content.js';
import { useToast } from '../Toast.jsx';
import { useFromApp } from '../FromApp.jsx';
import AchievementCard, { SYMBOLS } from './AchievementCard.jsx';

const blank = (group = '') => ({
  title: '', description: '', group, rarity: 'bronze', icon: { type: 'symbol', text: '', symbol: 'trophy' }, metric: null, target: null, achievedAt: '',
});
const fields = (a) => ({
  title: a.title, description: a.description, group: a.group, rarity: a.rarity, icon: { ...a.icon }, metric: a.metric, target: a.target, achievedAt: a.achievedAt,
});

/**
 * Add or change an achievement, with the card as it will look: name, what it
 * takes, group, rarity (worth XP), the badge (text, a symbol or a picture), a
 * sticker, a number that unlocks it by itself — and when it was reached.
 */
export default function AchievementEditor({ a, group = '', groups, metrics, ideas = [], existing = [], onClose, onSaved, onDelete }) {
  const toast = useToast();
  const [picker, pick] = useFromApp();
  const [f, setF] = useState(() => (a ? fields(a) : blank(group)));
  const [pics, setPics] = useState({ icon: null, sticker: null }); // null = as is, 'remove', or { file | source, url }
  const [busy, setBusy] = useState(false);
  const fileRefs = { icon: useRef(null), sticker: useRef(null) };
  const urls = useRef([]);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const setIcon = (patch) => setF((x) => ({ ...x, icon: { ...x.icon, ...patch } }));

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose();
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const picUrl = (slot) => {
    const p = pics[slot];
    if (p === 'remove') return null;
    if (p) return p.url;
    return a ? achievementFileUrl(a, slot === 'icon' ? a.iconImage : a.sticker) : null;
  };
  const setFile = (slot, file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    urls.current.push(url);
    setPics((p) => ({ ...p, [slot]: { file, url } }));
    if (slot === 'icon') setIcon({ type: 'image' });
  };
  const fromApp = async (slot) => {
    const got = await pick({ accept: 'image', title: slot === 'icon' ? 'Badge picture from the app' : 'Sticker from the app' });
    if (!got) return;
    setPics((p) => ({ ...p, [slot]: { source: got.source, url: got.url } }));
    if (slot === 'icon') setIcon({ type: 'image' });
  };
  const clearPic = (slot) => {
    setPics((p) => ({ ...p, [slot]: a && (slot === 'icon' ? a.iconImage : a.sticker) ? 'remove' : null }));
    if (slot === 'icon' && f.icon.type === 'image') setIcon({ type: f.icon.symbol ? 'symbol' : 'text' });
  };

  const save = async () => {
    if (busy) return;
    if (!f.title.trim()) { toast('Give it a name', 'error'); return; }
    setBusy(true);
    try {
      const iconPic = !!picUrl('icon');
      const body = {
        ...f, title: f.title.trim(), group: f.group.trim(),
        icon: { ...f.icon, type: f.icon.type === 'image' && !iconPic ? (f.icon.symbol ? 'symbol' : 'text') : f.icon.type },
        target: f.metric && Number(f.target) > 0 ? Number(f.target) : null,
      };
      const res = a ? await api.updateAchievement(a.id, body) : await api.createAchievement(body);
      const id = res.achievement.id;
      for (const slot of ['icon', 'sticker']) {
        const p = pics[slot];
        if (p === 'remove') await api.removeAchievementImage(id, slot);
        else if (p) await api.setAchievementImage(id, slot, p.file || { source: p.source });
      }
      // Ticked off just now (not a milestone from years ago): that's a moment too.
      const recent = dayKey(new Date(Date.now() - 7 * 864e5));
      const reachedNow = !!f.achievedAt && !a?.achievedAt && f.achievedAt >= recent;
      onSaved([...(res.unlocked || []), ...(reachedNow ? [id] : [])], id);
    } catch (e) { toast(`Could not save: ${e.message}`, 'error'); setBusy(false); }
  };

  const preview = { ...(a || {}), ...f, id: a?.id || 'new', iconImage: a?.iconImage, sticker: a?.sticker, achievedAt: f.achievedAt };
  const now = f.metric ? metrics?.[f.metric] || 0 : null;
  const reached = f.metric && Number(f.target) > 0 && now >= Number(f.target);
  const have = new Set(existing.map((x) => `${x.title}\n${x.description}`));
  const freshIdeas = a ? [] : ideas.filter((i) => !have.has(`${i.title}\n${i.description}`));
  const takeIdea = (i) => {
    setF({ ...blank(i.group), title: i.title, description: i.description, rarity: i.rarity, icon: { ...blank().icon, ...i.icon } });
    setPics({ icon: null, sticker: null });
  };

  const picRow = (slot) => {
    const url = picUrl(slot);
    return (
      <div className="ach-pic-row">
        {url && <img className={`ach-pic-thumb ${slot}`} src={url} alt="" />}
        <button type="button" className="btn btn-sm" onClick={() => fileRefs[slot].current?.click()}><UploadCloud size={14} /> Upload</button>
        <button type="button" className="btn btn-sm" onClick={() => fromApp(slot)}><Library size={14} /> From the app</button>
        {url && <button type="button" className="btn btn-sm btn-ghost" onClick={() => clearPic(slot)}><X size={14} /> Remove</button>}
        <input ref={fileRefs[slot]} type="file" accept="image/*" hidden onChange={(e) => { setFile(slot, e.target.files?.[0]); e.target.value = ''; }} />
      </div>
    );
  };

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal ach-editor" role="dialog" aria-modal="true" aria-label={a ? 'Edit achievement' : 'New achievement'}>
        <div className="modal-head">
          <h2>{a ? 'Edit achievement' : 'New achievement'}</h2>
          <button type="button" className="icon-btn" onClick={onClose} disabled={busy} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body ach-editor-body">
          <div className="ach-editor-preview">
            <AchievementCard a={preview} metrics={metrics} as="div" iconUrl={picUrl('icon')} stickerUrl={picUrl('sticker')} />
            <div className="ach-editor-xp">{RARITIES[f.rarity].label} · <b>{RARITIES[f.rarity].xp} XP</b></div>
          </div>
          <div className="ach-editor-form">
            {freshIdeas.length > 0 && (
              <div className="ach-ideas">
                <div className="ach-ideas-head"><Lightbulb size={13} /> Quests that fit your work</div>
                <div className="ach-ideas-list">
                  {freshIdeas.map((i) => <button key={`${i.title}${i.description}`} type="button" className="chip" onClick={() => takeIdea(i)} title={i.description}>{i.title}</button>)}
                </div>
              </div>
            )}
            <div className="field">
              <label htmlFor="ach-title">Name</label>
              <input id="ach-title" className="input" value={f.title} maxLength={120} autoFocus={!a && !isTouch()} placeholder="e.g. Der erste 10K-Deal" onChange={(e) => set({ title: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="ach-desc">What it takes</label>
              <textarea id="ach-desc" className="textarea" rows={2} maxLength={600} value={f.description} placeholder="e.g. Einen Deal über 10.000 € abgeschlossen." onChange={(e) => set({ description: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="ach-group">Group</label>
              <input id="ach-group" className="input" list="ach-groups" value={f.group} maxLength={60} placeholder="e.g. Umsatz, Instagram, Special Quests" onChange={(e) => set({ group: e.target.value })} />
              <datalist id="ach-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
            </div>

            <div className="field">
              <label>Rarity</label>
              <div className="ach-rarities" role="radiogroup" aria-label="Rarity">
                {RARITY_ORDER.map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={f.rarity === k} className={`ach-rarity-pick r-${k} ${f.rarity === k ? 'on' : ''}`} style={{ '--rc': RARITIES[k].color }} onClick={() => set({ rarity: k })}>
                    <i /> <span>{RARITIES[k].label}</span> <small>{RARITIES[k].xp} XP</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Badge</label>
              <div className="segmented segmented-sm ach-icon-type" role="group" aria-label="Badge">
                <button type="button" className={f.icon.type === 'text' ? 'on' : ''} onClick={() => setIcon({ type: 'text' })}><Type size={13} /> Text</button>
                <button type="button" className={f.icon.type === 'symbol' ? 'on' : ''} onClick={() => setIcon({ type: 'symbol', symbol: f.icon.symbol || 'trophy' })}><Shapes size={13} /> Symbol</button>
                <button type="button" className={f.icon.type === 'image' ? 'on' : ''} onClick={() => setIcon({ type: 'image' })}><ImageIcon size={13} /> Picture</button>
              </div>
              {f.icon.type === 'text' && (
                <input className="input ach-icon-text" value={f.icon.text} maxLength={8} placeholder="10K, 500€, #1 …" onChange={(e) => setIcon({ text: e.target.value })} aria-label="Badge text" />
              )}
              {f.icon.type === 'symbol' && (
                <div className="ach-symbols">
                  {Object.entries(SYMBOLS).map(([k, S]) => (
                    <button key={k} type="button" className={`ach-symbol ${f.icon.symbol === k ? 'on' : ''}`} onClick={() => setIcon({ symbol: k })} aria-label={k} title={k}><S size={18} /></button>
                  ))}
                </div>
              )}
              {f.icon.type === 'image' && picRow('icon')}
            </div>

            <div className="field">
              <label>Sticker <span className="ach-opt">— optional, e.g. an event’s or a client’s logo on the card</span></label>
              {picRow('sticker')}
            </div>

            <div className="field">
              <label htmlFor="ach-metric">Unlocks by itself</label>
              <div className="ach-metric-row">
                <select id="ach-metric" className="input" value={f.metric || ''} onChange={(e) => set({ metric: e.target.value || null })}>
                  <option value="">No — I tick it off myself</option>
                  {Object.entries(METRICS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                </select>
                {f.metric && (
                  <label className="ach-target"><span>at</span>
                    <input className="input" type="number" min="1" value={f.target ?? ''} placeholder="10000" onChange={(e) => set({ target: e.target.value === '' ? null : Number(e.target.value) })} aria-label="Target" />
                    {METRICS[f.metric].unit && <span>{METRICS[f.metric].unit}</span>}
                  </label>
                )}
              </div>
              {f.metric && <div className="hint">Now: {fmtValue(f.metric, now)}{METRICS[f.metric].follower ? ' — update your followers under “Your numbers”' : ''}.</div>}
              {reached && !f.achievedAt && <div className="hint ach-reached-hint">Already reached — it unlocks today when you save. Set the day you got there, if you know it.</div>}
            </div>

            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="ach-date">Reached on</label>
              <div className="ach-date-row">
                <input id="ach-date" className="input" type="date" value={f.achievedAt} max={dayKey()} onChange={(e) => set({ achievedAt: e.target.value })} />
                <button type="button" className="btn btn-sm" onClick={() => set({ achievedAt: dayKey() })}><CalendarCheck size={14} /> Today</button>
                {f.achievedAt && <button type="button" className="btn btn-sm btn-ghost" onClick={() => set({ achievedAt: '' })}>Not yet</button>}
              </div>
            </div>
          </div>
        </div>
        <div className="modal-foot">
          {a && <button type="button" className="btn btn-danger" onClick={() => onDelete(a)} disabled={busy} style={{ marginRight: 'auto' }}><Trash2 size={15} /> Delete</button>}
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy || !f.title.trim()}>{busy ? 'Saving…' : a ? 'Save' : 'Add achievement'}</button>
        </div>
      </div>
      {picker}
    </div>
  );
}
