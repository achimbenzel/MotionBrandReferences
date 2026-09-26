// The 3D stage of the mockup editor: renderer, lights, floor shadow, camera
// with orbit controls, one device (built-in or an imported model) with a
// picture or video on its screen, the background, and PNG export.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildDevice } from './devices.js';
import { screenMaterial, fitScreen } from './screen.js';

export const FRAMES = { '16:9': 16 / 9, '4:5': 4 / 5, '1:1': 1, '9:16': 9 / 16, '3:2': 3 / 2 };

// Camera directions (from the device's centre) for the view presets.
const VIEWS = {
  front: [0, 0.05, 1],
  'three-left': [-0.62, 0.2, 0.76],
  'three-right': [0.62, 0.2, 0.76],
  hero: [0.32, -0.08, 1],
  top: [0.15, 1, 0.7],
  side: [1, 0.12, 0.18],
  back: [-0.4, 0.15, -1],
};
// The same presets for a phone / tablet lying flat (screen up): from above,
// as you'd see it on a table.
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

export class MockupStage {
  constructor(container, { onCamera } = {}) {
    this.container = container;
    this.onCamera = onCamera;
    this.frameAspect = 16 / 9;
    this.dirty = true;
    this.screens = [];
    this.content = null; // { texture, aspect, video }
    this.fit = 'cover';
    this.screenOpts = { turn: 0, flipV: false, mirror: false };

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
    key.position.set(-18, 42, 30);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -45; key.shadow.camera.right = 45; key.shadow.camera.top = 45; key.shadow.camera.bottom = -45;
    key.shadow.camera.near = 1; key.shadow.camera.far = 150;
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 5;
    scene.add(key, new THREE.HemisphereLight(0xffffff, 0x3a3a40, 0.35));
    this.key = key;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.ShadowMaterial({ opacity: 0.3 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    this.floor = floor;
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 3000);
    this.camera.position.set(0, 10, 60);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 400;
    this.controls.addEventListener('change', () => { this.dirty = true; });
    this.controls.addEventListener('end', () => this.onCamera?.(this.getCamera()));

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    r.setAnimationLoop(() => this.tick());
  }

  tick() {
    this.controls.update();
    const video = this.content?.video;
    if (this.dirty || (video && !video.paused)) {
      this.renderer.render(this.scene, this.camera);
      this.dirty = false;
    }
  }

  /** The canvas takes the frame's aspect, as large as fits the container. */
  resize() {
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

  // ---- Device --------------------------------------------------------------------
  clearDevice() {
    if (!this.device) return;
    this.scene.remove(this.device);
    this.device.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry?.dispose();
      for (const m of [].concat(o.material)) {
        if (!m) continue;
        for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) if (m[k] && m[k] !== this.content?.texture) m[k].dispose?.();
        m.dispose?.();
      }
    });
    this.device = null;
    this.screens = [];
  }

  /** A built-in device: { device, color, landscape, lying, lid, url }. */
  setDevice(spec) {
    this.clearDevice();
    const built = buildDevice(spec.device, spec);
    this.place(built.group);
    this.screens = built.screens;
    this.lying = !!built.lying;
    this.screenOpts = { turn: 0, flipV: false, mirror: false };
    this.applyContent();
    return this;
  }

  /**
   * An imported model (a loaded Object3D, used as is). `screenMesh` names the
   * mesh that shows the content; turn / mirror fix its orientation.
   */
  setModel(object, { screenMesh, turn = 0, mirror = false, flipV = false } = {}) {
    this.clearDevice();
    const root = new THREE.Group();
    const obj = object.clone(true);
    // Scale to about 25 cm and stand it on the floor.
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const s = 25 / (Math.max(size.x, size.y, size.z) || 1);
    obj.scale.multiplyScalar(s);
    root.add(obj);
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material?.clone(); } });
    this.place(root);
    this.lying = false;
    this.screens = [];
    const target = screenMesh ? root.getObjectByName(screenMesh) : null;
    if (target?.isMesh) {
      target.material = screenMaterial();
      this.screens = [{ mesh: target, aspect: uvAspect(target), turn: 0 }];
    }
    this.screenOpts = { turn, flipV, mirror };
    this.applyContent();
    return this;
  }

  place(group) {
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    const c = box.getCenter(new THREE.Vector3());
    group.position.x -= c.x; group.position.z -= c.z; group.position.y -= box.min.y;
    this.scene.add(group);
    this.device = group;
    group.updateMatrixWorld(true);
    this.bounds = new THREE.Box3().setFromObject(group);
    // The corners of every part, so a view can frame the real shape (a
    // MacBook's L, not the box around it).
    this.fitPoints = [];
    group.traverse((o) => {
      if (!o.isMesh || this.fitPoints.length > 8000) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox;
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) this.fitPoints.push(new THREE.Vector3(x, y, z).applyMatrix4(o.matrixWorld));
    });
    this.dirty = true;
  }

  // ---- Screen content --------------------------------------------------------------
  /** Show a picture / video ({ url, kind }) or nothing (null). Resolves once loaded. */
  async setContent(content) {
    const prev = this.content;
    this.content = null;
    if (prev) {
      prev.texture?.dispose();
      if (prev.video) { prev.video.pause(); prev.video.removeAttribute('src'); prev.video.load(); }
    }
    const token = (this.contentToken = (this.contentToken || 0) + 1);
    if (!content?.url) { this.loadingContent = false; this.applyContent(); return; }
    this.loadingContent = true;
    try { await this.loadContent(content, token); } finally { if (token === this.contentToken) this.loadingContent = false; }
  }

  async loadContent(content, token) {
    let next;
    if (content.kind === 'video') {
      const video = document.createElement('video');
      Object.assign(video, { src: content.url, muted: true, loop: true, playsInline: true, crossOrigin: 'anonymous', preload: 'auto' });
      await new Promise((resolve, reject) => {
        video.addEventListener('loadeddata', resolve, { once: true });
        video.addEventListener('error', () => reject(new Error('The video can’t be played here')), { once: true });
      });
      video.play().catch(() => {});
      const texture = new THREE.VideoTexture(video);
      texture.colorSpace = THREE.SRGBColorSpace;
      next = { texture, video, aspect: (video.videoWidth || 16) / (video.videoHeight || 9) };
    } else {
      const texture = await new THREE.TextureLoader().loadAsync(content.url);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      next = { texture, aspect: (texture.image?.width || 16) / (texture.image?.height || 9) };
    }
    if (token !== this.contentToken) { next.texture.dispose(); next.video?.pause(); return; }
    this.content = next;
    this.applyContent();
  }

  setFit(fit) { this.fit = fit === 'contain' ? 'contain' : 'cover'; this.applyContent(); }

  applyContent() {
    for (const s of this.screens) {
      fitScreen(s.mesh.material, this.content?.texture || null, {
        screenAspect: s.aspect, contentAspect: this.content?.aspect || 1, turn: s.turn + this.screenOpts.turn,
        fit: this.fit, flipV: this.screenOpts.flipV, mirror: this.screenOpts.mirror,
      });
    }
    this.dirty = true;
  }

  get video() { return this.content?.video || null; }

  // ---- Look --------------------------------------------------------------------------
  setBackground({ mode, color, color2 }) {
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

  /** Look from a preset direction, with the device filling the frame. */
  view(name) {
    if (!this.bounds) return;
    const set = this.lying ? LYING_VIEWS : VIEWS;
    const dir = new THREE.Vector3(...(set[name] || set.front)).normalize();
    const center = this.bounds.getCenter(new THREE.Vector3());
    const corners = this.fitPoints?.length ? this.fitPoints : [];
    if (!corners.length) for (const x of [this.bounds.min.x, this.bounds.max.x]) for (const y of [this.bounds.min.y, this.bounds.max.y]) for (const z of [this.bounds.min.z, this.bounds.max.z]) corners.push(new THREE.Vector3(x, y, z));
    const p = new THREE.Vector3();
    let dist = this.bounds.getBoundingSphere(new THREE.Sphere()).radius * 3;
    this.camera.fov = 30;
    this.camera.aspect = this.frameAspect;
    this.camera.updateProjectionMatrix();
    // Move back until the device fills ~80% of the frame, and shift the aim
    // so it sits in the middle of the picture.
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

  // ---- Export --------------------------------------------------------------------------
  maxExport() {
    const gl = this.renderer.getContext();
    return Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), gl.getParameter(gl.MAX_VIEWPORT_DIMS)[0], 8192);
  }

  /** Render the frame at width × height → PNG (or `type`) Blob. */
  toBlob(width, height, type = 'image/png', quality) {
    const r = this.renderer;
    const size = r.getSize(new THREE.Vector2());
    const ratio = r.getPixelRatio();
    const max = this.maxExport();
    const k = Math.min(1, max / Math.max(width, height));
    r.setPixelRatio(1);
    r.setSize(Math.round(width * k), Math.round(height * k), false);
    r.render(this.scene, this.camera);
    // toBlob copies the pixels right away, so the canvas can go back to its size at once.
    const blob = new Promise((res) => r.domElement.toBlob(res, type, quality));
    r.setPixelRatio(ratio);
    r.setSize(size.x, size.y, false);
    this.dirty = true;
    return blob;
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.ro.disconnect();
    this.controls.dispose();
    this.clearDevice();
    if (this.content) { this.content.texture?.dispose(); this.content.video?.pause(); }
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
