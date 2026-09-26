// Stand-ins for the devices that used to be built in (iPhone, iPad, MacBook …).
// They were removed in favour of your own 3D models; scenes made with them
// still open — as a plain screen of the same shape and size, so the picture
// on it and everything else in the scene stays as it was until you swap in
// one of your models.
import * as THREE from 'three';
import { slab, panel } from './geometry.js';
import { screenMaterial } from './screen.js';

// Body and screen size (cm) and corner radius of each former device.
const SHAPES = {
  iphone: { w: 7.15, h: 14.76, sw: 6.83, sh: 14.44, r: 1.1 },
  android: { w: 7.24, h: 15.24, sw: 6.9, sh: 14.9, r: 0.95 },
  ipad: { w: 17.85, h: 24.95, sw: 16.01, sh: 23.11, r: 1.7 },
  macbook: { w: 31.26, h: 21.6, sw: 30.1, sh: 19.55, r: 1 },
  watch: { w: 3.9, h: 4.6, sw: 3.52, sh: 4.2, r: 1 },
  imac: { w: 54.7, h: 32.5, sw: 52.3, sh: 29.4, r: 1 },
  tv: { w: 144.6, h: 82.9, sw: 143.4, sh: 80.7, r: 0.5 },
  browser: { w: 32, h: 20.8, sw: 31.98, sh: 19.19, r: 0.75 },
};

/** A neutral stand-in: a dark slab with the device's screen. → { group, screens, lying } */
export function buildDevice(device, opts = {}) {
  const s = SHAPES[device] || SHAPES.iphone;
  const d = Math.max(0.5, Math.min(2.5, s.w * 0.06));
  const group = new THREE.Group();
  const body = new THREE.Mesh(slab(s.w, s.h, d, s.r, Math.min(0.1, d / 3)), [
    new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.35, metalness: 0.2 }),
    new THREE.MeshStandardMaterial({ color: '#2a2a2e', roughness: 0.4, metalness: 0.6 }),
  ]);
  const screen = new THREE.Mesh(panel(s.sw, s.sh, Math.max(0.05, s.r * 0.85)), screenMaterial());
  screen.position.z = d / 2 + Math.max(0.005, s.w * 0.0004);
  group.add(body, screen);
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const turned = !!opts.landscape && ['iphone', 'android', 'ipad'].includes(device);
  if (turned) group.rotation.z = Math.PI / 2;
  const wrap = new THREE.Group();
  wrap.add(group);
  const lying = !!opts.lying && ['iphone', 'android', 'ipad'].includes(device);
  if (lying) wrap.rotation.x = -Math.PI / 2;
  if (device === 'macbook' || device === 'imac' || device === 'tv') group.position.y = s.h / 2; // stands up
  return { group: wrap, screens: [{ mesh: screen, aspect: s.sw / s.sh, turn: turned ? 3 : 0, guide: null }], lying };
}
