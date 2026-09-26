// Light for the mockup stage: HDR environments ("HDRIs") generated right
// here — a photo studio, a dark product set, a living room with windows, a
// golden-hour sky, an overcast day, an office, a neon night — plus the direct
// lights that go with each, and a soft contact shadow under the devices.
import * as THREE from 'three';
import { HorizontalBlurShader } from 'three/examples/jsm/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/examples/jsm/shaders/VerticalBlurShader.js';

const D = Math.PI / 180;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const scale = (c, k) => c.map((v) => v * k);
// A direction from azimuth (0 = in front, from where the camera usually looks;
// negative = left, positive = right, 180 = behind) and elevation (degrees).
const dir = (az, el) => new THREE.Vector3(Math.sin(az * D) * Math.cos(el * D), Math.sin(el * D), Math.cos(az * D) * Math.cos(el * D));

// A soft-edged rectangular light (softbox, window, strip) seen from the centre.
function area({ az, el, w, h, color, power, soft = 2, bars = 0 }) {
  const c = dir(az, el);
  const up0 = Math.abs(c.y) > 0.95 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
  const r = new THREE.Vector3().crossVectors(up0, c).normalize();
  const u = new THREE.Vector3().crossVectors(c, r).normalize();
  const hw = (w / 2) * D; const hh = (h / 2) * D; const s = soft * D;
  const col = scale(color, power);
  return (d, out) => {
    const z = d.dot(c);
    if (z <= 0) return;
    const a = Math.atan2(d.dot(r), z); const b = Math.atan2(d.dot(u), z);
    let m = (1 - smooth(hw - s, hw + s, Math.abs(a))) * (1 - smooth(hh - s, hh + s, Math.abs(b)));
    if (m <= 0) return;
    if (bars) { // window frames: a cross of dark bars
      const bw = 0.6 * D;
      if (Math.abs(a) < bw || Math.abs(b) < bw) m *= 0.08;
    }
    out[0] += col[0] * m; out[1] += col[1] * m; out[2] += col[2] * m;
  };
}
// The sun: a small, very bright disc with a glow around it.
function sun({ az, el, color, power, size = 1.2, glow = 0.08 }) {
  const c = dir(az, el);
  return (d, out) => {
    const ang = Math.acos(Math.min(1, Math.max(-1, d.dot(c)))) / D;
    const disc = 1 - smooth(size * 0.8, size, ang);
    const halo = Math.exp(-ang / 9) * glow + Math.exp(-ang / 2.2) * glow * 4;
    const k = disc * power + halo * power * 0.02;
    out[0] += color[0] * k; out[1] += color[1] * k; out[2] += color[2] * k;
  };
}
// The room / sky itself: floor, walls / horizon, ceiling / zenith by height.
function room({ floor, wall, ceiling, horizon = null }) {
  return (d, out) => {
    const y = d.y;
    let c;
    if (y < 0) c = mix(horizon || wall, floor, smooth(0, 0.25, -y));
    else c = mix(horizon || wall, ceiling, smooth(0.05, 0.75, y));
    if (horizon && y >= 0) c = mix(horizon, ceiling, Math.pow(smooth(0, 1, y), 0.55));
    out[0] += c[0]; out[1] += c[1]; out[2] += c[2];
  };
}

/**
 * The light setups. `env` paints the environment; `lights` are the direct
 * lights (az / el as above, `shadow` = the one that casts the hard "sun"
 * shadow); `exposure` for the camera; `contact` how dark / soft the contact
 * shadow is.
 */
export const LIGHT_SETUPS = {
  studio: {
    label: 'Studio',
    note: 'Soft boxes on a grey set — clean and even',
    exposure: 1,
    env: [
      room({ floor: [0.02, 0.02, 0.022], wall: [0.035, 0.035, 0.04], ceiling: [0.05, 0.05, 0.055] }),
      area({ az: 0, el: 72, w: 70, h: 40, color: [1, 1, 1], power: 5, soft: 6 }),
      area({ az: -48, el: 22, w: 26, h: 36, color: [1, 0.98, 0.96], power: 13, soft: 3 }),
      area({ az: 62, el: 14, w: 20, h: 32, color: [0.95, 0.97, 1], power: 3.2, soft: 3 }),
      area({ az: 165, el: 18, w: 8, h: 48, color: [1, 1, 1], power: 9, soft: 2 }),
    ],
    lights: [
      { az: -48, el: 48, color: [1, 0.98, 0.95], intensity: 1.5, shadow: true },
      { az: 60, el: 20, color: [0.9, 0.95, 1], intensity: 0.35 },
    ],
    contact: { opacity: 0.55, blur: 3.2 },
  },
  product: {
    label: 'Dark product',
    note: 'Black set with strip lights — edges and metal glow',
    exposure: 1.1,
    env: [
      room({ floor: [0.004, 0.004, 0.005], wall: [0.006, 0.006, 0.008], ceiling: [0.01, 0.01, 0.012] }),
      area({ az: -118, el: 12, w: 5, h: 60, color: [1, 1, 1], power: 24, soft: 1.5 }),
      area({ az: 118, el: 12, w: 5, h: 60, color: [1, 1, 1], power: 24, soft: 1.5 }),
      area({ az: 0, el: 82, w: 36, h: 18, color: [1, 1, 1], power: 3, soft: 5 }),
      area({ az: 0, el: 4, w: 44, h: 6, color: [1, 1, 1], power: 0.9, soft: 3 }),
    ],
    lights: [
      { az: 180, el: 60, color: [1, 1, 1], intensity: 0.9, shadow: true },
      { az: -115, el: 15, color: [1, 1, 1], intensity: 0.7 },
      { az: 115, el: 15, color: [1, 1, 1], intensity: 0.7 },
    ],
    contact: { opacity: 0.7, blur: 2.4 },
  },
  daylight: {
    label: 'Daylight room',
    note: 'A bright room, windows on the left, sun on the floor',
    exposure: 0.95,
    env: [
      room({ floor: [0.2, 0.14, 0.09], wall: [0.34, 0.31, 0.28], ceiling: [0.42, 0.41, 0.4] }),
      area({ az: -62, el: 14, w: 22, h: 30, color: [0.82, 0.9, 1], power: 9, soft: 1, bars: 1 }),
      area({ az: -102, el: 14, w: 22, h: 30, color: [0.82, 0.9, 1], power: 9, soft: 1, bars: 1 }),
      area({ az: -58, el: -38, w: 26, h: 12, color: [1, 0.9, 0.75], power: 2.4, soft: 6 }),
      area({ az: 90, el: 5, w: 60, h: 30, color: [0.6, 0.55, 0.5], power: 0.5, soft: 20 }),
    ],
    lights: [
      { az: -72, el: 34, color: [1, 0.93, 0.82], intensity: 2.2, shadow: true },
      { az: 70, el: 25, color: [0.85, 0.9, 1], intensity: 0.35 },
    ],
    contact: { opacity: 0.45, blur: 3.5 },
  },
  golden: {
    label: 'Golden hour',
    note: 'Low warm sun, long shadows, blue sky above',
    exposure: 0.9,
    env: [
      room({ floor: [0.16, 0.1, 0.06], wall: [0.3, 0.22, 0.18], ceiling: [0.18, 0.28, 0.55], horizon: [1.6, 0.8, 0.38] }),
      sun({ az: -68, el: 7, color: [1, 0.58, 0.28], power: 700, size: 1.4 }),
    ],
    lights: [
      { az: -68, el: 12, color: [1, 0.62, 0.38], intensity: 3, shadow: true },
      { az: 110, el: 40, color: [0.45, 0.58, 1], intensity: 0.35 },
    ],
    contact: { opacity: 0.4, blur: 3 },
  },
  overcast: {
    label: 'Overcast',
    note: 'Even sky light, very soft shadows',
    exposure: 0.95,
    env: [
      room({ floor: [0.12, 0.12, 0.12], wall: [1, 1.03, 1.08], ceiling: [1.6, 1.65, 1.75], horizon: [1, 1.03, 1.08] }),
    ],
    lights: [{ az: -20, el: 75, color: [1, 1, 1], intensity: 0.55, shadow: true }],
    contact: { opacity: 0.5, blur: 4.5 },
  },
  office: {
    label: 'Office',
    note: 'Ceiling panels, grey walls, a window wall',
    exposure: 1,
    env: [
      room({ floor: [0.09, 0.09, 0.1], wall: [0.24, 0.25, 0.27], ceiling: [0.2, 0.2, 0.21] }),
      ...[[0, 58], [40, 60], [-40, 60], [0, 84], [140, 60], [-140, 60], [90, 70], [-90, 70]].map(([az, el]) => (
        area({ az, el, w: 12, h: 7, color: [1, 1, 0.98], power: 8, soft: 0.8 }))),
      area({ az: 95, el: 10, w: 70, h: 16, color: [0.78, 0.86, 1], power: 4, soft: 1, bars: 1 }),
    ],
    lights: [
      { az: -25, el: 70, color: [1, 1, 0.97], intensity: 1.1, shadow: true },
      { az: 95, el: 15, color: [0.85, 0.9, 1], intensity: 0.45 },
    ],
    contact: { opacity: 0.5, blur: 3.2 },
  },
  neon: {
    label: 'Neon night',
    note: 'Dark, with pink and cyan tubes',
    exposure: 1.05,
    env: [
      room({ floor: [0.006, 0.006, 0.012], wall: [0.01, 0.01, 0.025], ceiling: [0.02, 0.012, 0.05] }),
      area({ az: -100, el: 14, w: 4, h: 56, color: [1, 0.12, 0.62], power: 20, soft: 1.2 }),
      area({ az: 100, el: 14, w: 4, h: 56, color: [0.1, 0.8, 1], power: 20, soft: 1.2 }),
      area({ az: 0, el: 80, w: 60, h: 30, color: [0.4, 0.2, 1], power: 1.4, soft: 12 }),
    ],
    lights: [
      { az: -95, el: 20, color: [1, 0.2, 0.65], intensity: 1.3 },
      { az: 95, el: 20, color: [0.15, 0.8, 1], intensity: 1.3 },
      { az: 0, el: 70, color: [0.8, 0.8, 1], intensity: 0.35, shadow: true },
    ],
    contact: { opacity: 0.6, blur: 2.6 },
  },
};

/** Paint a setup's environment into an equirectangular HDR texture (half-float). */
export function makeEnvironment(key, width = 1024) {
  const setup = LIGHT_SETUPS[key] || LIGHT_SETUPS.studio;
  const w = width; const h = width / 2;
  const data = new Uint16Array(w * h * 4);
  const d = new THREE.Vector3();
  const out = [0, 0, 0];
  const toHalf = THREE.DataUtils.toHalfFloat;
  for (let j = 0; j < h; j += 1) {
    const theta = ((j + 0.5) / h - 0.5) * Math.PI; // elevation
    const ct = Math.cos(theta); const st = Math.sin(theta);
    for (let i = 0; i < w; i += 1) {
      const phi = ((i + 0.5) / w - 0.5) * Math.PI * 2;
      d.set(ct * Math.cos(phi), st, ct * Math.sin(phi));
      out[0] = 0; out[1] = 0; out[2] = 0;
      for (const f of setup.env) f(d, out);
      const k = (j * w + i) * 4;
      data[k] = toHalf(Math.min(out[0], 60000)); data[k + 1] = toHalf(Math.min(out[1], 60000)); data[k + 2] = toHalf(Math.min(out[2], 60000)); data[k + 3] = toHalf(1);
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export const lightDir = (az, el, rotation = 0) => dir(az + rotation, el);

/**
 * A soft shadow under the devices, as if they stood on the floor in soft
 * light: the scene seen from below (depth → darkness), blurred, on a plane.
 */
export class ContactShadow {
  constructor(res = 512) {
    this.group = new THREE.Group();
    this.rt = new THREE.WebGLRenderTarget(res, res); this.rt.texture.generateMipmaps = false;
    this.rtBlur = new THREE.WebGLRenderTarget(res, res); this.rtBlur.texture.generateMipmaps = false;
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(Math.PI / 2);
    this.plane = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.rt.texture, transparent: true, depthWrite: false, opacity: 0.5 }));
    this.plane.renderOrder = 1;
    this.plane.scale.y = -1;
    this.blurPlane = new THREE.Mesh(geo);
    this.blurPlane.visible = false;
    this.camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1);
    this.camera.rotation.x = Math.PI / 2;
    this.group.add(this.plane, this.blurPlane, this.camera);
    const depth = new THREE.MeshDepthMaterial();
    depth.userData.darkness = { value: 1.4 };
    depth.onBeforeCompile = (shader) => {
      shader.uniforms.darkness = depth.userData.darkness;
      shader.fragmentShader = `uniform float darkness;\n${shader.fragmentShader.replace('gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );', 'gl_FragColor = vec4( vec3( 0.0 ), ( 1.0 - fragCoordZ ) * darkness );')}`;
    };
    depth.depthTest = false; depth.depthWrite = false;
    this.depth = depth;
    this.hBlur = new THREE.ShaderMaterial(HorizontalBlurShader); this.hBlur.depthTest = false;
    this.vBlur = new THREE.ShaderMaterial(VerticalBlurShader); this.vBlur.depthTest = false;
    this.blur = 3;
  }

  /** Cover a floor area of `size` cm around (x, z), catching what is up to `height` cm above it. */
  fit(x, z, size, height) {
    this.group.position.set(x, 0.02, z);
    // y = -1 turns the plane's face up (as in three.js' contact-shadow example)
    this.plane.scale.set(size, -1, size);
    this.blurPlane.scale.set(size, 1, size);
    Object.assign(this.camera, { left: -size / 2, right: size / 2, top: size / 2, bottom: -size / 2, near: 0, far: height });
    this.camera.updateProjectionMatrix();
    this.size = size;
  }

  set({ opacity, blur }) {
    this.plane.material.opacity = opacity;
    this.blur = blur;
  }

  blurPass(renderer, amount) {
    this.blurPlane.visible = true;
    this.blurPlane.material = this.hBlur;
    this.hBlur.uniforms.tDiffuse.value = this.rt.texture;
    this.hBlur.uniforms.h.value = amount / 256;
    renderer.setRenderTarget(this.rtBlur); renderer.render(this.blurPlane, this.camera);
    this.blurPlane.material = this.vBlur;
    this.vBlur.uniforms.tDiffuse.value = this.rtBlur.texture;
    this.vBlur.uniforms.v.value = amount / 256;
    renderer.setRenderTarget(this.rt); renderer.render(this.blurPlane, this.camera);
    this.blurPlane.visible = false;
  }

  /** Re-draw the shadow; `hide` = objects that must not cast it (floor, helpers). */
  update(renderer, scene, hide = []) {
    if (!this.group.visible) return;
    const bg = scene.background; const env = scene.environment;
    scene.background = null;
    const was = hide.map((o) => o.visible);
    hide.forEach((o) => { o.visible = false; });
    this.plane.visible = false;
    scene.overrideMaterial = this.depth;
    const alpha = renderer.getClearAlpha(); const color = renderer.getClearColor(new THREE.Color());
    const rt = renderer.getRenderTarget();
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scene, this.camera);
    scene.overrideMaterial = null;
    this.blurPass(renderer, this.blur);
    this.blurPass(renderer, this.blur * 0.4);
    renderer.setRenderTarget(rt);
    renderer.setClearColor(color, alpha);
    hide.forEach((o, i) => { o.visible = was[i]; });
    this.plane.visible = true;
    scene.background = bg; scene.environment = env;
  }

  dispose() {
    this.rt.dispose(); this.rtBlur.dispose();
    this.plane.geometry.dispose(); this.plane.material.dispose();
    this.depth.dispose(); this.hBlur.dispose(); this.vBlur.dispose();
  }
}
