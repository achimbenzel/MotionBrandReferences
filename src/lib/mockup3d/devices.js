// Procedural device models — modelled after current phones, tablets, laptops,
// watches, desktops and TVs (no logos). Units: cm. Each builder returns
//   { group, screens: [{ mesh, aspect, turn, guide }] }
// where every screen mesh uses a screen material (see screen.js) and `guide`
// describes the screen for the picture fitter: corner radii [tl, tr, br, bl]
// as fractions of the screen width, cut-outs (island, notch, camera hole) as
// { u, v, w, h, round } in the screen's UV space, and the safe area as insets
// { top, bottom, left, right } (fractions of height / width).
import * as THREE from 'three';
import { slab, panel, roundedRect, canvasTexture, rr } from './geometry.js';
import { screenMaterial } from './screen.js';
import { DEVICES, finishOf } from './catalog.js';

export { DEVICES, finishOf };

const metal = (color, rough = 0.32) => new THREE.MeshStandardMaterial({ color, metalness: 1, roughness: rough, envMapIntensity: 1.1 });
const glass = (color = '#050506') => new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.9 });
const matte = (color, rough = 0.55) => new THREE.MeshStandardMaterial({ color, metalness: 0.1, roughness: rough, envMapIntensity: 0.8 });
// A thin layer over the screen: a faint glass sheen that grows toward grazing
// angles (Fresnel), without the lamp's hot spot washing out the picture.
const sheen = () => new THREE.ShaderMaterial({
  uniforms: { strength: { value: 0.32 } },
  vertexShader: /* glsl */`
    varying vec3 vN; varying vec3 vV;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vV = -mv.xyz; vN = normalMatrix * normal;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */`
    uniform float strength;
    varying vec3 vN; varying vec3 vV;
    void main() {
      float c = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
      float f = 0.015 + 0.985 * pow(1.0 - c, 5.0);
      gl_FragColor = vec4(vec3(f * strength), 1.0);
    }`,
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
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
function handheld({ w, h, d, r, bezel, screenR, finish, island, frontCam, bump, safe }) {
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
  const guide = { radius: Array(4).fill(screenR / sw), cutouts: [], safe: safe || null };
  if (island) guide.cutouts.push({ u: 0.5, v: 1 - (island.top + island.h / 2) / sh, w: island.w / sw, h: island.h / sh, round: true });
  if (frontCam && Math.abs(frontCam.x) < sw / 2 && Math.abs(frontCam.y) < sh / 2) {
    guide.cutouts.push({ u: 0.5 + frontCam.x / sw, v: 0.5 + frontCam.y / sh, w: (frontCam.r * 2) / sw, h: (frontCam.r * 2) / sh, round: true });
  }
  return { group: shadowed(group), screens: [{ mesh: screen, aspect: sw / sh, turn: 0, guide }] };
}

function buildIphone(opts) {
  const finish = finishOf('iphone', opts.color);
  const w = 7.15; const h = 14.76; const d = 0.825;
  const out = handheld({
    w, h, d, r: 1.12, bezel: 0.16, screenR: 0.98, finish,
    island: { w: 1.27, h: 0.37, top: 0.3 },
    safe: { top: 0.068, bottom: 0.039, left: 0, right: 0 },
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
    safe: { top: 0.018, bottom: 0.015, left: 0, right: 0 },
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
  const guide = {
    radius: [0.55, 0.55, 0.1, 0.1].map((x) => x / sw),
    cutouts: [{ u: 0.5, v: 1 - 0.41 / sh, w: 2.35 / sw, h: 0.82 / sh, round: false }],
    safe: { top: 0.82 / sh, bottom: 0, left: 0, right: 0 },
  };
  return { group: shadowed(group), screens: [{ mesh: screen, aspect: sw / sh, turn: 0, guide }] };
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
  const guide = { radius: [0, 0, r, r].map((x) => x / (W - 0.02)), cutouts: [], safe: null };
  return { group: shadowed(group), screens: [{ mesh: screen, aspect: (W - 0.02) / (sh - 0.01), turn: 0, guide }] };
}

// ---- Android phone ---------------------------------------------------------------------
function buildAndroid(opts) {
  const finish = finishOf('android', opts.color);
  const w = 7.24; const h = 15.24; const d = 0.84;
  return handheld({
    w, h, d, r: 0.95, bezel: 0.17, screenR: 0.8, finish,
    frontCam: { r: 0.17, x: 0, y: h / 2 - 0.17 - 0.62 },
    safe: { top: 0.045, bottom: 0.03, left: 0, right: 0 },
    bump: (frameMat, fin) => {
      const g = new THREE.Group();
      const ringMat = metal(fin.frame, 0.25);
      for (const [y, r] of [[h / 2 - 1.45, 0.52], [h / 2 - 2.75, 0.52], [h / 2 - 4.05, 0.52]]) {
        const l = lens(r, 0.2, ringMat);
        l.rotation.y = Math.PI;
        l.position.set(-w / 2 + 1.35, y, -d / 2 - 0.2);
        g.add(l);
      }
      const flash = new THREE.Mesh(new THREE.CircleGeometry(0.16, 24), matte('#f4ecd8', 0.3));
      flash.rotation.y = Math.PI;
      flash.position.set(-w / 2 + 2.45, h / 2 - 1.45, -d / 2 - 0.003);
      g.add(flash);
      for (const [y, len] of [[3.3, 2.3], [1.2, 1.1]]) {
        const b = knob(0.2, len, 0.36, 0.1, frameMat);
        b.position.set(w / 2 + 0.02, y, 0);
        g.add(b);
      }
      return g;
    },
  });
}

// ---- Apple Watch ------------------------------------------------------------------------
function buildWatch(opts) {
  const finish = finishOf('watch', opts.color);
  const w = 3.9; const h = 4.6; const d = 1.0; const r = 1.05;
  const group = new THREE.Group();
  const caseMat = metal(finish.frame, 0.3);
  group.add(new THREE.Mesh(slab(w, h, d, r, 0.3, 36), [glass('#050506'), caseMat]));
  const sw = 3.52; const sh = 4.2; const sr = 0.92;
  const screen = new THREE.Mesh(panel(sw, sh, sr), screenMaterial());
  screen.position.z = d / 2 + 0.003;
  const gloss = new THREE.Mesh(panel(w - 0.1, h - 0.1, r - 0.05), sheen());
  gloss.position.z = d / 2 + 0.006;
  group.add(screen, gloss);
  // Digital Crown and side button on the right, the sensor dome on the back.
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.36, 36), caseMat);
  crown.rotation.z = Math.PI / 2;
  crown.position.set(w / 2 + 0.16, 0.95, -0.05);
  const button = knob(0.22, 1.25, 0.3, 0.1, caseMat);
  button.position.set(w / 2 + 0.03, -0.55, -0.05);
  const capR = 1.2; const capH = 0.16; const R = (capR * capR + capH * capH) / (2 * capH);
  const sensor = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 8, 0, Math.PI * 2, 0, Math.asin(capR / R)), glass('#151518'));
  sensor.rotation.x = -Math.PI / 2;
  sensor.position.z = -d / 2 + (R - capH);
  group.add(crown, button, sensor);
  // The band: two straps bending back, as if around a wrist.
  const bandMat = matte(finish.band, 0.78);
  for (const dir of [1, -1]) {
    let pivot = new THREE.Group();
    pivot.position.set(0, dir * (h / 2 - 0.35), -0.2);
    pivot.rotation.x = -dir * 0.12;
    group.add(pivot);
    const segs = [1.25, 1.3, 1.3, 1.3, 1.2];
    segs.forEach((L, k) => {
      const seg = new THREE.Mesh(slab(2.3, L + 0.06, 0.32, k === segs.length - 1 ? 0.9 : 0.12, 0.1, 10), bandMat);
      seg.position.y = dir * (L / 2);
      pivot.add(seg);
      const next = new THREE.Group();
      next.position.y = dir * L;
      next.rotation.x = -dir * 0.42;
      pivot.add(next);
      pivot = next;
    });
  }
  const guide = { radius: Array(4).fill(sr / sw), cutouts: [], safe: null };
  return { group: shadowed(group), screens: [{ mesh: screen, aspect: sw / sh, turn: 0, guide }] };
}

// ---- iMac -----------------------------------------------------------------------------------
function buildImac(opts) {
  const finish = finishOf('imac', opts.color);
  const W = 54.7; const T = 1.15; const border = 1.2; const chinH = 5.3;
  const sw = W - border * 2; const sh = (sw * 9) / 16;
  const PH = sh + border * 2 + chinH; const lift = 46.1 - PH;
  const group = new THREE.Group();
  const backMat = metal(finish.frame, 0.38);
  const body = new THREE.Mesh(slab(W, PH, T, 1.1, 0.25), [backMat, backMat]);
  body.position.set(0, lift + PH / 2, 0);
  const white = new THREE.MeshPhysicalMaterial({ color: '#eeeef0', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 0.9 });
  const bezel = new THREE.Mesh(panel(W - 0.1, PH - chinH, [1.05, 1.05, 0, 0]), white);
  bezel.position.set(0, lift + chinH + (PH - chinH) / 2, T / 2 + 0.012);
  const chin = new THREE.Mesh(panel(W - 0.1, chinH, [0, 0, 1.05, 1.05]), metal(finish.back, 0.42));
  chin.position.set(0, lift + chinH / 2, T / 2 + 0.012);
  const screen = new THREE.Mesh(panel(sw, sh, 0.05), screenMaterial());
  screen.position.set(0, lift + chinH + border + sh / 2, T / 2 + 0.03);
  const gloss = new THREE.Mesh(panel(W - 0.12, PH - chinH - 0.05, [1.05, 1.05, 0, 0]), sheen());
  gloss.position.set(0, lift + chinH + (PH - chinH) / 2, T / 2 + 0.05);
  group.add(body, bezel, chin, screen, gloss);
  // Stand: a foot on the table and a plate leaning up to the back of the display.
  const standMat = metal(finish.frame, 0.4);
  const foot = new THREE.Mesh(slab(14.7, 14.7, 0.5, 1.2, 0.12), [standMat, standMat]);
  foot.rotation.x = -Math.PI / 2;
  foot.position.set(0, 0.25, -2.2);
  const y0 = 0.4; const z0 = -2.2 - 14.7 / 2 + 0.6; const y1 = lift + 13; const z1 = -T / 2 - 0.3;
  const L = Math.hypot(y1 - y0, z1 - z0);
  const upright = new THREE.Mesh(slab(14.7, L, 0.5, 0.25, 0.12), [standMat, standMat]);
  upright.position.set(0, (y0 + y1) / 2, (z0 + z1) / 2);
  upright.rotation.x = Math.atan2(z1 - z0, y1 - y0);
  group.add(foot, upright);
  const guide = { radius: Array(4).fill(0.05 / sw), cutouts: [], safe: { top: 0.022, bottom: 0, left: 0, right: 0 } };
  return { group: shadowed(group), screens: [{ mesh: screen, aspect: sw / sh, turn: 0, guide }] };
}

// ---- TV -------------------------------------------------------------------------------------
function buildTv(opts) {
  const finish = finishOf('tv', opts.color);
  const W = 144.6; const T = 2.4; const side = 0.6; const bottom = 1.6;
  const sw = W - side * 2; const sh = (sw * 9) / 16;
  const H = sh + side + bottom; const lift = 8;
  const group = new THREE.Group();
  const frameMat = metal(finish.frame, 0.45);
  const body = new THREE.Mesh(slab(W, H, T, 0.5, 0.2), [glass('#050506'), frameMat]);
  body.position.set(0, lift + H / 2, 0);
  const backBox = new THREE.Mesh(slab(W * 0.62, H * 0.52, 3, 1.2, 0.5), [matte(finish.back, 0.6), matte(finish.back, 0.6)]);
  backBox.position.set(0, lift + H * 0.36, -T / 2 - 1.2);
  const screen = new THREE.Mesh(panel(sw, sh, 0.1), screenMaterial());
  screen.position.set(0, lift + bottom + sh / 2, T / 2 + 0.05);
  const gloss = new THREE.Mesh(panel(W - 0.1, H - 0.1, 0.45), sheen());
  gloss.position.set(0, lift + H / 2, T / 2 + 0.1);
  const standMat = metal(finish.frame, 0.35);
  const base = new THREE.Mesh(slab(46, 26, 1.2, 1.6, 0.3), [standMat, standMat]);
  base.rotation.x = -Math.PI / 2;
  base.position.set(0, 0.6, -2);
  const neck = new THREE.Mesh(slab(22, lift + 10, 1.6, 0.4, 0.2), [standMat, standMat]);
  neck.position.set(0, (lift + 10) / 2 + 0.6, -T / 2 - 2.9);
  group.add(body, backBox, screen, gloss, base, neck);
  const guide = { radius: Array(4).fill(0.1 / sw), cutouts: [], safe: { top: 0.05, bottom: 0.05, left: 0.05, right: 0.05 } };
  return { group: shadowed(group), screens: [{ mesh: screen, aspect: sw / sh, turn: 0, guide }] };
}

const BUILDERS = {
  iphone: buildIphone, ipad: buildIpad, macbook: buildMacbook, browser: buildBrowser,
  android: buildAndroid, watch: buildWatch, imac: buildImac, tv: buildTv,
};

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
