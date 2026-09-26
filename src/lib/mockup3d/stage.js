// The 3D stage of the mockup editor: renderer, lights, floor shadow, camera
// with orbit controls, one or more devices (built-in or imported models), each
// with a picture or video on its screen, the background, animations and
// rendering for PNG / video export.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { clone as cloneWithSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { screenMaterial, fitScreen } from './screen.js';
import { LIGHT_SETUPS, makeEnvironment, lightDir, ContactShadow } from './lighting.js';
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
export const MOTIONS_LABELS = { none: 'None', turntable: 'Turntable 360°', sway: 'Sway', float: 'Float' };
export const CAMERA_MOVES = { orbit: 'Orbit', push: 'Push in', pull: 'Pull out', reveal: 'Reveal', rise: 'Rise' };
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
const MOTIONS = new Set(['turntable', 'sway', 'float']);

/** A keyframed value at time t: [{ t, v }] eased between keys. */
export function valueAt(keys, t, easing = 'ease') {
  if (!keys?.length) return null;
  if (t <= keys[0].t) return keys[0].v;
  const last = keys[keys.length - 1];
  if (t >= last.t) return last.v;
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t <= t) i += 1;
  const a = keys[i]; const b = keys[i + 1];
  const p = (t - a.t) / Math.max(1e-6, b.t - a.t);
  const e = easing === 'linear' ? p : ease(p);
  return a.v + (b.v - a.v) * e;
}
// The camera at time t between its keyframes: the target moves straight, the
// camera swings around it (so an orbit stays an arc), lens eased.
function cameraAt(keys, t, easing) {
  const at = (k) => ({ position: new THREE.Vector3().fromArray(k.position), target: new THREE.Vector3().fromArray(k.target), fov: k.fov || 30 });
  if (keys.length === 1 || t <= keys[0].t) return at(keys[0]);
  const last = keys[keys.length - 1];
  if (t >= last.t) return at(last);
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t <= t) i += 1;
  const a = at(keys[i]); const b = at(keys[i + 1]);
  const p = (t - keys[i].t) / Math.max(1e-6, keys[i + 1].t - keys[i].t);
  const e = easing === 'linear' ? p : ease(p);
  const target = a.target.clone().lerp(b.target, e);
  const sa = new THREE.Spherical().setFromVector3(a.position.clone().sub(a.target));
  const sb = new THREE.Spherical().setFromVector3(b.position.clone().sub(b.target));
  let dTheta = sb.theta - sa.theta;
  if (dTheta > Math.PI) dTheta -= Math.PI * 2;
  if (dTheta < -Math.PI) dTheta += Math.PI * 2;
  const s = new THREE.Spherical(sa.radius + (sb.radius - sa.radius) * e, sa.phi + (sb.phi - sa.phi) * e, sa.theta + dTheta * e);
  return { position: target.clone().add(new THREE.Vector3().setFromSpherical(s)), target, fov: a.fov + (b.fov - a.fov) * e };
}

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

/**
 * The parts of an imported model that can turn with what's under them — an
 * empty / group / bone such as a lid's hinge ("Rotate Screen") — and a good
 * guess which one opens the screen.
 */
export function modelJoints(object, screenMesh) {
  const out = [];
  object.traverse((o) => {
    if (o === object || o.isMesh || !o.name) return;
    let meshes = 0;
    o.traverse((c) => { if (c.isMesh) meshes += 1; });
    if (meshes) out.push({ name: o.name, meshes, bone: !!o.isBone, hasScreen: !!(screenMesh && o.getObjectByName(screenMesh)) });
  });
  const named = out.find((j) => /hinge|rotate|lid|open|screen/i.test(j.name));
  const screenPart = out.filter((j) => j.hasScreen).sort((a, b) => a.meshes - b.meshes)[0];
  return { joints: out.map((j) => j.name), guess: named?.name || screenPart?.name || '' };
}

/**
 * How a hinge most likely turns: around the longest side of what it carries
 * (a lid's width), and — when it carries the screen — which way opens it
 * (the screen turns up), so "more" on the slider always means "more open".
 */
export function guessHinge(object, node, screenMesh) {
  const j = object.getObjectByName(node);
  if (!j) return { node, axis: 'x', invert: false };
  object.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(j.matrixWorld).invert();
  const box = new THREE.Box3();
  j.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    box.union(o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)));
  });
  const s = box.getSize(new THREE.Vector3());
  const axis = s.x >= s.y && s.x >= s.z ? 'x' : s.y >= s.z ? 'y' : 'z';
  let invert = false;
  const screen = screenMesh ? j.getObjectByName(screenMesh) : null;
  const nor = screen?.geometry?.attributes?.normal;
  if (nor) {
    const local = new THREE.Vector3();
    for (let i = 0; i < nor.count; i += Math.max(1, Math.floor(nor.count / 200))) local.add(new THREE.Vector3().fromBufferAttribute(nor, i));
    const normalY = () => { object.updateMatrixWorld(true); return local.clone().transformDirection(screen.matrixWorld).y; };
    const rest = j.quaternion.clone();
    const before = normalY();
    j.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0), 0.1));
    const after = normalY();
    j.quaternion.copy(rest);
    object.updateMatrixWorld(true);
    invert = after < before; // turning "+" would close it
  }
  return { node, axis, invert };
}
export const guessHingeAxis = (object, node) => guessHinge(object, node).axis;

/** An imported model (a loaded Object3D) as a device: scaled to `size` cm, its screen part showing the picture. */
export function buildModel(object, { screenMesh, size = 25 } = {}) {
  const group = new THREE.Group();
  // Skinned parts (rigged lids…) need their own copy of the skeleton, or
  // they stay behind in the file's pose while the rest moves.
  const obj = cloneWithSkeleton(object);
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
    this.envCache = new Map(); // setup → { equirect, pmrem }
    this.hdris = new Map();    // your HDRI id → { equirect, pmrem, info }
    // Direct lights of the light setup (the first with `shadow` casts the hard shadow).
    this.lights = [0, 1, 2].map(() => {
      const l = new THREE.DirectionalLight(0xffffff, 0);
      l.shadow.mapSize.set(2048, 2048);
      l.shadow.bias = -0.0004; l.shadow.normalBias = 0.02; l.shadow.radius = 4;
      scene.add(l, l.target);
      return l;
    });
    this.key = this.lights[0];
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.ShadowMaterial({ opacity: 0.3 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    this.floor = floor;
    this.contact = new ContactShadow(512);
    scene.add(this.contact.group);
    this.light = { setup: 'studio', rotation: 0, exposure: 1, shadow: 'contact', strength: 0.6 };
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
    this.setLight(this.light);
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
    if (this.playing) {
      const t = (performance.now() - this.playing.start) / 1000;
      const d = this.anim.duration;
      if (t >= d) { // loop: back to the start, screen videos too
        this.playing.start = performance.now();
        this.syncVideos(0, true);
      }
      this.time = Math.min(t, d);
      this.pose(this.time);
      this.onTime?.(this.time);
    } else this.controls.update();
    const video = this.videos.some((v) => !v.paused);
    if (this.dirty || video || this.playing) this.draw();
  }

  /** Render a frame (the contact shadow first). */
  draw() {
    if (this.contact.group.visible) this.contact.update(this.renderer, this.scene, [this.floor, this.selBox]);
    this.renderer.render(this.scene, this.camera);
    this.dirty = false;
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
      Object.assign(it, { key, group: g, screens: built.screens, lying: !!built.lying, hinge: null, hingeSpec: null });
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
    this.center = c;
    this.placeLights();
    const size = box.getSize(new THREE.Vector3());
    this.contact.fit(c.x, c.z, Math.max(size.x, size.z) * 1.9 + 10, Math.max(8, size.y * 0.9));
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

  // ---- Hinges (a lid that opens / closes) and per-device timeline settings -----------
  /** The hinge of an imported model: { node, axis: 'x'|'y'|'z', invert } or null. */
  setItemHinge(id, spec) {
    const it = this.items.get(id);
    if (!it?.group) return;
    const same = JSON.stringify(spec || null) === JSON.stringify(it.hingeSpec || null);
    if (same && (it.hinge || !spec)) return;
    if (it.hinge) it.hinge.obj.quaternion.copy(it.hinge.rest);
    it.hinge = null; it.hingeSpec = spec || null;
    const obj = spec?.node ? it.group.getObjectByName(spec.node) : null;
    if (obj) {
      const axis = new THREE.Vector3(spec.axis === 'x' ? 1 : 0, spec.axis === 'y' ? 1 : 0, spec.axis === 'z' ? 1 : 0);
      it.hinge = { obj, rest: obj.quaternion.clone(), axis, sign: spec.invert ? -1 : 1 };
    }
    this.applyHinge(it, this.time ?? null);
    this.layout();
  }

  /** { hingeAngle, hingeKeys, videoStart, sound, volume } of a device. */
  setItemTimeline(id, opts) {
    const it = this.items.get(id);
    if (!it) return;
    Object.assign(it, opts);
    this.applyHinge(it, this.time ?? null);
    const v = it.content?.video;
    if (v) { v.muted = !it.sound; v.volume = it.volume ?? 1; }
    this.dirty = true;
  }

  applyHinge(it, t) {
    if (!it.hinge) return;
    const keyed = t != null && it.hingeKeys?.length ? valueAt(it.hingeKeys, t, this.anim.easing) : null;
    const angle = keyed ?? (it.hingeAngle || 0);
    it.hinge.obj.quaternion.copy(it.hinge.rest).multiply(new THREE.Quaternion().setFromAxisAngle(it.hinge.axis, it.hinge.sign * THREE.MathUtils.degToRad(angle)));
    this.dirty = true;
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
    if (this.scene.background?.isTexture && !this.scene.background.userData.env) this.scene.background.dispose();
    this.scene.backgroundBlurriness = 0;
    this.scene.backgroundIntensity = 1;
    if (mode === 'environment') {
      // The light setup's own room / sky (or your HDRI), softly out of focus.
      const env = this.currentEnv();
      if (env) { env.equirect.userData.env = true; this.scene.background = env.equirect; }
      this.scene.backgroundBlurriness = this.light?.blur ?? 0.35;
      this.scene.backgroundIntensity = env?.info?.intensity ?? 1;
    } else if (mode === 'color') this.scene.background = new THREE.Color(color);
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

  // ---- Light ---------------------------------------------------------------------------
  /** { setup, rotation (°), exposure, shadow: 'contact' | 'sun' | 'both' | 'none', strength 0–1 } */
  setLight(light) {
    this.light = { ...this.light, ...light };
    const setup = this.currentSetup();
    const env = this.currentEnv();
    this.scene.environment = env.pmrem;
    this.scene.environmentIntensity = env.info?.intensity ?? 1;
    const rot = THREE.MathUtils.degToRad(this.light.rotation || 0);
    this.scene.environmentRotation.set(0, rot, 0);
    this.scene.backgroundRotation.set(0, rot, 0);
    this.renderer.toneMappingExposure = (setup.exposure || 1) * (this.light.exposure || 1);
    const mode = this.light.shadow;
    const k = this.light.strength ?? 0.6;
    this.contact.group.visible = mode === 'contact' || mode === 'both';
    this.contact.set({ opacity: Math.min(1, (setup.contact?.opacity || 0.5) * k * 1.6), blur: setup.contact?.blur || 3 });
    this.floor.visible = mode === 'sun' || mode === 'both';
    this.floor.material.opacity = 0.45 * k * 1.4;
    this.placeLights();
    if (this.bg?.mode === 'environment') this.setBackground(this.bg);
    this.dirty = true;
  }

  /** The environment in use: a built-in setup's (made on first use) or your HDRI once it's loaded. */
  currentEnv() {
    if (this.light.setup === 'hdri') {
      const h = this.hdris.get(this.light.hdri);
      if (h) return h;
    }
    const key = LIGHT_SETUPS[this.light.setup] ? this.light.setup : 'studio';
    let env = this.envCache.get(key);
    if (!env) {
      const equirect = makeEnvironment(key);
      env = { equirect, pmrem: this.pmrem.fromEquirectangular(equirect).texture };
      this.envCache.set(key, env);
    }
    return env;
  }

  /** The direct lights, exposure and contact shadow of the setup in use (your HDRI: read from it). */
  currentSetup() {
    if (this.light?.setup === 'hdri') {
      const h = this.hdris.get(this.light.hdri);
      if (h) return { exposure: 1, lights: h.info.lights, contact: h.info.contact };
    }
    return LIGHT_SETUPS[this.light?.setup] || LIGHT_SETUPS.studio;
  }

  /** Hand over one of your HDRIs (loaded by the editor): `texture` from loadHdriTexture. */
  addHdri(id, texture, info) {
    if (this.hdris.has(id)) return;
    this.hdris.set(id, { equirect: texture, pmrem: this.pmrem.fromEquirectangular(texture).texture, info });
    if (this.light.setup === 'hdri' && this.light.hdri === id) this.setLight({});
  }

  placeLights() {
    const setup = this.currentSetup();
    const c = this.center || new THREE.Vector3();
    const r = this.radius || 20;
    const castSun = this.light.shadow === 'sun' || this.light.shadow === 'both';
    const shadowIdx = setup.lights.findIndex((x) => x.shadow);
    this.lights.forEach((l, i) => {
      const spec = setup.lights[i];
      l.visible = !!spec;
      if (!spec) return;
      l.color.setRGB(...spec.color);
      l.intensity = spec.intensity;
      const d = lightDir(spec.az, spec.el, this.light.rotation || 0);
      l.position.copy(c).addScaledVector(d, r * 3);
      l.target.position.copy(c);
      l.castShadow = castSun && i === shadowIdx;
      const sc = l.shadow.camera;
      sc.left = -r * 1.5; sc.right = r * 1.5; sc.top = r * 1.5; sc.bottom = -r * 1.5;
      sc.near = r * 0.2; sc.far = r * 7;
      sc.updateProjectionMatrix();
    });
    this.dirty = true;
  }

  setShadow(on) { this.setLight({ shadow: on ? (this.light.shadow === 'none' ? 'contact' : this.light.shadow) : 'none' }); }

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

  // ---- Timeline -------------------------------------------------------------------
  // The scene at a time of the animation: camera keyframes, the scene's motion
  // (turntable / sway / float), each hinge's keyframes; screen videos run from
  // their chosen start. `time` is the playhead; `null` = at rest.
  setAnimation(anim) {
    this.anim = { preset: 'none', duration: 6, easing: 'ease', camera: [], ...anim };
    if (this.time != null) this.time = Math.min(this.time, this.anim.duration);
    this.pose(this.time ?? null);
  }

  pose(t) {
    this.pivot.rotation.set(0, 0, 0);
    this.pivot.position.y = 0;
    const { preset, duration, easing, camera } = this.anim;
    if (t != null && camera?.length) {
      const k = cameraAt(camera, t, easing);
      this.camera.position.copy(k.position);
      this.controls.target.copy(k.target);
      if (Math.abs(this.camera.fov - k.fov) > 0.01) { this.camera.fov = k.fov; this.camera.updateProjectionMatrix(); }
      this.camera.lookAt(k.target);
    }
    if (t != null && MOTIONS.has(preset)) {
      const p = Math.min(1, Math.max(0, t / duration));
      const turn = p * Math.PI * 2;
      if (preset === 'turntable') this.pivot.rotation.y = turn;
      else if (preset === 'sway') this.pivot.rotation.y = Math.sin(turn) * THREE.MathUtils.degToRad(22);
      else if (preset === 'float') {
        this.pivot.position.y = (1 - Math.cos(turn)) * 0.5 * Math.max(1, this.radius * 0.06);
        this.pivot.rotation.set(Math.sin(turn) * 0.035, Math.sin(turn + 1) * 0.12, Math.sin(turn * 2) * 0.02);
      }
    }
    for (const it of this.items.values()) this.applyHinge(it, t);
    this.dirty = true;
  }

  /** Move the playhead (and the screen videos with it). */
  seek(t) {
    this.time = Math.min(this.anim.duration, Math.max(0, t));
    if (this.playing) this.playing.start = performance.now() - this.time * 1000;
    this.pose(this.time);
    this.syncVideos(this.time, !!this.playing);
  }

  /** Screen videos to their moment of the timeline; sound as each device says. */
  syncVideos(t, play) {
    const done = new Set();
    for (const it of this.items.values()) {
      const v = it.content?.video;
      if (!v || done.has(v)) continue;
      done.add(v);
      v.muted = !it.sound; v.volume = it.volume ?? 1;
      if (v.duration) v.currentTime = ((it.videoStart || 0) + t) % v.duration;
      if (play) v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); else v.pause();
    }
    this.dirty = true;
  }

  get animating() { return !!this.playing; }

  play() {
    if (this.playing) return;
    if ((this.time ?? 0) >= this.anim.duration - 0.02) this.time = 0;
    this.playing = { start: performance.now() - (this.time || 0) * 1000 };
    if (this.anim.camera?.length) this.controls.enabled = false;
    this.syncVideos(this.time || 0, true);
    this.updateSelection();
  }

  stop() {
    if (!this.playing) return;
    this.playing = null;
    this.controls.enabled = true;
    this.controls.update();
    for (const v of this.videos) v.pause();
    this.updateSelection();
    this.dirty = true;
  }

  /**
   * Turning / swaying devices show sides the view wasn't framed for: step the
   * camera back so nothing leaves the picture. Returns the new camera.
   */
  fitMotion(preset) {
    const angles = preset === 'turntable' ? Array.from({ length: 16 }, (_, i) => i * 22.5) : preset === 'sway' ? [-22, -11, 0, 11, 22] : null;
    if (!angles || !this.fitPoints?.length) return null;
    const c = this.bounds.getCenter(new THREE.Vector3());
    this.camera.updateMatrixWorld(true);
    const p = new THREE.Vector3(); const axis = new THREE.Vector3(0, 1, 0);
    let worst = 0;
    const step = Math.max(1, Math.floor(this.fitPoints.length / 1500));
    for (const a of angles) {
      const rad = THREE.MathUtils.degToRad(a);
      for (let i = 0; i < this.fitPoints.length; i += step) {
        p.copy(this.fitPoints[i]).sub(c).applyAxisAngle(axis, rad).add(c).project(this.camera);
        if (p.z < 1) worst = Math.max(worst, Math.abs(p.x), Math.abs(p.y));
      }
    }
    const k = Math.min(3, Math.max(1, worst / 0.9));
    if (k > 1.01) {
      const off = this.camera.position.clone().sub(this.controls.target).multiplyScalar(k);
      this.camera.position.copy(this.controls.target).add(off);
      this.controls.update();
      this.dirty = true;
    }
    return this.getCamera();
  }

  /** Camera keyframes for a camera move (orbit, push in, reveal, rise) from the current view. */
  cameraMove(kind, duration) {
    const target = this.controls.target.clone();
    const off = this.camera.position.clone().sub(target);
    const at = (angle, dist = 1, lift = 0) => {
      const o = off.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(angle)).multiplyScalar(dist);
      o.y += lift * off.length();
      return { position: target.clone().add(o).toArray().map((x) => Math.round(x * 1000) / 1000), target: target.toArray().map((x) => Math.round(x * 1000) / 1000), fov: this.camera.fov };
    };
    const moves = {
      orbit: [at(-30), at(30)],
      push: [at(0, 1.22), at(0, 0.88)],
      pull: [at(0, 0.85), at(0, 1.2)],
      reveal: [at(-75, 1.3), at(0, 1)],
      rise: [at(0, 1, -0.25), at(0, 1, 0.3)],
    };
    const [a, b] = moves[kind] || moves.orbit;
    return [{ t: 0, ...a }, { t: duration, ...b }];
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
    this.draw();
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
    this.controls.enabled = false;
    const restore = this.beginRender(width, height, background);
    try {
      const frames = Math.max(1, Math.round(duration * fps));
      for (let i = 0; i < frames; i += 1) {
        if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
        const t = i / fps;
        this.pose(t);
        await Promise.all(videos.map((v) => new Promise((resolve) => {
          const start = [...this.items.values()].find((it) => it.content?.video === v)?.videoStart || 0;
          const at = v.duration ? (start + t) % v.duration : 0;
          if (Math.abs(v.currentTime - at) < 0.0005) { resolve(); return; }
          const timer = setTimeout(() => done(), 2000);
          function done() { clearTimeout(timer); v.removeEventListener('seeked', done); resolve(); }
          v.addEventListener('seeked', done);
          v.currentTime = at;
        })));
        for (const it of this.items.values()) if (it.content?.video) it.content.texture.needsUpdate = true;
        this.draw();
        await onFrame(this.renderer.domElement, t, i, frames);
      }
    } finally {
      this.exporting = null;
      this.pose(this.time ?? null);
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
    if (this.scene.background?.isTexture && !this.scene.background.userData.env) this.scene.background.dispose();
    for (const env of [...this.envCache.values(), ...this.hdris.values()]) { env.equirect.dispose(); env.pmrem.dispose(); }
    this.contact.dispose();
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
