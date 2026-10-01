import { Fragment, useEffect, useRef, useState } from 'react';
import { Check, Minus, Image as ImageIcon } from 'lucide-react';
import { THEMES, DEFAULT_ACCENT, accentLines, showsChrome } from '../../lib/slides.js';
import { hexToRgb, rgbToCmyk } from '../../lib/color.js';

// The slides themselves: drawn at 1920 × 1080 (see styles/presentation.css)
// and scaled to wherever they're shown — the editor, the strip of thumbnails,
// fullscreen, the PDF. Every text and picture names the field it comes from
// (`data-field`), so a click on it in the editor finds that field.

const W = 1920;
const H = 1080;
const pad2 = (n) => String(n).padStart(2, '0');
// A deck's pictures (a template's live elsewhere: `base`).
export const deckFileUrl = (deck, file) => (deck && file ? `${deck.base || `/data/presentation/${deck.id}`}/${file}` : null);

/** The deck's look as CSS variables on a slide. */
export function themeVars(deck) {
  const t = THEMES[deck?.theme?.preset] || THEMES.dark;
  const accent = deck?.theme?.accent || DEFAULT_ACCENT;
  const rgb = hexToRgb(accent) || { r: 0, g: 117, b: 136 };
  return {
    '--pz-bg': t.bg, '--pz-band': t.band, '--pz-surface': t.surface, '--pz-line': t.line, '--pz-text': t.text, '--pz-soft': t.soft,
    '--pz-muted': t.muted, '--pz-faint': t.faint, '--pz-accent': accent, '--pz-accent-rgb': `${rgb.r}, ${rgb.g}, ${rgb.b}`,
  };
}

/** Text with *accent* words and its line breaks. */
export function Rich({ text, as: Tag = 'div', className, field }) {
  const lines = accentLines(text);
  if (!String(text || '').trim()) return null;
  return (
    <Tag className={className} data-field={field}>
      {lines.map((parts, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {parts.map((p, j) => (p.accent ? <span key={j} className="pz-accent">{p.text}</span> : <Fragment key={j}>{p.text}</Fragment>))}
        </Fragment>
      ))}
    </Tag>
  );
}

/** A picture (cover-cropped around its centre point), or an empty frame in the accent colour. */
function Pic({ deck, img, className = '', field, editing, contain }) {
  const src = deckFileUrl(deck, img?.file);
  return (
    <div className={`pz-pic ${src ? '' : 'empty'} ${className}`} data-field={field}>
      {src ? <img src={src} alt="" draggable={false} style={{ objectFit: contain || img.fit === 'contain' ? 'contain' : 'cover', objectPosition: `${img.x ?? 50}% ${img.y ?? 50}%` }} />
        : editing ? <span className="pz-pic-hint"><ImageIcon size={56} strokeWidth={1.4} /></span> : null}
    </div>
  );
}

/** The small sign in the corner: the deck's mark, else the first letter of its name in a ring. */
function Mark({ deck, className = 'pz-mark' }) {
  const src = deckFileUrl(deck, deck?.brand?.mark);
  if (src) return <img className={className} src={src} alt="" draggable={false} />;
  const letter = (deck?.brand?.name || deck?.title || '·').trim().charAt(0).toUpperCase();
  return <span className={`${className} pz-mark-letter`}>{letter}</span>;
}
/** The logo (a wordmark picture), else the mark and the name. */
function Logo({ deck }) {
  const src = deckFileUrl(deck, deck?.brand?.logo);
  if (src) return <img className="pz-logo-img" src={src} alt="" draggable={false} data-field="@brand" />;
  return (
    <div className="pz-logo" data-field="@brand">
      <Mark deck={deck} className="pz-logo-mark" />
      {deck?.brand?.name && <span>{deck.brand.name}</span>}
    </div>
  );
}
const Contact = ({ deck, className }) => {
  const lines = (deck?.brand?.lines || []).filter((l) => l.trim());
  return lines.length ? <div className={className} data-field="@brand">{lines.map((l, i) => <div key={i}>{l}</div>)}</div> : null;
};
// ✓ and — in a table cell become marks.
const Cell = ({ v }) => (/^(✓|✔|x|yes|ja)$/i.test(v.trim()) ? <Check className="pz-yes" size={30} strokeWidth={2.6} />
  : /^(—|–|-|no|nein)$/i.test(v.trim()) ? <Minus className="pz-no" size={30} strokeWidth={2.6} /> : v);

const cols = (n) => (n <= 3 ? n : n === 4 ? 2 : 3);

function Body({ deck, slide, editing }) {
  const d = slide.data || {};
  const P = (props) => <Pic deck={deck} editing={editing} {...props} />;
  switch (slide.type) {
    case 'cover': {
      const m = deck?.meta || {};
      const metaRows = [['Prepared for', m.preparedFor], ['Prepared by', m.preparedBy], ['Document', [m.version, m.date && new Date(`${m.date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })].filter(Boolean).join(' ')]].filter(([, v]) => v);
      return (
        <>
          <div className="pz-cover-top">
            {d.image ? <P img={d.image} className="pz-cover-pic" field="image" /> : <div className="pz-cover-glow" data-field="image" />}
            <div className="pz-cover-fade" />
            <div className="pz-cover-logo"><Logo deck={deck} /></div>
            {d.showContact && <Contact deck={deck} className="pz-cover-contact pz-mono" />}
          </div>
          <div className="pz-cover-band">
            <Rich className="pz-cover-title" text={d.title} field="title" />
            {metaRows.length > 0 && (
              <div className="pz-cover-meta pz-mono" data-field="@meta">
                {metaRows.map(([k, v]) => <Fragment key={k}><span>{k.toUpperCase()}:</span><b>{v}</b></Fragment>)}
              </div>
            )}
          </div>
        </>
      );
    }
    case 'intro':
    case 'textImage': {
      const flip = slide.type === 'textImage' && d.flip;
      return (
        <div className={`pz-split ${flip ? 'flip' : ''}`}>
          {slide.type === 'intro' && deck?.brand?.mark && <img className="pz-watermark" src={deckFileUrl(deck, deck.brand.mark)} alt="" draggable={false} />}
          <div className="pz-split-text">
            <Rich className="pz-h" text={d.title} field="title" />
            <Rich className={slide.type === 'intro' ? 'pz-lead' : 'pz-text'} text={d.text} field="text" />
          </div>
          <div className="pz-frame pz-split-pic"><P img={d.image} field="image" /></div>
        </div>
      );
    }
    case 'works': {
      const list = (d.items || []).slice(0, 4);
      const n = list.length + (d.closing?.trim() ? 1 : 0);
      return (
        <div className="pz-stack">
          <Rich className="pz-h" text={d.title} field="title" />
          <div className="pz-row" style={{ '--n': Math.max(1, n) }}>
            {list.map((it, i) => (
              <div key={it.id || i} className="pz-frame pz-work">
                <P img={it.image} field={`items.${i}.image`} />
                {it.caption && <span className="pz-work-cap pz-mono" data-field={`items.${i}.caption`}>{it.caption}</span>}
              </div>
            ))}
            {d.closing?.trim() && <div className="pz-frame pz-work pz-work-text"><Rich className="pz-work-q" text={d.closing} field="closing" /></div>}
          </div>
        </div>
      );
    }
    case 'cards': {
      const list = (d.items || []).slice(0, 6);
      const compact = d.style === 'compact';
      return (
        <div className="pz-stack">
          <Rich className="pz-h" text={d.title} field="title" />
          <div className={`pz-grid ${compact ? 'compact' : 'big'} ${list.length > 3 ? 'two-rows' : ''}`} style={{ '--c': cols(list.length) }}>
            {list.map((it, i) => (
              <div key={it.id || i} className="pz-card" data-field={`items.${i}.title`}>
                {compact ? (
                  <div className="pz-card-mono pz-mono">{pad2(i + 1)} - {it.title?.replace(/\*/g, '')}</div>
                ) : (
                  <>
                    <div className="pz-card-num pz-mono">{pad2(i + 1)}</div>
                    <Rich className="pz-card-title" text={it.title} />
                  </>
                )}
                <Rich className="pz-card-text" text={it.text} field={`items.${i}.text`} />
              </div>
            ))}
          </div>
        </div>
      );
    }
    case 'phases': {
      const list = (d.items || []).slice(0, 6);
      return (
        <div className="pz-stack">
          <Rich className="pz-h" text={d.title} field="title" />
          <div className="pz-row pz-phases" style={{ '--n': Math.max(1, list.length) }}>
            {list.map((it, i) => (
              <div key={it.id || i} className="pz-card pz-phase" data-field={`items.${i}.title`}>
                <div className="pz-phase-in">
                  <Rich className="pz-phase-title pz-mono" text={it.title} />
                  <Rich className="pz-phase-text" text={it.text} field={`items.${i}.text`} />
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case 'caseCover':
      return (
        <div className="pz-case">
          <div className="pz-case-text">
            <Rich className="pz-h" text={d.title} field="title" />
            <Rich className="pz-lead" text={d.text} field="text" />
          </div>
          <div className="pz-frame pz-case-pic"><P img={d.image} field="image" /></div>
          {(d.facts || []).length > 0 && (
            <div className="pz-facts" data-field="facts.0.label">
              {d.facts.slice(0, 5).map((x, i) => (
                <div key={x.id || i}><span className="pz-mono pz-accent">{x.label}</span><b>{x.value}</b></div>
              ))}
            </div>
          )}
        </div>
      );
    case 'caseGallery': {
      const pics = (d.images || []).slice(0, 3);
      return (
        <div className={`pz-gallery ${d.flip ? 'flip' : ''} n${pics.length}`}>
          <div className="pz-gallery-text">
            <Rich className="pz-h" text={d.title} field="title" />
            <Rich className="pz-text" text={d.text} field="text" />
          </div>
          {pics.map((p, i) => <div key={p.id || i} className={`pz-frame pz-g${i}`}><P img={p.image} field={`images.${i}.image`} /></div>)}
        </div>
      );
    }
    case 'quote':
      return (
        <div className="pz-quote">
          <div className="pz-frame pz-quote-pic"><P img={d.image} field="image" /></div>
          <div className="pz-quote-text">
            {d.label && <div className="pz-mono pz-accent pz-quote-label" data-field="label">{d.label}</div>}
            <Rich className="pz-quote-q" text={d.quote} field="quote" />
            {d.name && <div className="pz-quote-name" data-field="name">{d.name}</div>}
            {d.role && <div className="pz-mono pz-quote-role" data-field="role">{d.role}</div>}
          </div>
        </div>
      );
    case 'pricing': {
      const list = (d.items || []).slice(0, 6);
      return (
        <div className="pz-stack pz-pricing">
          <Rich className="pz-h" text={d.title} field="title" />
          <div className={`pz-grid ${list.length > 3 ? 'two-rows' : ''}`} style={{ '--c': cols(list.length) }}>
            {list.map((it, i) => {
              const bullets = String(it.bullets || '').split('\n').map((b) => b.trim()).filter(Boolean);
              return (
                <div key={it.id || i} className={`pz-card pz-price ${it.featured ? 'featured' : ''}`} data-field={`items.${i}.name`}>
                  {it.featured && <span className="pz-badge">RECOMMENDED</span>}
                  <div className="pz-price-name">{it.name}</div>
                  {d.priceLabel && <div className="pz-mono pz-accent pz-price-label">{d.priceLabel}</div>}
                  <div className="pz-price-v">{it.price}</div>
                  <Rich className="pz-price-text" text={it.text} />
                  {bullets.length > 0 && <ul className="pz-bullets">{bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>}
                </div>
              );
            })}
          </div>
          {d.note && <div className="pz-note pz-mono" data-field="note">{d.note}</div>}
        </div>
      );
    }
    case 'table': {
      const t = d.table || { columns: [], rows: [] };
      const rowH = Math.max(36, Math.min(64, Math.floor(640 / Math.max(1, t.rows.length + 1))));
      return (
        <div className="pz-stack">
          <Rich className="pz-h" text={d.title} field="title" />
          <table className="pz-table" data-field="table" style={{ '--rh': `${rowH}px` }}>
            <thead><tr>{t.columns.map((c, i) => <th key={i} className={`pz-mono ${i && i === t.highlight ? 'hl' : ''}`}>{c}</th>)}</tr></thead>
            <tbody>{t.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={j && j === t.highlight ? 'hl' : ''}><Cell v={c} /></td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    }
    case 'palette': {
      const list = (d.colors || []).slice(0, 8);
      return (
        <div className="pz-stack">
          <Rich className="pz-h" text={d.title} field="title" />
          <div className="pz-row pz-swatches" style={{ '--n': Math.max(1, list.length) }}>
            {list.map((c, i) => {
              const rgb = hexToRgb(c.hex) || { r: 0, g: 0, b: 0 };
              const k = rgbToCmyk(rgb);
              return (
                <div key={c.id || i} className="pz-card pz-swatch" data-field={`colors.${i}.name`}>
                  <div className="pz-swatch-color" style={{ background: c.hex }} />
                  <div className="pz-swatch-name">{c.name}</div>
                  <div className="pz-mono pz-swatch-codes">
                    <div>{String(c.hex).toUpperCase()}</div>
                    <div>RGB {rgb.r} {rgb.g} {rgb.b}</div>
                    <div>CMYK {k.c} {k.m} {k.y} {k.k}</div>
                  </div>
                  {c.text && <div className="pz-swatch-use">{c.text}</div>}
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    case 'type': {
      const list = (d.fonts || []).slice(0, 3);
      return (
        <div className="pz-stack">
          <Rich className="pz-h" text={d.title} field="title" />
          <div className="pz-row" style={{ '--n': Math.max(1, list.length) }}>
            {list.map((t, i) => (
              <div key={t.id || i} className="pz-card pz-font" style={{ fontFamily: t.family ? `'${t.family.replace(/'/g, '')}', 'DM Sans', sans-serif` : undefined }} data-field={`fonts.${i}.name`}>
                <div className="pz-font-aa">Aa</div>
                <div className="pz-font-name">{t.name}</div>
                {t.role && <div className="pz-mono pz-accent pz-font-role">{t.role}</div>}
                {t.weights && <div className="pz-font-weights">{t.weights}</div>}
                {t.sample && <div className="pz-font-sample">{t.sample}</div>}
              </div>
            ))}
          </div>
        </div>
      );
    }
    case 'logo': {
      const list = (d.panels || []).slice(0, 3);
      return (
        <div className="pz-stack">
          <div className="pz-logo-head">
            <Rich className="pz-h" text={d.title} field="title" />
            <Rich className="pz-text" text={d.text} field="text" />
          </div>
          <div className="pz-row pz-logos" style={{ '--n': Math.max(1, list.length) }}>
            {list.map((p, i) => (
              <div key={p.id || i} className={`pz-frame pz-logo-panel bg-${p.bg}`}><P img={p.image} contain field={`panels.${i}.image`} /></div>
            ))}
          </div>
        </div>
      );
    }
    case 'image':
      return (
        <div className="pz-full">
          <P img={d.image} contain={d.fit === 'contain'} field="image" />
          {d.caption && <div className="pz-full-cap pz-mono" data-field="caption">{d.caption}</div>}
        </div>
      );
    case 'section':
      return (
        <div className="pz-section">
          {d.number && <div className="pz-section-num pz-mono" data-field="number">{d.number}</div>}
          <Rich className="pz-section-title" text={d.title} field="title" />
          <Rich className="pz-lead" text={d.text} field="text" />
        </div>
      );
    case 'closing':
      return (
        <div className="pz-closing">
          <Rich className="pz-closing-title" text={d.title} field="title" />
          <Rich className="pz-lead" text={d.text} field="text" />
          {d.showContact && <Contact deck={deck} className="pz-closing-contact pz-mono" />}
        </div>
      );
    default:
      return null;
  }
}

/** One slide at full size (1920 × 1080): the deck's header and footer around what it holds. */
export function Slide({ deck, slide, index = 0, total = 1, editing = false }) {
  if (!slide) return null;
  const chrome = showsChrome(slide.type);
  return (
    <div className={`pz-slide pz-t-${slide.type} ${THEMES[deck?.theme?.preset] ? deck.theme.preset : 'dark'}`} style={themeVars(deck)}>
      <Body deck={deck} slide={slide} editing={editing} />
      {chrome && (
        <>
          <Mark deck={deck} className="pz-corner" />
          {deck?.label && <div className="pz-top-label pz-mono">{deck.label}</div>}
          <div className="pz-page pz-mono">{pad2(index + 1)}/{pad2(total)}</div>
          {slide.section && <div className="pz-section-label pz-mono" data-field="@section">{slide.section}</div>}
        </>
      )}
    </div>
  );
}

/** A slide scaled to its box's width (16:9). */
export function SlideView({ className = '', ...props }) {
  const box = useRef(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const fit = () => setScale(el.clientWidth / W);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className={`pz-view ${className}`}>
      {scale > 0 && <div className="pz-scale" style={{ transform: `scale(${scale})` }}><Slide {...props} /></div>}
    </div>
  );
}
export const SLIDE_W = W;
export const SLIDE_H = H;
