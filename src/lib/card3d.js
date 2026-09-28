// A business card in 3D (three.js): the card at its real size and thickness,
// your front and back printed on it, in a soft studio light and floating over
// its own shadow. Drag to turn it (it keeps a little swing when you let go),
// flip it, and pick the paper — matte, silk or gloss, how thick, the edge
// (paper white, black, gold or silver foil, or the design's own colour) and
// square or round corners.
import * as THREE from 'three';
import { roundedRect, panel } from './mockup3d/geometry.js';
import { makeEnvironment, ContactShadow, LIGHT_SETUPS, lightDir } from './mockup3d/lighting.js';
import { fitMatrix } from './mockup3d/screen.js';

const D = Math.PI / 180;

export const PAPER_FINISHES = {
  matte: { label: 'Matte', roughness: 0.84, clearcoat: 0, clearcoatRoughness: 0, grain: 0.14 },
  silk: { label: 'Silk', roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.3, grain: 0.1 },
  gloss: { label: 'Gloss', roughness: 0.4, clearcoat: 0.55, clearcoatRoughness: 0.07, grain: 0.03 },
};
export const PAPER_THICKNESS = {
  std: { label: 'Standard', note: '0.4 mm', t: 0.04 },
  thick: { label: 'Thick', note: '0.8 mm', t: 0.08 },
  xthick: { label: 'Extra thick', note: '1.4 mm', t: 0.14 },
};
export const PAPER_EDGES = {
  paper: { label: 'Paper white', color: '#f1efe9', roughness: 0.92, metalness: 0 },
  black: { label: 'Black', color: '#161616', roughness: 0.8, metalness: 0 },
  gold: { label: 'Gold foil', color: '#e2b857', roughness: 0.28, metalness: 1 },
  silver: { label: 'Silver foil', color: '#dfe2e6', roughness: 0.24, metalness: 1 },
  design: { label: 'From the design', roughness: 0.85, metalness: 0 },
};
export const PAPER_CORNERS = { square: { label: 'Square', r: 0 }, round: { label: 'Round', r: 0.3 } };
export const DEFAULT_PAPER = { finish: 'matte', thickness: 'std', edge: 'paper', corners: 'square' };
export const paperOf = (p) => ({
  finish: PAPER_FINISHES[p?.finish] ? p.finish : DEFAULT_PAPER.finish,
  thickness: PAPER_THICKNESS[p?.thickness] ? p.thickness : DEFAULT_PAPER.thickness,
  edge: PAPER_EDGES[p?.edge] ? p.edge : DEFAULT_PAPER.edge,
  corners: PAPER_CORNERS[p?.corners] ? p.corners : DEFAULT_PAPER.corners,
});

const PAPER_COLOR = '#f3f1ec'; // a side without a picture
const HOME = { x: -22, y: 22 }; // the resting pose (degrees): leaning back a little, turned a little

// Paper fibres: a fine, soft height noise → a tileable normal map (made once).
let grainTex = null;
function paperGrain() {
  if (grainTex) return grainTex;
  const N = 256;
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  let h = new Float32Array(N * N).map(() => rnd());
  const at = (a, x, y) => a[((y + N) % N) * N + ((x + N) % N)];
  for (let pass = 0; pass < 2; pass += 1) { // soften: a little blur, a touch more along x (fibres)
    const o = new Float32Array(N * N);
    for (let y = 0; y < N; y += 1) {
      for (let x = 0; x < N; x += 1) {
        o[y * N + x] = (at(h, x, y) * 2 + at(h, x - 1, y) * 1.5 + at(h, x + 1, y) * 1.5 + at(h, x, y - 1) + at(h, x, y + 1)) / 7;
      }
    }
    h = o;
  }
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      const dx = (at(h, x + 1, y) - at(h, x - 1, y)) * 6;
      const dy = (at(h, x, y + 1) - at(h, x, y - 1)) * 6;
      const l = Math.hypot(dx, dy, 1);
      const k = (y * N + x) * 4;
      data[k] = (-dx / l * 0.5 + 0.5) * 255; data[k + 1] = (-dy / l * 0.5 + 0.5) * 255; data[k + 2] = (1 / l * 0.5 + 0.5) * 255; data[k + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  grainTex = t;
  return t;
}

// A soft round shadow (drawn once): the light that doesn't reach the floor under the card.
let blobTex = null;
function blobShadow() {
  if (blobTex) return blobTex;
  const S = 128;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.45, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  blobTex = new THREE.CanvasTexture(c);
  return blobTex;
}

// The average colour around a picture's edge (for "edge from the design").
function edgeColor(img) {
  try {
    const S = 24;
    const c = document.createElement('canvas'); c.width = S; c.height = S;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, S, S);
    const px = x.getImageData(0, 0, S, S).data;
    let r = 0; let g = 0; let b = 0; let n = 0;
    for (let i = 0; i < S; i += 1) {
      for (const [u, v] of [[i, 0], [i, S - 1], [0, i], [S - 1, i]]) {
        const k = (v * S + u) * 4;
        if (px[k + 3] < 20) continue;
        r += px[k]; g += px[k + 1]; b += px[k + 2]; n += 1;
      }
    }
    if (!n) return null;
    return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`;
  } catch { return null; }
}

export class CardViewer {
  /**
   * `container` gets the canvas; `size` = { w, h } in mm (landscape);
   * `onSide(side)` is told which side faces you ('front' | 'back').
   */
  constructor(container, { size, onSide } = {}) {
    this.container = container;
    this.onSide = onSide;
    this.base = { w: (size?.w || 85) / 10, h: (size?.h || 55) / 10 }; // cm
    this.paper = { ...DEFAULT_PAPER };
    this.tex = { front: null, back: null };
    this.cur = { ...HOME }; this.target = { ...HOME }; this.vel = { x: 0, y: 0 };
    this.hover = { x: 0, y: 0 }; this.hoverCur = { x: 0, y: 0 };
    this.side = 'front';
    this.calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping; // keeps the design's colours true
    r.toneMappingExposure = 1;
    r.setClearColor(0x000000, 0);
    r.domElement.className = 'bc3d-canvas';
    container.appendChild(r.domElement);
    this.renderer = r;

    const scene = new THREE.Scene();
    const setup = LIGHT_SETUPS.studio;
    this.pmrem = new THREE.PMREMGenerator(r);
    this.equirect = makeEnvironment('studio', 512);
    this.env = this.pmrem.fromEquirectangular(this.equirect);
    scene.environment = this.env.texture;
    scene.environmentIntensity = 1.15;
    // The soft boxes of the studio do the light (and the reflections); one
    // weak direct light for a little more form, too soft to leave a hot spot.
    const key = setup.lights[0];
    const light = new THREE.DirectionalLight(new THREE.Color(...key.color), 0.45);
    light.position.copy(lightDir(key.az, key.el)).multiplyScalar(40);
    scene.add(light);
    this.scene = scene;

    this.pivot = new THREE.Group(); // turned by you
    this.lift = new THREE.Group();  // floats, lifts while flipping
    this.lift.add(this.pivot);
    scene.add(this.lift);

    this.faceMats = { front: this.faceMaterial(), back: this.faceMaterial() };
    this.edgeMat = new THREE.MeshPhysicalMaterial({ color: PAPER_EDGES.paper.color, roughness: 0.9 });
    this.hideMat = new THREE.MeshBasicMaterial({ visible: false });

    this.floor = new THREE.Group();
    this.contact = new ContactShadow(512);
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: blobShadow(), transparent: true, depthWrite: false, opacity: 0.4 }));
    this.blob.position.y = 0.01;
    this.floor.add(this.contact.group, this.blob);
    scene.add(this.floor);

    this.camera = new THREE.PerspectiveCamera(24, 1, 1, 400);
    this.build();

    this.bindPointer();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; this.kick(); });
    this.io.observe(container);
    this.onVis = () => this.kick();
    document.addEventListener('visibilitychange', this.onVis);
    this.resize();
    this.kick();
  }

  faceMaterial() {
    const f = PAPER_FINISHES.matte;
    const g = paperGrain();
    return new THREE.MeshPhysicalMaterial({
      color: PAPER_COLOR, roughness: f.roughness, clearcoat: f.clearcoat, clearcoatRoughness: f.clearcoatRoughness,
      normalMap: g, normalScale: new THREE.Vector2(f.grain, f.grain),
    });
  }

  /** The card's shape: its size (upright when the design is), thickness and corners. */
  build() {
    const { w: bw, h: bh } = this.base;
    const img = (this.tex.front || this.tex.back)?.image;
    const upright = img && img.height > img.width * 1.05;
    const w = upright ? Math.min(bw, bh) : Math.max(bw, bh);
    const h = upright ? Math.max(bw, bh) : Math.min(bw, bh);
    const t = PAPER_THICKNESS[this.paper.thickness].t;
    const r = Math.max(0.0001, PAPER_CORNERS[this.paper.corners].r);
    for (const m of this.meshes || []) { m.geometry.dispose(); this.pivot.remove(m); }
    const front = new THREE.Mesh(panel(w, h, r, 24), this.faceMats.front);
    front.position.z = t / 2;
    const back = new THREE.Mesh(panel(w, h, r, 24), this.faceMats.back);
    back.rotation.y = Math.PI; back.position.z = -t / 2;
    const edgeGeo = new THREE.ExtrudeGeometry(roundedRect(w, h, r), { depth: t, bevelEnabled: false, curveSegments: 20 });
    edgeGeo.translate(0, 0, -t / 2);
    const edge = new THREE.Mesh(edgeGeo, [this.hideMat, this.edgeMat]);
    this.meshes = [front, back, edge];
    this.pivot.add(front, back, edge);
    this.size = { w, h };
    // The grain: about 2.5 cm per tile, whatever the card's size.
    paperGrain().repeat.set(w / 2.5, h / 2.5);
    for (const side of ['front', 'back']) this.fitTexture(side);
    this.frame();
    this.kick();
  }

  fitTexture(side) {
    const tex = this.tex[side];
    const m = this.faceMats[side];
    if (tex) {
      const { width, height } = tex.image;
      tex.matrix.copy(fitMatrix({ screenAspect: this.size.w / this.size.h, contentAspect: width / height, fit: 'cover' }));
    }
    const had = !!m.map;
    m.map = tex || null;
    m.color.set(tex ? '#ffffff' : PAPER_COLOR);
    if (had !== !!tex) m.needsUpdate = true;
  }

  /** Put the front / back pictures on (urls, or null for plain paper). */
  async setSides({ front, back }) {
    const token = (this.loadToken || 0) + 1;
    this.loadToken = token;
    const load = async (url) => {
      if (!url) return null;
      try {
        const t = await new THREE.TextureLoader().loadAsync(url);
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        t.matrixAutoUpdate = false;
        t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
        return t;
      } catch { return null; }
    };
    const [f, b] = await Promise.all([load(front), load(back)]);
    if (this.disposed || token !== this.loadToken) { f?.dispose(); b?.dispose(); return; }
    this.tex.front?.dispose(); this.tex.back?.dispose();
    this.tex = { front: f, back: b };
    this.designEdge = edgeColor((f || b)?.image);
    this.applyPaper();
    this.build();
  }

  setPaper(p) {
    const next = paperOf(p);
    const reshape = next.thickness !== this.paper.thickness || next.corners !== this.paper.corners;
    this.paper = next;
    this.applyPaper();
    if (reshape) this.build(); else this.kick();
  }

  applyPaper() {
    const f = PAPER_FINISHES[this.paper.finish];
    for (const m of Object.values(this.faceMats)) {
      m.roughness = f.roughness; m.clearcoat = f.clearcoat; m.clearcoatRoughness = f.clearcoatRoughness;
      m.normalScale.set(f.grain, f.grain);
    }
    const e = PAPER_EDGES[this.paper.edge];
    this.edgeMat.color.set(this.paper.edge === 'design' ? (this.designEdge || PAPER_EDGES.paper.color) : e.color);
    this.edgeMat.roughness = e.roughness; this.edgeMat.metalness = e.metalness;
  }

  /** Frame the card and the floor under it. */
  frame() {
    const half = Math.hypot(this.size.w, this.size.h) / 2;
    this.floorY = -(half + 0.3); // just below the lowest a corner can reach
    this.floor.position.y = this.floorY;
    this.contact.fit(0, 0, half * 3.4, half * 2.4);
    const aspect = this.camera.aspect || 1;
    const top = half * 0.78; const bottom = this.floorY - 0.2;
    const cy = (top + bottom) / 2; const hh = (top - bottom) / 2;
    const tan = Math.tan((this.camera.fov / 2) * D);
    const dist = Math.max(hh / tan, (half * 1.04) / (tan * aspect));
    const el = 19 * D;
    this.camera.position.set(0, cy + dist * Math.sin(el), dist * Math.cos(el));
    this.camera.lookAt(0, cy, 0);
    this.camera.near = Math.max(0.5, dist - half * 4); this.camera.far = dist + half * 6;
    this.camera.updateProjectionMatrix();
  }

  resize() {
    const w = this.container.clientWidth; const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.frame();
    this.kick();
  }

  bindPointer() {
    const el = this.renderer.domElement;
    let last = null;
    this.onDown = (e) => {
      if (e.button > 0) return;
      e.preventDefault(); // no text selection while turning it
      el.setPointerCapture?.(e.pointerId);
      last = { x: e.clientX, y: e.clientY, t: performance.now() };
      this.dragging = true; this.vel = { x: 0, y: 0 };
      this.hover = { x: 0, y: 0 };
      el.classList.add('grabbing');
      this.kick();
    };
    this.onMove = (e) => {
      if (this.dragging && last) {
        const now = performance.now(); const dt = Math.max(1, now - last.t) / 1000;
        const dx = (e.clientX - last.x) * 0.45; const dy = (e.clientY - last.y) * 0.35;
        this.target.y += dx;
        this.target.x = Math.max(-75, Math.min(75, this.target.x + dy));
        this.vel = { x: dy / dt, y: dx / dt };
        last = { x: e.clientX, y: e.clientY, t: now };
        this.kick();
      } else if (e.pointerType === 'mouse') { // a gentle lean towards the pointer
        const b = el.getBoundingClientRect();
        this.hover = { x: ((e.clientY - b.top) / b.height - 0.5) * 7, y: ((e.clientX - b.left) / b.width - 0.5) * 9 };
        this.kick();
      }
    };
    this.onUp = (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      el.releasePointerCapture?.(e.pointerId);
      el.classList.remove('grabbing');
      if (last && performance.now() - last.t > 80) this.vel = { x: 0, y: 0 }; // held still before letting go
      last = null;
      this.kick();
    };
    this.onLeave = () => { this.hover = { x: 0, y: 0 }; this.kick(); };
    this.onDbl = () => this.flip();
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('pointerleave', this.onLeave);
    el.addEventListener('dblclick', this.onDbl);
  }

  /** Turn it over (to the nearest side, then half a turn). */
  flip() {
    this.target.y = Math.round((this.target.y - HOME.y) / 180) * 180 + HOME.y + 180;
    this.target.x = HOME.x;
    this.vel = { x: 0, y: 0 };
    this.kick();
  }

  reset() {
    // Back to the front, the short way round.
    const turns = Math.round((this.cur.y - HOME.y) / 360);
    this.target = { x: HOME.x, y: HOME.y + turns * 360 };
    this.vel = { x: 0, y: 0 };
    this.kick();
  }

  /** Make sure frames are being drawn (they stop when nothing moves). */
  kick() {
    if (this.raf || this.disposed) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(() => this.tick());
  }

  tick() {
    this.raf = 0;
    if (this.disposed) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.dragging && (Math.abs(this.vel.x) > 0.5 || Math.abs(this.vel.y) > 0.5)) { // swing on
      this.target.y += this.vel.y * dt;
      this.target.x = Math.max(-75, Math.min(75, this.target.x + this.vel.x * dt));
      const k = Math.exp(-dt * 3.2);
      this.vel.x *= k; this.vel.y *= k;
    }
    const f = 1 - Math.exp(-dt * (this.dragging ? 18 : 7));
    const fh = 1 - Math.exp(-dt * 5);
    this.cur.x += (this.target.x - this.cur.x) * f;
    this.cur.y += (this.target.y - this.cur.y) * f;
    this.hoverCur.x += (this.hover.x - this.hoverCur.x) * fh;
    this.hoverCur.y += (this.hover.y - this.hoverCur.y) * fh;
    const t = now / 1000;
    const float = this.calm ? 0 : 1;
    this.pivot.rotation.set((this.cur.x + this.hoverCur.x + Math.sin(t * 0.7) * 1.2 * float) * D, (this.cur.y + this.hoverCur.y + Math.sin(t * 0.53) * 1.6 * float) * D, Math.sin(t * 0.61) * 0.8 * float * D);
    const flipping = Math.min(1, Math.abs(this.target.y - this.cur.y) / 180);
    this.lift.position.y = Math.sin(t * 0.9) * 0.1 * float + Math.sin(flipping * Math.PI / 2) * 0.9;
    this.contact.set({ opacity: 0.55 - flipping * 0.2, blur: 3 + flipping * 2.4 });
    // The soft shadow follows the card's footprint on the floor (wider, lighter when it lifts).
    this.pivot.updateWorldMatrix(true, false);
    let x0 = Infinity; let x1 = -Infinity; let z0 = Infinity; let z1 = -Infinity;
    for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const v = new THREE.Vector3((cx * this.size.w) / 2, (cy * this.size.h) / 2, 0).applyMatrix4(this.pivot.matrixWorld);
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z);
    }
    const spread = 2.2 + flipping * 1.5;
    this.blob.scale.set(x1 - x0 + spread * 1.6, 1, z1 - z0 + spread);
    this.blob.position.x = (x0 + x1) / 2; this.blob.position.z = (z0 + z1) / 2;
    this.blob.material.opacity = 0.34 - flipping * 0.12;

    // Which side faces you (the card's normal against the way to the camera).
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(this.pivot.quaternion);
    const side = n.dot(this.camera.position.clone().sub(this.lift.position).normalize()) >= 0 ? 'front' : 'back';
    if (side !== this.side) { this.side = side; this.onSide?.(side); }

    this.contact.update(this.renderer, this.scene);
    this.renderer.render(this.scene, this.camera);

    const moving = this.dragging || Math.abs(this.target.x - this.cur.x) > 0.02 || Math.abs(this.target.y - this.cur.y) > 0.02
      || Math.abs(this.hover.x - this.hoverCur.x) > 0.02 || Math.abs(this.hover.y - this.hoverCur.y) > 0.02
      || Math.abs(this.vel.x) > 0.5 || Math.abs(this.vel.y) > 0.5;
    const shown = this.visible !== false && !document.hidden;
    if (shown && (moving || float)) this.kick();
  }

  /** The current view as a PNG blob (transparent background), `scale` × the canvas size. */
  async snapshot(scale = 2) {
    const r = this.renderer;
    const prev = r.getPixelRatio();
    r.setPixelRatio(Math.min(4, (window.devicePixelRatio || 1) * scale));
    r.setSize(this.container.clientWidth, this.container.clientHeight, false);
    this.contact.update(r, this.scene);
    r.render(this.scene, this.camera);
    const blob = await new Promise((res) => r.domElement.toBlob(res, 'image/png'));
    r.setPixelRatio(prev);
    this.resize();
    return blob;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect(); this.io.disconnect();
    document.removeEventListener('visibilitychange', this.onVis);
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onDown);
    el.removeEventListener('pointermove', this.onMove);
    el.removeEventListener('pointerup', this.onUp);
    el.removeEventListener('pointercancel', this.onUp);
    el.removeEventListener('pointerleave', this.onLeave);
    el.removeEventListener('dblclick', this.onDbl);
    for (const m of this.meshes || []) m.geometry.dispose();
    for (const m of [...Object.values(this.faceMats), this.edgeMat, this.hideMat, this.blob.material]) m.dispose();
    this.blob.geometry.dispose();
    this.tex.front?.dispose(); this.tex.back?.dispose();
    this.contact.dispose();
    this.env.dispose(); this.equirect.dispose(); this.pmrem.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    el.remove();
  }
}
