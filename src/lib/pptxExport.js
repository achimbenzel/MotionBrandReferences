// A presentation as a PowerPoint file — rebuilt from its slides as the browser
// draws them (1920 × 1080), so every kind of slide comes out the way it looks
// here, and stays editable in PowerPoint / Keynote / Google Slides:
// - text as real text boxes, line by line where the browser broke the lines,
//   accent words as coloured runs, in DM Sans / JetBrains Mono;
// - cards, frames, bands and lines as shapes (rounded, filled, outlined);
// - pictures cropped the way they're shown (and their rounded corners);
// - gradients (the cover's glow, a recommended package) and icons as pictures.
// The fonts aren't embedded: with DM Sans and JetBrains Mono installed (free,
// Google Fonts; Google Slides has both) it looks like here, the headlines bold
// rather than extra bold; without them, the app substitutes a font.

const PX = 1 / 144; // 1920 px = 13.333 in
const PT = 0.5;     // 1 px = 0.5 pt
const inch = (v) => Math.round(v * PX * 10000) / 10000;

function parseColor(c) {
  const m = /rgba?\(([^)]+)\)/.exec(c || '');
  if (!m) return null;
  const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  if (!(a > 0.01)) return null;
  const hex = [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  return { hex, transparency: Math.round((1 - a) * 100) };
}
const px = (v) => parseFloat(v) || 0;

// Font family + weight → the family and bold on/off: names like "DM Sans ExtraBold"
// only work where those exact static fonts are installed (Windows), the family
// with bold works in PowerPoint, Keynote, Google Slides and LibreOffice alike.
function fontOf(cs) {
  const fam = (cs.fontFamily.split(',')[0] || '').replace(/["']/g, '').trim() || 'DM Sans';
  return { face: fam, bold: (Number(cs.fontWeight) || 400) >= 600 };
}

/** A box's background, border and inset outline (the slides draw outlines as inset shadows). */
function boxLook(cs) {
  const fill = parseColor(cs.backgroundColor);
  const shadow = /(rgba?\([^)]+\))\s+0px\s+0px\s+0px\s+([\d.]+)px\s+inset/.exec(cs.boxShadow || '') || /inset\s+0px\s+0px\s+0px\s+([\d.]+)px\s+(rgba?\([^)]+\))/.exec(cs.boxShadow || '');
  let line = null;
  if (shadow) {
    const [color, width] = shadow[1].startsWith('rgb') ? [shadow[1], shadow[2]] : [shadow[2], shadow[1]];
    const c = parseColor(color);
    if (c) line = { color: c.hex, transparency: c.transparency, width: px(width) * PT };
  }
  const bw = px(cs.borderTopWidth);
  const sameBorder = bw > 0 && cs.borderTopStyle !== 'none' && ['Right', 'Bottom', 'Left'].every((s) => px(cs[`border${s}Width`]) === bw);
  if (sameBorder) {
    const c = parseColor(cs.borderTopColor);
    if (c) line = { color: c.hex, transparency: c.transparency, width: bw * PT };
  }
  const bottom = !sameBorder && px(cs.borderBottomWidth) > 0 && cs.borderBottomStyle !== 'none' ? parseColor(cs.borderBottomColor) : null;
  return { fill, line, bottom: bottom && { ...bottom, width: px(cs.borderBottomWidth) * PT }, gradient: /gradient\(/.test(cs.backgroundImage || '') && !/url\(/.test(cs.backgroundImage) };
}

const loadImage = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
function roundClip(ctx, w, h, r) {
  if (!r) return;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(0, 0, w, h, r); else ctx.rect(0, 0, w, h);
  ctx.clip();
}
/** A CSS background (gradients) drawn on its own — an SVG with the same box, painted to a picture. */
async function rasterBackground(cs, w, h) {
  const style = `width:${w}px;height:${h}px;background-color:${cs.backgroundColor};background-image:${cs.backgroundImage};border-radius:${cs.borderRadius};`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="${style.replace(/"/g, "'")}"></div></foreignObject></svg>`;
  const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  c.getContext('2d').drawImage(img, 0, 0);
  return c.toDataURL('image/png');
}
/** A picture cropped and placed as shown (object-fit / object-position), with the frame's rounded corners. */
function cropPicture(img, w, h, cs, radius) {
  const iw = img.naturalWidth || 1; const ih = img.naturalHeight || 1;
  const k = Math.max(1, Math.min(2, Math.max(iw / w, ih / h))); // sharp enough, not huge
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  const ctx = c.getContext('2d');
  ctx.scale(k, k);
  roundClip(ctx, w, h, radius);
  const contain = cs.objectFit === 'contain';
  const s = contain ? Math.min(w / iw, h / ih) : Math.max(w / iw, h / ih);
  const dw = iw * s; const dh = ih * s;
  const [ox, oy] = (cs.objectPosition || '50% 50%').split(' ').map((v) => (v.endsWith('%') ? parseFloat(v) / 100 : 0.5));
  ctx.drawImage(img, (w - dw) * ox, (h - dh) * oy, dw, dh);
  return c.toDataURL('image/png');
}
/** An icon (an inline SVG) as a picture, in its colour. */
async function rasterIcon(svgEl, w, h, color) {
  const clone = svgEl.cloneNode(true);
  clone.setAttribute('width', w); clone.setAttribute('height', h);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const markup = clone.outerHTML.replace(/currentColor/g, color);
  const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`);
  const c = document.createElement('canvas');
  c.width = Math.round(w * 2); c.height = Math.round(h * 2);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

const INLINE = new Set(['inline', 'contents']);
// Text that sits right in this element (not in a block inside it): it becomes one text box.
function isTextBlock(el) {
  const cs = getComputedStyle(el);
  if (INLINE.has(cs.display)) return false;
  let text = false;
  for (const n of el.childNodes) {
    if (n.nodeType === Node.TEXT_NODE) { if (n.textContent.trim()) text = true; continue; }
    if (n.nodeType !== Node.ELEMENT_NODE) continue;
    if (n.tagName === 'BR') continue;
    if (n.namespaceURI === 'http://www.w3.org/2000/svg') return false;
    if (!INLINE.has(getComputedStyle(n).display)) return false;
    if (n.textContent.trim()) text = true;
  }
  return text;
}

/** The runs of a text block, with the line breaks the browser made: [{ text, options }] for pptxgenjs. */
function textRuns(block) {
  const runs = [];
  const upper = (cs, t) => (cs.textTransform === 'uppercase' ? t.toUpperCase() : t);
  const styleOf = (cs) => {
    const f = fontOf(cs);
    const c = parseColor(cs.color) || { hex: '000000', transparency: 0 };
    return { fontFace: f.face, bold: f.bold, italic: cs.fontStyle === 'italic', color: c.hex, transparency: c.transparency || undefined, fontSize: Math.round(px(cs.fontSize) * PT * 10) / 10 };
  };
  // A bullet drawn by CSS (::before) comes first.
  const before = getComputedStyle(block, '::before');
  if (before.content && before.content !== 'none' && before.content !== 'normal') {
    runs.push({ text: `${before.content.replace(/^["']|["']$/g, '')} `, options: styleOf(before) });
  }
  let lastTop = null;
  const range = document.createRange();
  const walk = (node) => {
    for (const n of node.childNodes) {
      if (n.nodeType === Node.ELEMENT_NODE) {
        if (n.tagName === 'BR') { if (runs.length) runs[runs.length - 1].options.breakLine = true; lastTop = null; continue; }
        if (n.namespaceURI !== 'http://www.w3.org/2000/svg') walk(n);
        continue;
      }
      if (n.nodeType !== Node.TEXT_NODE || !n.textContent) continue;
      const cs = getComputedStyle(n.parentElement);
      const style = styleOf(cs);
      const lh = px(cs.lineHeight) || px(cs.fontSize) * 1.2;
      const t = n.textContent;
      let cur = '';
      for (let i = 0; i < t.length; i += 1) {
        range.setStart(n, i); range.setEnd(n, i + 1);
        const r = range.getClientRects()[0];
        if (r && lastTop != null && r.top > lastTop + lh / 2 && t[i].trim()) {
          // The browser started a new line here.
          if (cur || runs.length) {
            runs.push({ text: upper(cs, cur.replace(/\s+$/, '')), options: { ...style, breakLine: true } });
            cur = '';
          }
        }
        if (r && t[i].trim()) lastTop = r.top;
        cur += t[i];
      }
      if (cur) runs.push({ text: upper(cs, cur.replace(/\s+/g, ' ')), options: style });
    }
  };
  walk(block);
  // White space before the first line goes, empty runs too; the last line ends the box.
  const out = runs
    .map((r, i) => (i === 0 ? { ...r, text: r.text.replace(/^\s+/, '') } : r))
    .filter((r) => r.text || r.options.breakLine);
  if (out.length) out[out.length - 1] = { ...out[out.length - 1], options: { ...out[out.length - 1].options, breakLine: false } };
  return out;
}

/** One slide element (.pz-slide at 1920 × 1080) onto a PowerPoint slide. */
async function addSlide(pptx, el) {
  const slide = pptx.addSlide();
  const base = el.getBoundingClientRect();
  const bg = parseColor(getComputedStyle(el).backgroundColor);
  if (bg) slide.background = { color: bg.hex };
  const box = (r) => ({ x: inch(r.left - base.left), y: inch(r.top - base.top), w: inch(r.width), h: inch(r.height) });
  const visible = (r) => r.width > 0.5 && r.height > 0.5 && r.right > base.left && r.left < base.right && r.bottom > base.top && r.top < base.bottom;
  const handled = new Set();
  const all = [el, ...el.querySelectorAll('*')];
  for (const node of all) {
    if ([...handled].some((h) => h !== node && h.contains(node))) continue;
    const cs = getComputedStyle(node);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.01) { handled.add(node); continue; }
    const r = node.getBoundingClientRect();
    if (!visible(r)) continue;
    const radius = Math.min(px(cs.borderTopLeftRadius), r.width / 2, r.height / 2);
    const round = cs.borderTopLeftRadius.endsWith('%') && parseFloat(cs.borderTopLeftRadius) >= 50;
    const opacity = Number(cs.opacity);

    // The box itself: a gradient as a picture, else a filled / outlined shape, and a bottom rule.
    if (node !== el) {
      const look = boxLook(cs);
      if (look.gradient) {
        slide.addImage({ data: await rasterBackground(cs, r.width, r.height), ...box(r) });
      } else if (look.fill || look.line) {
        const shape = round ? pptx.ShapeType.ellipse : radius > 0 ? pptx.ShapeType.roundRect : pptx.ShapeType.rect;
        slide.addShape(shape, {
          ...box(r),
          fill: look.fill ? { color: look.fill.hex, transparency: look.fill.transparency } : { type: 'none' },
          line: look.line ? { color: look.line.color, transparency: look.line.transparency, width: look.line.width } : { type: 'none' },
          ...(shape === pptx.ShapeType.roundRect ? { rectRadius: inch(radius) } : {}),
        });
      }
      // A tint laid over the box (an empty logo panel): an ::after filling it.
      const after = getComputedStyle(node, '::after');
      const tint = after.content !== 'none' && after.position === 'absolute' ? parseColor(after.backgroundColor) : null;
      if (tint) {
        const [t, rt, b, l] = ['top', 'right', 'bottom', 'left'].map((s) => px(after[s]));
        const shape = radius > 0 ? pptx.ShapeType.roundRect : pptx.ShapeType.rect;
        slide.addShape(shape, {
          ...box({ left: r.left + l, top: r.top + t, width: r.width - l - rt, height: r.height - t - b }),
          fill: { color: tint.hex, transparency: tint.transparency }, line: { type: 'none' },
          ...(shape === pptx.ShapeType.roundRect ? { rectRadius: inch(radius) } : {}),
        });
      }
      if (look.bottom) {
        slide.addShape(pptx.ShapeType.line, { x: inch(r.left - base.left), y: inch(r.bottom - base.top), w: inch(r.width), h: 0, line: { color: look.bottom.hex, transparency: look.bottom.transparency, width: look.bottom.width } });
      }
    }

    // Pictures and icons.
    if (node.tagName === 'IMG') {
      if (!node.complete || !node.naturalWidth) continue;
      const frame = node.closest('.pz-pic');
      const fr = frame ? Math.min(px(getComputedStyle(frame).borderTopLeftRadius), r.width / 2) : radius;
      try {
        slide.addImage({ data: cropPicture(node, r.width, r.height, cs, fr), ...box(r), ...(opacity < 1 ? { transparency: Math.round((1 - opacity) * 100) } : {}) });
      } catch { /* a picture the browser won't hand over */ }
      handled.add(node);
      continue;
    }
    if (node.namespaceURI === 'http://www.w3.org/2000/svg' && node.tagName.toLowerCase() === 'svg') {
      try { slide.addImage({ data: await rasterIcon(node, r.width, r.height, cs.color), ...box(r) }); } catch { /* skip */ }
      handled.add(node);
      continue;
    }

    // Text.
    if (isTextBlock(node)) {
      const runs = textRuns(node);
      handled.add(node);
      if (!runs.length) continue;
      const pl = px(cs.paddingLeft) + px(cs.borderLeftWidth); const pr = px(cs.paddingRight) + px(cs.borderRightWidth);
      const pt = px(cs.paddingTop) + px(cs.borderTopWidth); const pb = px(cs.paddingBottom) + px(cs.borderBottomWidth);
      const align = ['center', 'right', 'end'].includes(cs.textAlign) ? (cs.textAlign === 'end' ? 'right' : cs.textAlign) : 'left';
      const centred = cs.display === 'grid' && cs.placeItems?.includes('center');
      // A little more room than here: PowerPoint measures text a touch differently.
      const w = r.width - pl - pr; const slack = Math.max(8, w * 0.06);
      const x = r.left - base.left + pl - (align === 'right' ? slack : align === 'center' || centred ? slack / 2 : 0);
      slide.addText(runs, {
        x: inch(x), y: inch(r.top - base.top + pt), w: inch(w + slack), h: inch(Math.max(4, r.height - pt - pb)),
        margin: 0, valign: centred ? 'middle' : 'top', align: centred ? 'center' : align, wrap: true, fit: 'none',
        lineSpacing: Math.round((px(cs.lineHeight) || px(cs.fontSize) * 1.2) * PT * 10) / 10,
        charSpacing: px(cs.letterSpacing) ? Math.round(px(cs.letterSpacing) * PT * 100) / 100 : undefined,
        isTextBox: true,
      });
    }
  }
  return slide;
}

// Speaker notes come out as one paragraph with the line breaks inside it, which
// PowerPoint runs together: each line its own paragraph instead.
const NOTE_LINE = '</a:t></a:r></a:p><a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>';
export const notesInParagraphs = (xml) => xml.replace(/<a:t>([^<]*\n[^<]*)<\/a:t>/g, (m, t) => `<a:t>${t.split(/\r?\n/).join(NOTE_LINE)}</a:t>`);
async function splitNoteLines(blob) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(blob);
  for (const name of Object.keys(zip.files).filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n))) {
    const xml = await zip.file(name).async('string');
    const fixed = notesInParagraphs(xml);
    if (fixed !== xml) zip.file(name, fixed);
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
}

// The file's name from the deck's: plain letters (browsers drop a download name
// with ü, ·, – and the like), "Proposal · Gute Stube" → "Proposal - Gute Stube".
export function fileName(title) {
  const umlauts = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' };
  return String(title || '').replace(/[äöüÄÖÜß]/g, (c) => umlauts[c])
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s*[·•–—|]+\s*/g, ' - ').replace(/\s*[/\\:]+\s*/g, '-').replace(/[^\x20-\x7e]+/g, '').replace(/[*?"<>]+/g, '')
    .replace(/\s+/g, ' ').replace(/^[\s.-]+|[\s.-]+$/g, '') || 'Presentation';
}

/**
 * The slides (`.pz-slide` elements, drawn at full size, pictures loaded) → a
 * .pptx file, downloaded as `<title>.pptx`.
 */
export async function exportPptx(deck, slideEls) {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'SLIDE_1920', width: 1920 * PX, height: 1080 * PX });
  pptx.layout = 'SLIDE_1920';
  pptx.title = deck.title || 'Presentation';
  pptx.author = deck.brand?.name || deck.meta?.preparedBy || '';
  pptx.company = deck.brand?.name || '';
  pptx.theme = { headFontFace: 'DM Sans', bodyFontFace: 'DM Sans' };
  const shown = (deck.slides || []).filter((s) => !s.hidden); // the slides drawn, in order
  for (const [i, el] of slideEls.entries()) {
    const slide = await addSlide(pptx, el);
    const notes = shown[i]?.notes?.trim();
    if (notes) slide.addNotes(notes); // the speaker notes, in PowerPoint's notes
  }
  const name = fileName(deck.title);
  let blob = await pptx.write({ outputType: 'blob', compression: true });
  if (shown.some((s) => /\n/.test(s.notes || ''))) blob = await splitNoteLines(blob);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }));
  a.download = `${name}.pptx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 8000); // the browser takes the file (and its name) first
  return slideEls.length;
}
