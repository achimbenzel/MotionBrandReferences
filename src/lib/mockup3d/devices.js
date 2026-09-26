// Procedural device models — modelled after current phones, tablets and
// laptops (no logos). Units: cm. Each builder returns
//   { group, screens: [{ mesh, aspect, turn }], floorY }
// where every screen mesh uses a screen material (see screen.js).
import * as THREE from 'three';
import { slab, panel, roundedRect, canvasTexture, rr } from './geometry.js';
import { screenMaterial } from './screen.js';
import { DEVICES, finishOf } from './catalog.js';

export { DEVICES, finishOf };

const metal = (color, rough = 0.32) => new THREE.MeshStandardMaterial({ color, metalness: 1, roughness: rough, envMapIntensity: 1.1 });
const glass = (color = '#050506') => new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.9 });
const matte = (color, rough = 0.55) => new THREE.MeshStandardMaterial({ color, metalness: 0.1, roughness: rough, envMapIntensity: 0.8 });
// A thin layer over the screen that adds reflections without darkening it.
const sheen = () => new THREE.MeshStandardMaterial({
  color: 0x000000, roughness: 0.06, metalness: 0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, envMapIntensity: 0.2,
});

function shadowed(obj) {
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  return obj;
}

/** A pill / rounded box standing out of a surface (buttons, camera bumps). */
function knob(w, h, d, r, mat) {
  return new THREE.Mesh(slab(w, h, d, r, Math.min(0.04, d / 3), 12), mat);
}

function lens(radius, depth, ring) {
  const g = new THREE.Group();
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, 40), ring);
  housing.rotation.x = Math.PI / 2;
  const eye = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.72, 40), glass('#0b0d14'));
  eye.position.z = depth / 2 + 0.002;
  const dot = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.25, 24), glass('#1d2536'));
  dot.position.z = depth / 2 + 0.004;
  g.add(housing, eye, dot);
  return g;
}

// ---- Phone / tablet ------------------------------------------------------------------
function handheld({ w, h, d, r, bezel, screenR, finish, island, frontCam, bump }) {
  const group = new THREE.Group();
  const frameMat = metal(finish.frame);
  const body = new THREE.Mesh(slab(w, h, d, r, Math.min(0.14, d / 3)), [glass('#060607'), frameMat]);
  group.add(body);
  // Frosted back glass over the flat back.
  const back = new THREE.Mesh(panel(w - 0.22, h - 0.22, r - 0.1), matte(finish.back, 0.42));
  back.rotation.y = Math.PI;
  back.position.z = -d / 2 - 0.002;
  group.add(back);
  // Screen, its sheen, and the island / camera dot.
  const sw = w - bezel * 2; const sh = h - bezel * 2;
  const screen = new THREE.Mesh(panel(sw, sh, screenR), screenMaterial());
  screen.position.z = d / 2 + 0.003;
  const gloss = new THREE.Mesh(panel(w - 0.06, h - 0.06, r - 0.04), sheen());
  gloss.position.z = d / 2 + 0.006;
  group.add(screen, gloss);
  if (island) {
    const pill = new THREE.Mesh(panel(island.w, island.h, island.h / 2), new THREE.MeshBasicMaterial({ color: '#000000' }));
    pill.position.set(0, sh / 2 - island.top - island.h / 2, d / 2 + 0.004);
    group.add(pill);
  }
  if (frontCam) {
    const cam = new THREE.Mesh(new THREE.CircleGeometry(frontCam.r, 24), glass('#12141c'));
    cam.position.set(frontCam.x, frontCam.y, d / 2 + 0.004);
    group.add(cam);
  }
  if (bump) group.add(bump(frameMat, finish));
  return { group: shadowed(group), screens: [{ mesh: screen, aspect: sw / sh, turn: 0 }] };
}

function buildIphone(opts) {
  const finish = finishOf('iphone', opts.color);
  const w = 7.15; const h = 14.76; const d = 0.825;
  const out = handheld({
    w, h, d, r: 1.12, bezel: 0.16, screenR: 0.98, finish,
    island: { w: 1.27, h: 0.37, top: 0.3 },
    bump: (frameMat, fin) => {
      const g = new THREE.Group();
      const plate = knob(3.72, 3.72, 0.2, 0.95, matte(fin.back, 0.3));
      plate.position.set(-w / 2 + 2.3, h / 2 - 2.3, -d / 2 - 0.08);
      g.add(plate);
      const ringMat = metal(fin.frame, 0.25);
      for (const [x, y] of [[-0.8, 0.8], [-0.8, -0.8], [0.85, 0]]) {
        const l = lens(0.62, 0.3, ringMat);
        l.rotation.y = Math.PI;
        l.position.set(plate.position.x + x, plate.position.y + y, -d / 2 - 0.3);
        g.add(l);
      }
      // Side buttons: action + volume on the left, power + camera control on the right.
      for (const [x, y, len] of [[-w / 2, 4.3, 0.75], [-w / 2, 2.9, 1.2], [-w / 2, 1.45, 1.2], [w / 2, 2.6, 1.9], [w / 2, -1.9, 1.15]]) {
        const b = knob(0.22, len, 0.4, 0.1, frameMat);
        b.position.set(x + Math.sign(x) * 0.02, y, 0);
        g.add(b);
      }
      return g;
    },
  });
  return out;
}

function buildIpad(opts) {
  const finish = finishOf('ipad', opts.color);
  const w = 17.85; const h = 24.95; const d = 0.57;
  return handheld({
    w, h, d, r: 1.75, bezel: 0.92, screenR: 0.9, finish,
    frontCam: { r: 0.09, x: -w / 2 + 0.46, y: 0 },
    bump: (frameMat, fin) => {
      const g = new THREE.Group();
      const plate = knob(2.4, 2.4, 0.16, 0.7, matte(fin.back, 0.3));
      plate.position.set(-w / 2 + 1.8, h / 2 - 1.8, -d / 2 - 0.06);
      g.add(plate);
      for (const [x, y, r] of [[-0.45, 0.45, 0.42], [0.55, -0.5, 0.2]]) {
        const l = lens(r, 0.22, metal(fin.frame, 0.25));
        l.rotation.y = Math.PI;
        l.position.set(plate.position.x + x, plate.position.y + y, -d / 2 - 0.2);
        g.add(l);
      }
      return g;
    },
  });
}

// ---- Laptop ----------------------------------------------------------------------------
function keyboardTexture(dark) {
  return canvasTexture(2048, 900, (ctx, W, H) => {
    ctx.fillStyle = dark ? '#18191b' : '#9fa1a4';
    ctx.fillRect(0, 0, W, H);
    const rows = [14, 14, 14, 13, 12, 10];
    const gap = 12; const rowH = (H - gap * 7) / 6.2;
    let y = gap;
    rows.forEach((n, ri) => {
      const hRow = ri === 0 ? rowH * 0.62 : rowH;
      const unit = (W - gap * (n + 1)) / n;
      let x = gap;
      for (let k = 0; k < n; k += 1) {
        let kw = unit;
        if (ri === 5 && k === 4) kw = unit * 3.4; // space bar
        if (ri === 5 && k > 4) kw = (W - x - gap * (n - k + 1)) / (n - k);
        ctx.fillStyle = '#0c0c0d';
        rr(ctx, x, y, kw, hRow, 10);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 2;
        ctx.stroke();
        x += kw + gap;
      }
      y += hRow + gap;
    });
  });
}

function buildMacbook(opts) {
  const finish = finishOf('macbook', opts.color);
  const dark = finish.key === 'spaceblack';
  const W = 31.26; const D = 22.12; const baseT = 1.0; const lidT = 0.52;
  const group = new THREE.Group();
  const alu = metal(finish.frame, dark ? 0.42 : 0.36);
  // Base, lying flat, top at y = baseT.
  const base = new THREE.Mesh(slab(W, D, baseT, 1.0, 0.28), [alu, alu]);
  base.rotation.x = -Math.PI / 2;
  base.position.y = baseT / 2;
  group.add(base);
  const top = baseT + 0.002;
  const keys = new THREE.Mesh(panel(27.4, 11.8, 0.5), new THREE.MeshStandardMaterial({ map: keyboardTexture(dark), roughness: 0.7, metalness: 0.1 }));
  keys.rotation.x = -Math.PI / 2;
  keys.position.set(0, top, -D / 2 + 1.7 + 5.9);
  const pad = new THREE.Mesh(panel(15.2, 9.6, 0.55), metal(dark ? '#252629' : '#bebfc2', 0.5));
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(0, top, D / 2 - 1.2 - 4.8);
  group.add(keys, pad);
  // Lid: hinged at the back edge; `lid` = opening angle (0 closed, 90 upright).
  const hinge = new THREE.Group();
  hinge.position.set(0, baseT, -D / 2 + 0.35);
  const lidH = D - 0.5;
  const lidGroup = new THREE.Group();
  const lid = new THREE.Mesh(slab(W, lidH, lidT, 1.0, 0.18), [glass('#050506'), alu]);
  lid.position.set(0, lidH / 2, lidT / 2);
  const outer = new THREE.Mesh(panel(W - 0.3, lidH - 0.3, 0.9), alu);
  outer.rotation.y = Math.PI;
  outer.position.set(0, lidH / 2, -0.002);
  const sw = 30.1; const sh = 19.55;
  const screen = new THREE.Mesh(panel(sw, sh, [0.55, 0.55, 0.1, 0.1]), screenMaterial());
  screen.position.set(0, 1.3 + sh / 2, lidT + 0.003);
  const notch = new THREE.Mesh(panel(2.35, 0.82, [0, 0, 0.3, 0.3]), new THREE.MeshBasicMaterial({ color: '#000000' }));
  notch.position.set(0, 1.3 + sh - 0.41, lidT + 0.005);
  const gloss = new THREE.Mesh(panel(W - 0.1, lidH - 0.1, 0.9), sheen());
  gloss.position.set(0, lidH / 2, lidT + 0.007);
  lidGroup.add(lid, outer, screen, notch, gloss);
  hinge.add(lidGroup);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, W - 5, 24), metal(dark ? '#1b1b1d' : '#8d8f92', 0.45));
  barrel.rotation.z = Math.PI / 2;
  barrel.position.set(0, baseT - 0.1, -D / 2 + 0.35);
  group.add(hinge, barrel);
  const angle = THREE.MathUtils.degToRad(Number.isFinite(opts.lid) ? opts.lid : 112);
  hinge.rotation.x = -(angle - Math.PI / 2);
  group.position.z = 2; // keep the whole laptop roughly centred
  return { group: shadowed(group), screens: [{ mesh: screen, aspect: sw / sh, turn: 0 }], floorY: 0 };
}

// ---- Browser window --------------------------------------------------------------------
function chromeTexture({ dark, url, w, h }) {
  const scale = 64; // px per cm
  return canvasTexture(Math.round(w * scale), Math.round(h * scale), (ctx, W, H) => {
    ctx.fillStyle = dark ? '#2a2a2f' : '#f1f1f4';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
    ctx.fillRect(0, H - 2, W, 2);
    const cy = H / 2;
    ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(34 + i * 30, cy, 9.5, 0, Math.PI * 2); ctx.fill(); });
    ctx.strokeStyle = dark ? '#8a8a92' : '#8d8d95'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    for (const [x, dir] of [[150, -1], [186, 1]]) { ctx.beginPath(); ctx.moveTo(x - 6 * dir, cy - 11); ctx.lineTo(x + 6 * dir, cy); ctx.lineTo(x - 6 * dir, cy + 11); ctx.stroke(); }
    const bw = Math.min(W * 0.5, 1100); const bx = (W - bw) / 2; const bh = H * 0.56;
    ctx.fillStyle = dark ? '#1c1c20' : '#e2e2e7';
    rr(ctx, bx, cy - bh / 2, bw, bh, bh / 2);
    ctx.fill();
    ctx.fillStyle = dark ? '#c9c9cf' : '#4a4a52';
    ctx.font = `500 ${Math.round(bh * 0.46)}px "DM Sans", system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(url || 'yourproduct.com', W / 2, cy + 1, bw - 60);
  });
}

function buildBrowser(opts) {
  const finish = finishOf('browser', opts.color);
  const dark = finish.key === 'dark';
  const W = 32; const H = 20.8; const d = 0.36; const bar = 1.6; const r = 0.75;
  const group = new THREE.Group();
  const frame = matte(finish.frame, 0.6);
  const body = new THREE.Mesh(slab(W, H, d, r, 0.08), [frame, frame]);
  group.add(body);
  const top = new THREE.Mesh(panel(W - 0.02, bar, [r, r, 0, 0]), new THREE.MeshBasicMaterial({ map: chromeTexture({ dark, url: opts.url, w: W, h: bar }), toneMapped: false }));
  top.position.set(0, H / 2 - bar / 2, d / 2 + 0.003);
  const sh = H - bar;
  const screen = new THREE.Mesh(panel(W - 0.02, sh - 0.01, [0, 0, r, r]), screenMaterial());
  screen.position.set(0, -bar / 2, d / 2 + 0.003);
  group.add(top, screen);
  return { group: shadowed(group), screens: [{ mesh: screen, aspect: (W - 0.02) / (sh - 0.01), turn: 0 }] };
}

const BUILDERS = { iphone: buildIphone, ipad: buildIpad, macbook: buildMacbook, browser: buildBrowser };

/**
 * Build a device with its options: { color, landscape, lying, lid, url }.
 * Phones / tablets turn for landscape and can lie flat (screen up).
 */
export function buildDevice(device, opts = {}) {
  const out = (BUILDERS[device] || buildIphone)(opts);
  const wrap = new THREE.Group();
  wrap.add(out.group);
  if (DEVICES[device]?.rotates && opts.landscape) {
    out.group.rotation.z = Math.PI / 2;
    for (const s of out.screens) s.turn = 3; // a quarter turn back, so the picture stays upright
  }
  const lying = !!(DEVICES[device]?.lies && opts.lying);
  if (lying) wrap.rotation.x = -Math.PI / 2;
  wrap.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(wrap);
  return { group: wrap, screens: out.screens, box, lying };
}

export { roundedRect };
