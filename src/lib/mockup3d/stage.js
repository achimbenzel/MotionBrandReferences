// The 3D stage of the mockup editor: renderer, lights, floor shadow, camera
// with orbit controls, one or more devices (built-in or imported models), each
// with a picture or video on its screen, the background, animations and
// rendering for PNG / video export.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { screenMaterial, fitScreen } from './screen.js';
import { FRAMES } from './catalog.js';

export { FRAMES };

// Camera directions (from the scene's centre) for the view presets.
const VIEWS = {
  front: [0, 0.05, 1],
  'three-left': [-0.62, 0.2, 0.76],
  'three-right': [0.62, 0.2, 0.76],
  hero: [0.32, -0.08, 1],
  top: [0.15, 1, 0.7],
  side: [1, 0.12, 0.18],
  back: [-0.4, 0.15, -1],
};
// The same presets when every device lies flat (screen up): from above, as
// you'd see them on a table.
const LYING_VIEWS = {
  front: [0, 1, 0.3],
  'three-left': [-0.5, 0.85, 0.55],
  'three-right': [0.5, 0.85, 0.55],
  hero: [0.3, 0.32, 1],
  top: [0.001, 1, 0.02],
  side: [1, 0.4, 0.12],
  back: [-0.35, 0.8, -0.6],
};
export const VIEW_LABELS = {
  front: 'Front', 'three-left': '¾ left', 'three-right': '¾ right', hero: 'Low hero', top: 'From above', side: 'Side', back: 'Back',
};
export const ANIMATIONS = {
  none: 'None',
  turntable: 'Turntable (360°)',
  sway: 'Sway',
  float: 'Float',
  orbit: 'Camera orbit',
  push: 'Push in',
  reveal: 'Reveal',
};
// Seamless loops: the last frame leads straight into the first.
export const LOOPING = new Set(['turntable', 'sway', 'float']);

const LOGO_PART = /logo|apple_?mark|brand_?mark/i;
export const isLogoPart = (name) => LOGO_PART.test(name || '');

// Least-squares fit position ≈ p0 + u·a + v·b over a mesh's vertices; the
// screen's aspect in UV space is |a| / |b|.
function uvAspect(mesh) {
  const pos = mesh.geometry?.attributes?.position; const uv = mesh.geometry?.attributes?.uv;
  if (!pos || !uv) return 16 / 9;
  mesh.updateWorldMatrix(true, false);
  const v = new THREE.Vector3();
  const n = Math.min(pos.count, 4000); const step = Math.max(1, Math.floor(pos.count / n));
  let s1 = 0; let su = 0; let sv = 0; let suu = 0; let svv = 0; let suv = 0;
  const sp = [0, 0, 0]; const spu = [0, 0, 0]; const spv = [0, 0, 0];
  for (let i = 0; i < pos.count; i += step) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    const u = uv.getX(i); const w = uv.getY(i);
    s1 += 1; su += u; sv += w; suu += u * u; svv += w * w; suv += u * w;
    [v.x, v.y, v.z].forEach((p, k) => { sp[k] += p; spu[k] += p * u; spv[k] += p * w; });
  }
  const M = new THREE.Matrix3().set(s1, su, sv, su, suu, suv, sv, suv, svv);
  if (Math.abs(M.determinant()) < 1e-12) return 16 / 9;
  const inv = M.clone().invert();
  const a = new THREE.Vector3(); const b = new THREE.Vector3();
  for (let k = 0; k < 3; k += 1) {
    const c = new THREE.Vector3(sp[k], spu[k], spv[k]).applyMatrix3(inv);
    a.setComponent(k, c.y); b.setComponent(k, c.z);
  }
  const r = a.length() / (b.length() || 1);
  return Number.isFinite(r) && r > 0.05 && r < 20 ? r : 16 / 9;
}

const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - ((-2 * p + 2) ** 3) / 2);

function disposeObject(obj, keep) {
  obj?.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry?.dispose();
    for (const m of [].concat(o.material)) {
      if (!m) continue;
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) if (m[k] && !keep.has(m[k])) m[k].dispose?.();
      m.dispose?.();
    }
  });
}

/** An imported model (a loaded Object3D) as a device: scaled to `size` cm, its screen part showing the picture. */
export function buildModel(object, { screenMesh, size = 25 } = {}) {
  const group = new THREE.Group();
  const obj = object.clone(true);
  const box = new THREE.Box3().setFromObject(obj);
  const dims = box.getSize(new THREE.Vector3());
  obj.scale.multiplyScalar(size / (Math.max(dims.x, dims.y, dims.z) || 1));
  group.add(obj);
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material?.clone(); } });
  group.updateMatrixWorld(true);
  const target = screenMesh ? group.getObjectByName(screenMesh) : null;
  const screens = [];
  if (target?.isMesh) {
    target.material = screenMaterial();
    screens.push({ mesh: target, aspect: uvAspect(target), turn: 0, guide: null });
  }
  return { group, screens, lying: false };
}

export class MockupStage {
  constructor(container, { onCamera, onSelect, onMove } = {}) {
    this.container = container;
    this.onCamera = onCamera;
    this.onSelect = onSelect;
    this.onMove = onMove;
    this.frameAspect = 16 / 9;
    this.dirty = true;
    this.items = new Map(); // id → { holder, group, screens, content, fit, adjust, screenOpts, … }
    this.selected = null;
    this.anim = { preset: 'none', duration: 6, easing: 'ease' };
    this.playing = null;
    this.radius = 20;

    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.setClearColor(0x000000, 0);
    r.domElement.className = 'mk-canvas';
    container.appendChild(r.domElement);
    this.renderer = r;

    const scene = new THREE.Scene();
    this.pmrem = new THREE.PMREMGenerator(r);
    this.envTexture = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = this.envTexture;
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 5;
    scene.add(key, key.target, new THREE.HemisphereLight(0xffffff, 0x3a3a40, 0.35));
    this.key = key;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.ShadowMaterial({ opacity: 0.3 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    this.floor = floor;
    // pivot (at the scene's centre, animated) → root (offset back) → one holder per device
    this.pivot = new THREE.Group();
    this.root = new THREE.Group();
    this.pivot.add(this.root);
    scene.add(this.pivot);
    this.selBox = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color('#2ec5d3'));
    this.selBox.visible = false;
    scene.add(this.selBox);
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 8000);
    this.camera.position.set(0, 10, 60);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 600;
    this.controls.addEventListener('change', () => { this.dirty = true; });
    this.controls.addEventListener('end', () => { if (!this.playing) this.onCamera?.(this.getCamera()); });
    this.layout();

    // Click a device to select it; with several, drag one to move it on the floor.
    this.raycaster = new THREE.Raycaster();
    this.onDown = (e) => this.pointerDown(e);
    r.domElement.addEventListener('pointerdown', this.onDown, { capture: true });

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    r.setAnimationLoop(() => this.tick());
  }

  tick() {
    if (this.exporting) return;
    if (this.playing) this.pose(this.anim.preset === 'none' ? null : ((performance.now() - this.playing.start) / 1000) % this.anim.duration);
    else this.controls.update();
    const video = this.videos.some((v) => !v.paused);
    if (this.dirty || video || this.playing) {
      this.renderer.render(this.scene, this.camera);
      this.dirty = false;
    }
  }

  /** The canvas takes the frame's aspect, as large as fits the container. */
  resize() {
    if (this.exporting) return;
    const cw = this.container.clientWidth || 1; const ch = this.container.clientHeight || 1;
    let w = cw; let h = cw / this.frameAspect;
    if (h > ch) { h = ch; w = ch * this.frameAspect; }
    this.renderer.setSize(Math.max(1, Math.floor(w)), Math.max(1, Math.floor(h)));
    this.camera.aspect = this.frameAspect;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  setFrame(key) {
    this.frameAspect = FRAMES[key] || 16 / 9;
    this.resize();
  }

  // ---- Devices ---------------------------------------------------------------------
  /**
   * Put a device into the scene, or update it: `key` names what it is (it is
   * rebuilt with `build()` → { group, screens, lying } only when that
   * changes), x / z / rotY where it stands.
   */
  setItem(id, { key, build, x = 0, z = 0, rotY = 0, screenOpts }) {
    let it = this.items.get(id);
    if (!it) {
      it = { id, holder: new THREE.Group(), content: null, fit: 'cover', adjust: null, screenOpts: { turn: 0, flipV: false, mirror: false } };
      this.root.add(it.holder);
      this.items.set(id, it);
    }
    if (it.key !== key) {
      if (it.group) { it.holder.remove(it.group); disposeObject(it.group, this.contentTextures()); }
      const built = build();
      const g = built.group;
      g.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(g);
      const c = box.getCenter(new THREE.Vector3());
      g.position.x -= c.x; g.position.z -= c.z; g.position.y -= box.min.y; // centred on its footprint, on the floor
      g.traverse((o) => { if (o.isMesh) o.userData.itemId = id; });
      it.holder.add(g);
      Object.assign(it, { key, group: g, screens: built.screens, lying: !!built.lying });
    }
    if (screenOpts) it.screenOpts = { turn: 0, flipV: false, mirror: false, ...screenOpts };
    it.holder.position.set(x, 0, z);
    it.holder.rotation.y = THREE.MathUtils.degToRad(rotY);
    this.applyItem(it);
    this.layout();
    return it;
  }

  /** Remove every device not in `ids`. */
  keep(ids) {
    const want = new Set(ids);
    for (const [id, it] of this.items) {
      if (want.has(id)) continue;
      this.root.remove(it.holder);
      this.dropContent(it);
      disposeObject(it.group, this.contentTextures());
      this.items.delete(id);
      if (this.selected === id) this.selected = null;
    }
    this.layout();
  }

  /** A device's size on the floor and its height (cm), as it stands now. */
  itemSize(id) {
    const it = this.items.get(id);
    if (!it?.group) return null;
    this.scene.updateMatrixWorld(true);
    const s = new THREE.Box3().setFromObject(it.group).getSize(new THREE.Vector3());
    return { w: s.x, d: s.z, h: s.y };
  }

  contentTextures() { return new Set([...this.items.values()].map((it) => it.content?.texture).filter(Boolean)); }

  /** Where things are: bounds, the points views frame, the pivot, light and shadow reach. */
  layout() {
    const pivotRot = this.pivot.rotation.clone(); const pivotY = this.pivot.position.y;
    this.pivot.rotation.set(0, 0, 0);
    this.root.position.set(0, 0, 0); this.pivot.position.set(0, 0, 0);
    this.scene.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const points = [];
    for (const it of this.items.values()) {
      if (!it.group) continue;
      box.expandByObject(it.group);
      it.group.traverse((o) => {
        if (!o.isMesh || !o.visible || points.length > 12000) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const b = o.geometry.boundingBox;
        for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) points.push(new THREE.Vector3(x, y, z).applyMatrix4(o.matrixWorld));
      });
    }
    if (box.isEmpty()) box.set(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 20, 10));
    this.bounds = box;
    this.fitPoints = points;
    const c = box.getCenter(new THREE.Vector3());
    this.pivot.position.set(c.x, pivotY, c.z);
    this.root.position.set(-c.x, 0, -c.z);
    this.pivot.rotation.copy(pivotRot);
    // Light and shadow cover the whole scene, however big.
    const radius = Math.max(20, box.getBoundingSphere(new THREE.Sphere()).radius);
    this.radius = radius;
    const sc = this.key.shadow.camera;
    sc.left = -radius * 1.4; sc.right = radius * 1.4; sc.top = radius * 1.4; sc.bottom = -radius * 1.4;
    sc.near = 1; sc.far = radius * 8;
    sc.updateProjectionMatrix();
    this.key.position.set(c.x - radius * 0.7, radius * 1.9, c.z + radius * 1.2);
    this.key.target.position.set(c.x, 0, c.z);
    this.controls.maxDistance = Math.max(600, radius * 12);
    // Depth precision follows the scene's size (no flicker on a big TV).
    this.camera.near = Math.max(0.5, radius * 0.04);
    this.camera.far = Math.max(3000, radius * 80);
    this.camera.updateProjectionMatrix();
    this.updateSelection();
    this.dirty = true;
  }

  // ---- Selecting and moving devices ------------------------------------------------
  select(id) {
    this.selected = id && this.items.has(id) ? id : null;
    this.updateSelection();
  }

  updateSelection() {
    const it = this.selected ? this.items.get(this.selected) : null;
    const show = !!it?.group && this.items.size > 1 && !this.exporting && !this.playing;
    this.selBox.visible = show;
    if (show) { this.scene.updateMatrixWorld(true); this.selBox.box.setFromObject(it.group); }
    this.dirty = true;
  }

  ndcOf(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  }

  hit(ndc) {
    this.raycaster.setFromCamera(ndc, this.camera);
    const meshes = [];
    for (const it of this.items.values()) it.group?.traverse((o) => { if (o.isMesh && o.visible) meshes.push(o); });
    return this.raycaster.intersectObjects(meshes, false)[0]?.object.userData.itemId || null;
  }

  floorPoint(ndc) {
    this.raycaster.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p) ? p : null;
  }

  pointerDown(e) {
    if (this.playing || this.exporting || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const ndc = this.ndcOf(e);
    const id = this.hit(ndc);
    if (!id) return;
    if (id !== this.selected) { this.select(id); this.onSelect?.(id); }
    if (this.items.size < 2) return;
    // Drag it along the floor (the camera stays put meanwhile).
    const it = this.items.get(id);
    const start = this.floorPoint(ndc);
    if (!start) return;
    this.controls.enabled = false;
    const el = this.renderer.domElement;
    el.setPointerCapture?.(e.pointerId);
    const from = it.holder.position.clone();
    let moved = false;
    const move = (ev) => {
      const p = this.floorPoint(this.ndcOf(ev));
      if (!p) return;
      moved = true;
      it.holder.position.set(from.x + p.x - start.x, 0, from.z + p.z - start.z);
      this.updateSelection();
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      this.controls.enabled = true;
      if (moved) {
        const pos = { x: Math.round(it.holder.position.x * 10) / 10, z: Math.round(it.holder.position.z * 10) / 10 };
        this.layout();
        this.onMove?.(id, pos);
      }
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  // ---- Screen content --------------------------------------------------------------
  dropContent(it) {
    const c = it.content;
    it.content = null; it.contentUrl = null;
    if (!c) return;
    if ([...this.items.values()].some((x) => x !== it && x.content === c)) return; // still shown elsewhere
    c.texture?.dispose();
    if (c.video) { c.video.pause(); c.video.removeAttribute('src'); c.video.load(); }
  }

  /** Show a picture / video ({ url, kind }) on a device, or nothing (null). Resolves once loaded. */
  async setItemContent(id, content) {
    const it = this.items.get(id);
    if (!it) return;
    const url = content?.url || null;
    if (url === (it.contentUrl || null) && (it.content || !url)) return;
    this.dropContent(it);
    it.contentUrl = url;
    const token = (it.contentToken = (it.contentToken || 0) + 1);
    if (!url) { this.applyItem(it); return; }
    // The same file on another device: share its texture.
    const same = [...this.items.values()].find((x) => x !== it && x.contentUrl === url && x.content);
    if (same) { it.content = same.content; this.applyItem(it); return; }
    it.loading = true;
    try {
      let next;
      if (content.kind === 'video') {
        const video = document.createElement('video');
        Object.assign(video, { src: url, muted: true, loop: true, playsInline: true, crossOrigin: 'anonymous', preload: 'auto' });
        await new Promise((resolve, reject) => {
          video.addEventListener('loadeddata', resolve, { once: true });
          video.addEventListener('error', () => reject(new Error('The video can’t be played here')), { once: true });
        });
        if (!this.paused) video.play().catch(() => {});
        const texture = new THREE.VideoTexture(video);
        texture.colorSpace = THREE.SRGBColorSpace;
        next = { texture, video, aspect: (video.videoWidth || 16) / (video.videoHeight || 9) };
      } else {
        const texture = await new THREE.TextureLoader().loadAsync(url);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        next = { texture, aspect: (texture.image?.width || 16) / (texture.image?.height || 9) };
      }
      if (token !== it.contentToken || !this.items.has(id)) { next.texture.dispose(); next.video?.pause(); return; }
      it.content = next;
      this.applyItem(it);
    } finally { if (token === it.contentToken) it.loading = false; }
  }

  get loadingContent() { return [...this.items.values()].some((it) => it.loading); }

  setItemFit(id, fit, adjust) {
    const it = this.items.get(id);
    if (!it) return;
    it.fit = fit === 'contain' ? 'contain' : 'cover';
    it.adjust = adjust || null;
    this.applyItem(it);
  }

  applyItem(it) {
    for (const s of it.screens || []) {
      fitScreen(s.mesh.material, it.content?.texture || null, {
        screenAspect: s.aspect, contentAspect: it.content?.aspect || 1, turn: s.turn + (it.screenOpts?.turn || 0),
        fit: it.fit, adjust: it.adjust, flipV: it.screenOpts?.flipV, mirror: it.screenOpts?.mirror,
      });
    }
    this.dirty = true;
  }

  /** What the fitter needs to know about a device's screen. */
  screenInfo(id) {
    const it = this.items.get(id);
    const s = it?.screens?.[0];
    if (!s) return null;
    return {
      aspect: s.aspect, turn: s.turn + (it.screenOpts?.turn || 0), guide: s.guide || null,
      contentAspect: it.content?.aspect || null,
    };
  }

  /** An imported model's parts (mesh names), and which of them look like a logo. */
  parts(id) {
    const it = this.items.get(id);
    const out = [];
    const screens = new Set((it?.screens || []).map((s) => s.mesh));
    it?.group?.traverse((o) => {
      if (!o.isMesh || !o.name || screens.has(o) || out.some((p) => p.name === o.name)) return;
      out.push({ name: o.name, logo: isLogoPart(o.name) || isLogoPart([].concat(o.material)[0]?.name) });
    });
    return out;
  }

  /** Hide parts of an imported model — by name, and its logo parts unless `logo`. */
  setItemParts(id, { hidden = [], logo = true } = {}) {
    const it = this.items.get(id);
    if (!it?.group) return;
    const off = new Set(hidden);
    const screens = new Set((it.screens || []).map((s) => s.mesh));
    it.group.traverse((o) => {
      if (!o.isMesh || screens.has(o)) return;
      const isLogo = isLogoPart(o.name) || isLogoPart([].concat(o.material)[0]?.name);
      o.visible = !off.has(o.name) && (logo || !isLogo);
    });
    this.layout();
  }

  get videos() { return [...new Set([...this.items.values()].map((it) => it.content?.video).filter(Boolean))]; }

  setPaused(paused) {
    this.paused = paused;
    for (const v of this.videos) { if (paused) v.pause(); else v.play().catch(() => {}); }
    this.dirty = true;
  }

  // ---- Look --------------------------------------------------------------------------
  setBackground({ mode, color, color2 }) {
    this.bg = { mode, color, color2 };
    this.scene.background?.dispose?.();
    if (mode === 'color') this.scene.background = new THREE.Color(color);
    else if (mode === 'gradient') {
      const c = document.createElement('canvas');
      c.width = 4; c.height = 512;
      const ctx = c.getContext('2d');
      const g = ctx.createLinearGradient(0, 0, 0, 512);
      g.addColorStop(0, color2); g.addColorStop(1, color);
      ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 512);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      this.scene.background = t;
    } else this.scene.background = null;
    this.dirty = true;
  }

  setShadow(on) { this.floor.visible = !!on; this.key.castShadow = !!on; this.dirty = true; }

  // ---- Camera -------------------------------------------------------------------------
  getCamera() {
    return { position: this.camera.position.toArray().map((x) => Math.round(x * 1000) / 1000), target: this.controls.target.toArray().map((x) => Math.round(x * 1000) / 1000), fov: this.camera.fov };
  }

  setCamera({ position, target, fov }) {
    if (fov) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    if (target) this.controls.target.fromArray(target);
    if (position) this.camera.position.fromArray(position);
    this.controls.update();
    this.dirty = true;
  }

  /** Look from a preset direction, with the devices filling the frame. */
  view(name) {
    if (!this.bounds) return;
    const all = [...this.items.values()];
    const set = all.length && all.every((it) => it.lying) ? LYING_VIEWS : VIEWS;
    const dir = new THREE.Vector3(...(set[name] || set.front)).normalize();
    const center = this.bounds.getCenter(new THREE.Vector3());
    const corners = this.fitPoints?.length ? this.fitPoints : [];
    if (!corners.length) for (const x of [this.bounds.min.x, this.bounds.max.x]) for (const y of [this.bounds.min.y, this.bounds.max.y]) for (const z of [this.bounds.min.z, this.bounds.max.z]) corners.push(new THREE.Vector3(x, y, z));
    const p = new THREE.Vector3();
    let dist = this.bounds.getBoundingSphere(new THREE.Sphere()).radius * 3;
    this.camera.fov = 30;
    this.camera.aspect = this.frameAspect;
    this.camera.updateProjectionMatrix();
    // Move back until the devices fill ~80% of the frame, and shift the aim
    // so they sit in the middle of the picture.
    const right = new THREE.Vector3(); const upv = new THREE.Vector3();
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    for (let i = 0; i < 8; i += 1) {
      this.camera.position.copy(center).addScaledVector(dir, dist);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(center);
      this.camera.updateMatrixWorld(true);
      let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
      for (const c of corners) {
        p.copy(c).project(this.camera);
        x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
      }
      right.setFromMatrixColumn(this.camera.matrixWorld, 0); upv.setFromMatrixColumn(this.camera.matrixWorld, 1);
      center.addScaledVector(right, ((x0 + x1) / 2) * dist * tan * this.frameAspect).addScaledVector(upv, ((y0 + y1) / 2) * dist * tan);
      dist *= Math.max(0.3, Math.max((x1 - x0) / 2, (y1 - y0) / 2) / 0.8);
    }
    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.controls.target.copy(center);
    this.controls.update();
    this.dirty = true;
  }

  // ---- Animation --------------------------------------------------------------------
  setAnimation(anim) { this.anim = { preset: 'none', duration: 6, easing: 'ease', ...anim }; }

  /**
   * The scene at `t` seconds into the animation (null = at rest). Devices
   * turn / float around the scene's centre; camera moves start from the
   * camera you set.
   */
  pose(t) {
    const run = this.playing || this.exporting;
    const base = run?.base;
    this.pivot.rotation.set(0, 0, 0);
    this.pivot.position.y = 0;
    if (base) {
      this.controls.target.copy(base.target);
      this.camera.position.copy(base.target).addScaledVector(base.position.clone().sub(base.target), t == null ? 1 : run.zoom || 1);
    }
    const { preset, duration, easing } = this.anim;
    if (t != null && preset !== 'none' && base) {
      const p = Math.min(1, Math.max(0, t / duration));
      const e = easing === 'linear' ? p : ease(p);
      const turn = p * Math.PI * 2;
      const offset = base.position.clone().sub(base.target).multiplyScalar(run.zoom || 1);
      if (preset === 'turntable') this.pivot.rotation.y = turn;
      else if (preset === 'sway') this.pivot.rotation.y = Math.sin(turn) * THREE.MathUtils.degToRad(22);
      else if (preset === 'float') {
        this.pivot.position.y = (1 - Math.cos(turn)) * 0.5 * Math.max(1, this.radius * 0.06);
        this.pivot.rotation.set(Math.sin(turn) * 0.035, Math.sin(turn + 1) * 0.12, Math.sin(turn * 2) * 0.02);
      } else if (preset === 'orbit') {
        offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(-30 + 60 * e));
        this.camera.position.copy(base.target).add(offset);
      } else if (preset === 'push') {
        this.camera.position.copy(base.target).addScaledVector(offset, 1.22 - 0.34 * e);
      } else if (preset === 'reveal') {
        this.pivot.rotation.y = THREE.MathUtils.degToRad(-75) * (1 - e);
        this.camera.position.copy(base.target).addScaledVector(offset, 1.3 - 0.3 * e);
      }
    }
    this.camera.lookAt(this.controls.target);
    this.dirty = true;
  }

  get animating() { return !!this.playing; }

  /**
   * Turning / swaying devices show sides the view wasn't framed for: how much
   * further back the camera has to be so nothing leaves the picture.
   */
  animZoom(base) {
    const { preset } = this.anim;
    const angles = preset === 'turntable' ? Array.from({ length: 16 }, (_, i) => i * 22.5) : preset === 'sway' ? [-22, -11, 0, 11, 22] : null;
    if (!angles || !this.fitPoints?.length) return preset === 'float' ? 1.05 : 1;
    const c = this.bounds.getCenter(new THREE.Vector3());
    const cam = this.camera.clone();
    cam.position.copy(base.position); cam.lookAt(base.target); cam.updateMatrixWorld(true);
    const p = new THREE.Vector3(); const axis = new THREE.Vector3(0, 1, 0);
    let worst = 0;
    const step = Math.max(1, Math.floor(this.fitPoints.length / 1500));
    for (const a of angles) {
      const rad = THREE.MathUtils.degToRad(a);
      for (let i = 0; i < this.fitPoints.length; i += step) {
        p.copy(this.fitPoints[i]).sub(c).applyAxisAngle(axis, rad).add(c).project(cam);
        if (p.z < 1) worst = Math.max(worst, Math.abs(p.x), Math.abs(p.y));
      }
    }
    return Math.min(3, Math.max(1, worst / 0.92));
  }

  play() {
    if (this.playing) return;
    this.playing = { start: performance.now(), base: { position: this.camera.position.clone(), target: this.controls.target.clone() } };
    this.playing.zoom = this.animZoom(this.playing.base);
    this.controls.enabled = false;
    this.updateSelection();
  }

  stop() {
    if (!this.playing) return;
    this.pose(null);
    this.playing = null;
    this.controls.enabled = true;
    this.controls.update();
    this.updateSelection();
  }

  // ---- Export --------------------------------------------------------------------------
  maxExport() {
    const gl = this.renderer.getContext();
    return Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), gl.getParameter(gl.MAX_VIEWPORT_DIMS)[0], 8192);
  }

  /** Render at width × height from now on (and with another background, if given); returns restore(). */
  beginRender(width, height, background) {
    const r = this.renderer;
    const prev = { size: r.getSize(new THREE.Vector2()), ratio: r.getPixelRatio(), bg: this.bg };
    const k = Math.min(1, this.maxExport() / Math.max(width, height));
    r.setPixelRatio(1);
    r.setSize(Math.round(width * k), Math.round(height * k), false);
    this.selBox.visible = false;
    if (background && prev.bg) this.setBackground(background);
    return () => {
      if (background && prev.bg) this.setBackground(prev.bg);
      r.setPixelRatio(prev.ratio);
      r.setSize(prev.size.x, prev.size.y, false);
      this.updateSelection();
      this.dirty = true;
    };
  }

  /** Render the frame at width × height → PNG (or `type`) Blob; `background` overrides the scene's. */
  toBlob(width, height, type = 'image/png', quality, background) {
    const restore = this.beginRender(width, height, background);
    this.renderer.render(this.scene, this.camera);
    // toBlob copies the pixels right away, so the canvas can go back to its size at once.
    const blob = new Promise((res) => this.renderer.domElement.toBlob(res, type, quality));
    restore();
    return blob;
  }

  /**
   * Render the animation frame by frame for a video: `onFrame(canvas, t, i,
   * count)` is awaited after each frame is drawn (video pictures on screens
   * are moved to that moment first).
   */
  async renderFrames({ width, height, fps, duration, background, onFrame, signal }) {
    if (this.playing) this.stop();
    const base = { position: this.camera.position.clone(), target: this.controls.target.clone() };
    const videos = this.videos;
    const wasPaused = videos.map((v) => v.paused);
    videos.forEach((v) => v.pause());
    this.exporting = { base };
    this.exporting.zoom = this.animZoom(base);
    this.controls.enabled = false;
    const restore = this.beginRender(width, height, background);
    try {
      const frames = Math.max(1, Math.round(duration * fps));
      for (let i = 0; i < frames; i += 1) {
        if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
        const t = i / fps;
        this.pose(this.anim.preset === 'none' ? null : t);
        await Promise.all(videos.map((v) => new Promise((resolve) => {
          const at = v.duration ? t % v.duration : 0;
          if (Math.abs(v.currentTime - at) < 0.0005) { resolve(); return; }
          const timer = setTimeout(() => done(), 2000);
          function done() { clearTimeout(timer); v.removeEventListener('seeked', done); resolve(); }
          v.addEventListener('seeked', done);
          v.currentTime = at;
        })));
        for (const it of this.items.values()) if (it.content?.video) it.content.texture.needsUpdate = true;
        this.renderer.render(this.scene, this.camera);
        await onFrame(this.renderer.domElement, t, i, frames);
      }
    } finally {
      this.pose(null);
      this.exporting = null;
      restore();
      this.camera.position.copy(base.position);
      this.controls.target.copy(base.target);
      this.controls.enabled = true;
      this.controls.update();
      videos.forEach((v, i) => { if (!wasPaused[i]) v.play().catch(() => {}); });
      this.resize();
    }
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.renderer.domElement.removeEventListener('pointerdown', this.onDown, { capture: true });
    this.ro.disconnect();
    this.controls.dispose();
    for (const it of this.items.values()) { this.dropContent(it); disposeObject(it.group, new Set()); }
    this.items.clear();
    this.scene.background?.dispose?.();
    this.envTexture.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

/** Load an imported model file (.glb / .gltf / .usdz) → Object3D and its mesh names. */
export async function loadModel(url, format) {
  let object;
  if (format === 'usdz') {
    const { USDLoader } = await import('three/examples/jsm/loaders/USDLoader.js');
    object = await new USDLoader().loadAsync(url);
  } else {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    object = (await new GLTFLoader().loadAsync(url)).scene;
  }
  const meshes = [];
  object.traverse((o) => { if (o.isMesh) { if (!o.name) o.name = `mesh-${meshes.length + 1}`; meshes.push(o.name); } });
  return { object, meshes: [...new Set(meshes)] };
}

/** A likely screen mesh by name ("Screen", "Display", "LCD"…). */
export const guessScreen = (meshes) => meshes.find((n) => /screen|display|lcd/i.test(n)) || '';
