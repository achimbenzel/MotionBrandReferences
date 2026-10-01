import { Plus, Trash2, Sparkles } from 'lucide-react';
import { THEMES, DECK_KINDS } from '../../lib/slides.js';
import { ImageField } from './SlideFields.jsx';

const SWATCHES = ['#007588', '#2ec5d3', '#e4572e', '#f2a541', '#8e7dbe', '#3fa34d', '#d64191', '#f0eee8'];

/**
 * The whole deck: its name, kind, client and project, the label on every
 * slide, the look (dark / light, accent colour), who it's from (logo, mark,
 * name, contact) and what the cover says (prepared for / by, version, date).
 */
export default function DeckPanel({ deck, clients, plans, onDeck, onUpload, onDefaults, busy }) {
  const brand = deck.brand || { lines: [] };
  const meta = deck.meta || {};
  const setBrand = (p) => onDeck({ brand: { ...brand, ...p } });
  const setMeta = (p) => onDeck({ meta: { ...meta, ...p } });
  const lines = brand.lines?.length ? brand.lines : [''];
  return (
    <div className="pzf">
      <div className="pzf-row"><span className="pzf-label">Name</span><input className="input" value={deck.title} onChange={(e) => onDeck({ title: e.target.value })} aria-label="Name" /></div>
      <div className="pzf-row"><span className="pzf-label">Kind</span>
        <div className="segmented segmented-sm pzf-seg" role="group" aria-label="Kind">
          {DECK_KINDS.map((k) => <button key={k.key} type="button" className={deck.kind === k.key ? 'on' : ''} onClick={() => onDeck({ kind: k.key })}>{k.label}</button>)}
        </div>
      </div>
      <div className="pzf-two">
        <label className="pzf-row"><span className="pzf-label">Client</span>
          <select className="input" value={deck.clientId || ''} onChange={(e) => {
            const c = clients.find((x) => x.id === e.target.value);
            onDeck({ clientId: e.target.value, ...(c && !meta.preparedFor ? { meta: { ...meta, preparedFor: c.name } } : {}) });
          }}>
            <option value="">—</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="pzf-row"><span className="pzf-label">Project</span>
          <select className="input" value={deck.planId || ''} onChange={(e) => onDeck({ planId: e.target.value })}>
            <option value="">—</option>
            {plans.filter((p) => !deck.clientId || !p.clientId || p.clientId === deck.clientId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>
      <div className="pzf-row"><span className="pzf-label">Label on every slide (top right)</span><input className="input" value={deck.label} onChange={(e) => onDeck({ label: e.target.value.toUpperCase() })} placeholder="PROJECT PROPOSAL" aria-label="Label on every slide" /></div>

      <h3 className="pzf-h">Look</h3>
      <div className="pzf-row"><span className="pzf-label">Background</span>
        <div className="segmented segmented-sm pzf-seg" role="group" aria-label="Background">
          {Object.entries(THEMES).map(([k, t]) => <button key={k} type="button" className={deck.theme.preset === k ? 'on' : ''} onClick={() => onDeck({ theme: { ...deck.theme, preset: k } })}>{t.label}</button>)}
        </div>
      </div>
      <div className="pzf-row"><span className="pzf-label">Accent colour</span>
        <div className="pzf-swatches">
          {SWATCHES.map((c) => <button key={c} type="button" className={`pzf-swatch ${deck.theme.accent === c ? 'on' : ''}`} style={{ background: c }} onClick={() => onDeck({ theme: { ...deck.theme, accent: c } })} aria-label={c} title={c} />)}
          <span className="pzf-color"><input type="color" value={deck.theme.accent} onChange={(e) => onDeck({ theme: { ...deck.theme, accent: e.target.value } })} aria-label="Own accent colour" /></span>
        </div>
      </div>

      <h3 className="pzf-h">From</h3>
      <div className="pzf-row"><span className="pzf-label">Your name (or studio)</span><input className="input" value={brand.name} data-path="@brand" onChange={(e) => setBrand({ name: e.target.value })} aria-label="Your name" /></div>
      <div className="pzf-row"><span className="pzf-label">Logo <em>a wordmark, on the cover</em></span>
        <ImageField deck={deck} value={brand.logo ? { file: brand.logo } : null} path="@logo" label="Logo" busy={busy}
          onChange={(v) => setBrand({ logo: v?.file || null })} onUpload={(pic) => onUpload(pic, '@brand.logo')} />
      </div>
      <div className="pzf-row"><span className="pzf-label">Mark <em>the small sign in each slide’s corner</em></span>
        <ImageField deck={deck} value={brand.mark ? { file: brand.mark } : null} path="@mark" label="Mark" busy={busy}
          onChange={(v) => setBrand({ mark: v?.file || null })} onUpload={(pic) => onUpload(pic, '@brand.mark')} />
      </div>
      <div className="pzf-row"><span className="pzf-label">Contact lines <em>cover and closing</em></span>
        <div className="pzf-lines">
          {lines.map((l, i) => (
            <span key={i} className="pzf-line">
              <input className="input" value={l} placeholder={['Design by …', 'Phone', 'Email', 'Website'][i] || ''} onChange={(e) => setBrand({ lines: lines.map((x, j) => (j === i ? e.target.value : x)) })} aria-label={`Contact line ${i + 1}`} />
              <button type="button" className="icon-btn" onClick={() => setBrand({ lines: lines.filter((_, j) => j !== i) })} aria-label="Remove the line"><Trash2 size={14} /></button>
            </span>
          ))}
          {lines.length < 6 && <button type="button" className="btn btn-sm btn-ghost pzf-add" onClick={() => setBrand({ lines: [...lines, ''] })}><Plus size={14} /> Add a line</button>}
        </div>
      </div>

      <h3 className="pzf-h">Cover</h3>
      <div className="pzf-two">
        <label className="pzf-row" data-path="@meta"><span className="pzf-label">Prepared for</span><input className="input" value={meta.preparedFor} onChange={(e) => setMeta({ preparedFor: e.target.value })} /></label>
        <label className="pzf-row"><span className="pzf-label">Prepared by</span><input className="input" value={meta.preparedBy} onChange={(e) => setMeta({ preparedBy: e.target.value })} /></label>
        <label className="pzf-row"><span className="pzf-label">Version</span><input className="input" value={meta.version} onChange={(e) => setMeta({ version: e.target.value })} placeholder="v1.0" /></label>
        <label className="pzf-row"><span className="pzf-label">Date</span><input className="input" type="date" value={meta.date} onChange={(e) => setMeta({ date: e.target.value })} /></label>
      </div>
      <button type="button" className="btn btn-sm pzf-defaults" onClick={onDefaults}><Sparkles size={14} /> Use this look and these details for new presentations</button>
    </div>
  );
}
