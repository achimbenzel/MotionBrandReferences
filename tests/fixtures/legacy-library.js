// A library that mixes every data shape older versions of the app wrote, so
// tests (and the browser check) can prove old data still loads and migrates.
//
//   logo1  – first Logos version: an `assets` array           (b6eb684)
//   logo2  – light/dark variants + bg + variant               (acd5b6d)
//   logo3  – one image + hex renditions + original flag       (eeed254)
//   logo4  – current colour/background pairs                  (aa95ac4+)
//   plan1  – first Plan mode: single `moodboard` + `info`     (9879eef)
//   plan2  – `moodboards` + `info` + `todos`                  (bddf785)
//   plan3  – current `blocks`
//   sw1    – first Software version: icon, scripts, flat expressions (c216824)
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

// ---- tiny image generators (so the browser check has real pixels) --------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xFFFFFFFF; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** A w×h PNG with a diagonal two-colour gradient. */
export function png(w, h, [r1, g1, b1], [r2, g2, b2] = [r1, g1, b1]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const t = (x + y) / (w + h);
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = Math.round(r1 + (r2 - r1) * t); raw[o + 1] = Math.round(g1 + (g2 - g1) * t); raw[o + 2] = Math.round(b1 + (b2 - b1) * t);
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}
const svg = (fill) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="${fill}"/></svg>`);
const pdf = () => Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 120]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

const TEAL = [0, 198, 167]; const BLUE = [30, 79, 214]; const PINK = [255, 95, 109]; const SAND = [216, 201, 163];

// Every file the fixture's db.json points at: [relative path under data/, contents].
export function legacyFiles() {
  return [
    ['branding/brand1/a1.pdf', pdf()],
    ['branding/brand1/a2.png', png(320, 200, TEAL, BLUE)],
    ['motion/mot1/video.mp4', Buffer.from('not-a-real-video')],
    ['motion/mot1/thumb.webp', png(320, 200, PINK, BLUE)],
    ['motion/mot1/frames/f1.webp', png(160, 100, PINK, SAND)],
    ['color/col1/example.png', png(320, 200, [255, 0, 0], [0, 255, 0])],
    ['logo/logo1/la.png', png(120, 120, BLUE)],
    ['logo/logo2/light.png', png(120, 120, SAND)],
    ['logo/logo2/dark.svg', svg('#1e4fd6')],
    ['logo/logo3/logo.svg', svg('#ff5f6d')],
    ['logo/logo4/logo.png', png(120, 120, TEAL)],
    ['businesscard/bc1/front.webp', png(340, 220, SAND, PINK)],
    ['businesscard/bc1/back.webp', png(340, 220, BLUE, TEAL)],
    ['imagegallery/img1/image.png', png(200, 300, TEAL, SAND)],
    ['font/font1/shot.png', png(320, 200, [245, 245, 245], SAND)],
    ['font/font1/thumb.webp', png(320, 200, [245, 245, 245], SAND)],
    ['logonogo/nogo1/image.png', png(120, 120, [60, 60, 60])],
    ['plan/plan1/moodboard/m1.png', png(200, 140, PINK)],
    ['plan/plan2/moodboard/mb2/i2.png', png(200, 140, TEAL)],
    ['plan/plan2/banner.png', png(600, 120, BLUE, PINK)],
    ['plan/plan3/blocks/b2/fa.pdf', pdf()],
    ['plan/plan3/blocks/b2/fa_ex.png', png(100, 100, SAND)],
    ['plan/plan3/blocks/b3/mi.png', png(200, 140, SAND, TEAL)],
    ['software/sw1/s1_my.jsx', Buffer.from('alert("hi");\n')],
  ];
}

export function legacyDB() {
  return {
    projects: [
      { id: 'brand1', type: 'branding', title: 'Acme Brand', year: '2024', category: 'Brand Identity', tags: ['tech'], notes: 'Brand notes', createdAt: 1000,
        assets: [{ id: 'a1', kind: 'pdf', file: 'a1.pdf', name: 'guide.pdf' }, { id: 'a2', kind: 'image', file: 'a2.png', name: 'key.png' }], thumb: 'a2.png' },
      { id: 'mot1', type: 'motion', title: 'Showreel', year: '2025', category: 'Motion Design', tags: [], notes: '', createdAt: 2000,
        video: 'video.mp4', duration: 42, frames: [{ id: 'f1', file: 'frames/f1.webp', t: 1.5, createdAt: 2001 }], thumb: 'thumb.webp', thumbMeta: { x: 0, y: 0, zoom: 1 } },
      { id: 'col1', type: 'color', title: 'Warm palette', year: '', category: 'Palette', tags: [], notes: '', createdAt: 3000,
        example: 'example.png', thumb: 'example.png', colors: [
          { id: 'c1', name: 'Red', source: 'hex', hex: '#FF0000', rgb: { r: 255, g: 0, b: 0 }, cmyk: { c: 0, m: 100, y: 100, k: 0 }, pantone: 'PANTONE 172 C', pantoneApprox: true, pantoneName: '172' },
          { id: 'c2', name: 'Green', source: 'hex', hex: '#00FF00', rgb: { r: 0, g: 255, b: 0 }, cmyk: { c: 100, m: 0, y: 100, k: 0 }, pantone: 'PANTONE 375 C', pantoneApprox: true, pantoneName: '375' },
        ] },
      { id: 'logo1', type: 'logo', title: 'Logo (assets era)', year: '', category: '', tags: [], notes: '', createdAt: 4000,
        assets: [{ id: 'la', kind: 'image', file: 'la.png', name: 'l.png' }], thumb: 'la.png' },
      { id: 'logo2', type: 'logo', title: 'Logo (light/dark era)', year: '', category: '', tags: [], notes: '', createdAt: 5000,
        logoLight: 'light.png', logoDark: 'dark.svg', bg: '#EEEEEE', variant: 'dark', scale: 0.5, thumb: 'dark.svg' },
      { id: 'logo3', type: 'logo', title: 'Logo (hex era)', year: '', category: '', tags: [], notes: '', createdAt: 6000,
        image: 'logo.svg', renditions: ['#111114', '#FFFFFF'], original: true, rendition: '#FFFFFF', bg: '#222222', scale: 0.7, thumb: 'logo.svg' },
      { id: 'logo4', type: 'logo', title: 'Logo (current)', year: '', category: '', tags: [], notes: '', createdAt: 7000,
        image: 'logo.png', scale: 0.8, renditions: [{ color: '#111114', bg: '#FFFFFF' }, { color: 'original', bg: '#FFFFFF' }], rendition: { color: 'original', bg: '#FFFFFF' }, thumb: 'logo.png' },
      { id: 'bc1', type: 'businesscard', title: 'Studio card', year: '', category: '', tags: [], notes: '', createdAt: 8000,
        size: '85x55', front: 'front.webp', back: 'back.webp', thumb: 'front.webp' },
      { id: 'img1', type: 'imagegallery', title: 'Untitled', year: '', category: '', tags: [], notes: '', createdAt: 9000, image: 'image.png', thumb: 'image.png' },
      { id: 'font1', type: 'font', title: 'Google Fonts', year: '', category: '', tags: [], notes: '', createdAt: 10000,
        url: 'https://fonts.google.com', shot: 'shot.png', thumb: 'thumb.webp' },
      { id: 'nogo1', type: 'logonogo', title: 'Bad symbol', year: '', category: '', tags: [], notes: 'Why to avoid it', createdAt: 11000, image: 'image.png', thumb: 'image.png' },
    ],
    galleries: [{ id: 'gal1', type: 'branding', name: 'Green Tech', projectIds: ['brand1'], createdAt: 12000 }],
    plans: [
      { id: 'plan1', name: 'Old plan', info: 'Plan info text', start: '', end: '', moodboard: [{ id: 'm1', file: 'moodboard/m1.png' }], createdAt: 13000 },
      { id: 'plan2', name: 'Mid plan', info: 'Second info', todos: [{ id: 't1', text: 'Do it', done: false }],
        moodboards: [{ id: 'mb2', name: 'Board', collapsed: false, images: [{ id: 'i2', file: 'moodboard/mb2/i2.png' }] }],
        milestones: [{ id: 'ms1', title: 'Kickoff', date: '2026-09-10', done: true }], banner: 'banner.png', avatar: null, start: '', end: '', createdAt: 14000 },
      { id: 'plan3', name: 'Current plan', start: '2026-09-01', end: '2026-10-01', banner: null, bannerGradient: 'dusk', avatar: null, avatarEmoji: '🚀', milestones: [],
        blocks: [
          { id: 'b1', type: 'text', title: 'Text', content: 'Hello' },
          { id: 'b2', type: 'files', title: 'Files', files: [{ id: 'fa', file: 'blocks/b2/fa.pdf', name: 'brief.pdf', size: 10, title: 'Brief', example: 'blocks/b2/fa_ex.png' }] },
          { id: 'b3', type: 'moodboard', title: 'Moodboard', collapsed: false, images: [{ id: 'mi', file: 'blocks/b3/mi.png' }] },
          { id: 'b4', type: 'refs', title: 'References', items: [{ id: 'r1', refKind: 'project', refId: 'brand1', refType: 'branding', title: 'Acme Brand', subtitle: '', thumb: '/data/branding/brand1/a2.png' }] },
        ],
        createdAt: 15000 },
    ],
    software: [
      { id: 'sw1', name: 'After Effects', icon: '🎬', createdAt: 16000,
        plugins: [{ id: 'p1', name: 'Element 3D', category: '3D', url: '', account: '', key: 'SECRET-KEY-123', price: '199', currency: 'USD', version: '', purchasedAt: '', notes: '', file: null, fileName: null, size: 0 }],
        scripts: [{ id: 's1', name: 'My script', fileName: 'my.jsx', file: 's1_my.jsx', size: 13, notes: 'handy' }],
        expressions: [{ id: 'e1', title: 'Wiggle', code: 'wiggle(2, 20)', notes: '', tags: ['basic'] }],
        tutorials: [{ id: 'tu1', title: 'Intro', url: 'https://youtu.be/dQw4w9WgXcQ', channel: 'Someone', tags: [] }] },
    ],
    settings: { storageLimitBytes: 80 * 1024 * 1024 * 1024 },
  };
}

/** Write the legacy db.json + every referenced file into `dataDir`. */
export async function seedLegacyLibrary(dataDir) {
  for (const [rel, buf] of legacyFiles()) {
    const p = path.join(dataDir, rel);
    await fsp.mkdir(path.dirname(p), { recursive: true });
    await fsp.writeFile(p, buf);
  }
  await fsp.writeFile(path.join(dataDir, 'db.json'), JSON.stringify(legacyDB(), null, 2));
}
