// Mockups: 3D scenes, devices, branding objects, 2D mockups, imported models and HDRIs.
// Part of the record shapes (see ../schema.js, which re-exports all of it).
import { nanoid } from 'nanoid';
import { num, str } from './base.js';

// ---------------------------------------------------------------------------
// Mockups — saved 3D device scenes, and 3D models imported by the user
// ---------------------------------------------------------------------------
export const MOCKUP_DEVICES = ['iphone', 'android', 'ipad', 'macbook', 'imac', 'watch', 'tv', 'browser', 'custom', 'object'];
export const MOCKUP_OBJECTS = ['card', 'poster', 'box', 'mug'];
export const MOCKUP_FRAMES = ['16:9', '4:5', '1:1', '9:16', '3:2', 'auto'];
export const MOCKUP_ANIMATIONS = ['none', 'turntable', 'sway', 'float', 'orbit', 'push', 'reveal'];
export const MOCKUP_LIGHTS = ['studio', 'product', 'daylight', 'golden', 'overcast', 'office', 'neon', 'hdri'];
export const MOCKUP_2D = ['browser', 'ig-post', 'ig-story', 'ig-profile', 'x-post', 'x-profile', 'app-icon', 'avatars', 'yt-channel', 'li-page'];
const MOCKUP_BG = ['transparent', 'color', 'gradient', 'environment'];
const SHADOWS = ['contact', 'sun', 'both', 'none'];
const TONES = ['neutral', 'filmic', 'soft'];
       // how the render is developed (tone mapping)
const GLASSES = ['glossy', 'antiglare', 'off'];
    // a screen's cover glass
const KEY_NAME = /^[a-zA-Z][\w-]{0,30}$/;
// Keyframes: [{ t (s), v }] sorted by time.
const keyList = (list, min, max) => (Array.isArray(list) ? list : [])
  .filter((k) => k && Number.isFinite(Number(k.t)) && Number.isFinite(Number(k.v)))
  .slice(0, 200)
  .map((k) => ({ t: num(k.t, 0, 600, 0), v: num(k.v, min, max, 0) }))
  .sort((a, b) => a.t - b.t);
const MAX_MOCKUP_ITEMS = 8;
const HEX6 = /^#[0-9a-f]{6}$/i;
const vec3 = (v, fallback) => (Array.isArray(v) && v.length === 3 && v.every((x) => Number.isFinite(Number(x)))
  ? v.map((x) => Math.max(-1e4, Math.min(1e4, Number(x)))) : fallback);
const mockupFile = (v) => (typeof v === 'string' && /^[\w.-]+$/.test(v) ? v : null);
const mockupContent = (c) => (c && mockupFile(c.file)
  ? { file: c.file, kind: c.kind === 'video' ? 'video' : 'image', name: str(c.name, 200) } : null);
const DEVICE_FIELDS = ['device', 'modelId', 'color', 'landscape', 'lying', 'lid', 'url', 'fit', 'content', 'adjust'];
const mapOf = (o, pick) => Object.fromEntries(Object.entries(o && typeof o === 'object' && !Array.isArray(o) ? o : {})
  .filter(([k]) => KEY_NAME.test(k)).slice(0, 80).map(([k, v]) => [k, pick(v)]).filter(([, v]) => v !== undefined));
// A picture with its own fit / size / position (a 2D slot, an object's printed face).
const placedContent = (v) => {
  const c = mockupContent(v);
  if (!c) return undefined;
  const adj = v.adjust && typeof v.adjust === 'object' ? v.adjust : {};
  return {
    ...c, fit: v.fit === 'contain' ? 'contain' : 'cover', adjust: { scale: num(adj.scale, 0.05, 8, 1), x: num(adj.x, -3, 3, 0), y: num(adj.y, -3, 3, 0) },
    ...(c.kind === 'video' ? { sound: !!v.sound, volume: num(v.volume, 0, 1, 1) } : {}), // a video's sound (2D mockups)
  };
};
// A branding object (device 'object'): business card, poster, box or mug and how it's made.
export function normalizeObject(o) {
  if (!o || typeof o !== 'object') return null;
  const pick = (v, list, d) => (list.includes(v) ? v : d);
  return {
    type: pick(o.type, MOCKUP_OBJECTS, 'card'),
    size: str(o.size, 20),                  // card: eu | us | square; poster: a4 … a1, 50x70, 18x24, 24x36
    landscape: !!o.landscape,
    color: HEX6.test(o.color || '') ? o.color : '#F4F2EE',   // paper / card / mug
    color2: HEX6.test(o.color2 || '') ? o.color2 : '#E9E7E2', // poster wall / mug inside
    finish: pick(o.finish, ['matte', 'silk', 'gloss'], 'matte'),
    radius: num(o.radius, 0, 10, 0),        // card corners (mm)
    layout: pick(o.layout, ['single', 'pair', 'stack'], 'pair'),
    frame: pick(o.frame, ['none', 'black', 'white', 'oak', 'alu'], 'black'),
    mat: o.mat !== false,                   // poster passe-partout
    placement: pick(o.placement, ['wall', 'lean', 'free'], 'wall'),
    w: num(o.w, 1, 200, 12), h: num(o.h, 1, 200, 18), d: num(o.d, 0.5, 200, 5), // box (cm)
    material: pick(o.material, ['white', 'kraft', 'black'], 'white'),
    wrap: pick(o.wrap, ['front', 'full'], 'front'), // mug print
  };
}
// One device in a scene: what it is, how it looks, what's on its screen (and
// how the picture sits in it), where it stands on the floor.
export function normalizeMockupItem(it, i = 0) {
  const adj = it?.adjust && typeof it.adjust === 'object' ? it.adjust : {};
  return {
    id: str(it?.id, 40) || `d${i + 1}`,
    device: MOCKUP_DEVICES.includes(it?.device) ? it.device : 'iphone',
    modelId: it?.modelId ? str(it.modelId, 40) : null,
    color: str(it?.color, 40),
    landscape: !!it?.landscape,
    lying: !!it?.lying, // phone / tablet lying flat, screen up
    lid: num(it?.lid, 0, 180, 112),
    url: str(it?.url, 200),
    fit: it?.fit === 'contain' ? 'contain' : 'cover',
    content: mockupContent(it?.content),
    // The picture's size (1 = filling / fitting the screen) and where its
    // centre sits, in screen widths / heights from the middle (x → right, y → down).
    adjust: { scale: num(adj.scale, 0.05, 8, 1), x: num(adj.x, -3, 3, 0), y: num(adj.y, -3, 3, 0) },
    logo: it?.logo !== false,               // imported models: show their logo parts
    hidden: Array.isArray(it?.hidden) ? it.hidden.map((x) => str(x, 200)).filter(Boolean).slice(0, 200) : [],
    size: num(it?.size, 1, 500, 25),        // imported models: longest side in cm
    x: num(it?.x, -1000, 1000, 0),          // position on the floor (cm)
    z: num(it?.z, -1000, 1000, 0),
    rotY: num(it?.rotY, -360, 360, 0),      // turned around its vertical axis (degrees)
    hingeAngle: num(it?.hingeAngle, -360, 360, 0), // imported models: the hinge (e.g. a lid) turned from how the file has it
    keys: { hinge: keyList(it?.keys?.hinge, -360, 360) }, // …and its keyframes on the timeline
    videoStart: num(it?.videoStart, 0, 86400, 0), // a screen video: where in it the animation starts (s)
    sound: !!it?.sound,                     // play / export the screen video's sound
    volume: num(it?.volume, 0, 1, 1),
    glass: GLASSES.includes(it?.glass) ? it.glass : 'glossy', // the screen's cover glass: what it reflects
    reflect: num(it?.reflect, 0, 1, 0.5),   // …how strongly (0.5 = like real glass)
    obj: it?.device === 'object' ? normalizeObject(it?.obj) || normalizeObject({ type: 'card' }) : null,
    // An object's other printed faces (back, sides, top …); its front is `content`.
    faces: mapOf(it?.faces, placedContent),
  };
}
// A 2D mockup (browser window, social posts / profiles): what it is, its
// texts, numbers and switches, and the pictures in its slots.
export function normalize2D(d) {
  return {
    type: MOCKUP_2D.includes(d?.type) ? d.type : 'browser',
    theme: ['light', 'dark', 'dim'].includes(d?.theme) ? d.theme : 'light',
    text: mapOf(d?.text, (v) => (typeof v === 'string' ? v.slice(0, 4000) : undefined)),
    nums: mapOf(d?.nums, (v) => (Number.isFinite(Number(v)) ? Math.max(-1e12, Math.min(1e12, Number(v))) : undefined)),
    flags: mapOf(d?.flags, (v) => (typeof v === 'boolean' ? v : undefined)),
    slots: mapOf(d?.slots, placedContent),
    padding: num(d?.padding, 0, 0.45, 0.08), // space around the mockup (share of the picture's short side)
    shadow: d?.shadow !== false,
    scale: num(d?.scale, 0.2, 2, 1),
  };
}
export function normalizeMockup(m) {
  const cam = m?.camera && typeof m.camera === 'object' ? m.camera : null;
  const bg = m?.background && typeof m.background === 'object' ? m.background : {};
  const anim = m?.animation && typeof m.animation === 'object' ? m.animation : {};
  // Scenes from before several devices were possible keep their one device in
  // the top-level fields — read as the scene's only device.
  const rawItems = Array.isArray(m?.items) && m.items.length ? m.items : [{ ...m, id: 'd1' }];
  const items = rawItems.slice(0, MAX_MOCKUP_ITEMS).map(normalizeMockupItem);
  const seen = new Set();
  for (const [i, it] of items.entries()) { if (seen.has(it.id)) it.id = `d${i + 1}-${nanoid(4)}`; seen.add(it.id); }
  const main = items[0];
  const light = m?.light && typeof m.light === 'object' ? m.light : {};
  const cameraKeys = (Array.isArray(anim.camera) ? anim.camera : []).slice(0, 100)
    .filter((k) => k && Number.isFinite(Number(k.t)) && vec3(k.position, null))
    .map((k) => ({ t: num(k.t, 0, 600, 0), position: vec3(k.position, null), target: vec3(k.target, [0, 0, 0]), fov: num(k.fov, 10, 90, 30) }))
    .sort((a, b) => a.t - b.t);
  return {
    id: str(m?.id, 40) || nanoid(10),
    name: str(m?.name, 120) || 'Untitled mockup',
    kind: m?.kind === '2d' ? '2d' : '3d',
    items,
    // The first device, mirrored at the top for simple readers (lists, older code).
    ...Object.fromEntries(DEVICE_FIELDS.map((k) => [k, main[k]])),
    camera: cam ? { preset: str(cam.preset, 40), position: vec3(cam.position, null), target: vec3(cam.target, [0, 0, 0]), fov: num(cam.fov, 10, 90, 30) } : null,
    frame: MOCKUP_FRAMES.includes(m?.frame) ? m.frame : '16:9',
    background: {
      mode: MOCKUP_BG.includes(bg.mode) ? bg.mode : 'gradient',
      color: HEX6.test(bg.color || '') ? bg.color : '#16161A',
      color2: HEX6.test(bg.color2 || '') ? bg.color2 : '#2A2A33',
    },
    shadow: m?.shadow !== false,
    light: {
      setup: MOCKUP_LIGHTS.includes(light.setup) ? light.setup : 'studio',
      rotation: num(light.rotation, -360, 360, 0),
      exposure: num(light.exposure, 0.2, 3, 1),
      shadow: SHADOWS.includes(light.shadow) ? light.shadow : (m?.shadow === false ? 'none' : 'contact'),
      strength: num(light.strength, 0, 1, 0.6),
      hdri: str(light.hdri, 40),         // your own HDRI (setup 'hdri')
      blur: num(light.blur, 0, 1, 0.35), // how soft the Room background is
      tone: TONES.includes(light.tone) ? light.tone : 'neutral',
    },
    animation: {
      preset: MOCKUP_ANIMATIONS.includes(anim.preset) ? anim.preset : 'none',
      duration: num(anim.duration, 1, 60, 6),
      easing: anim.easing === 'linear' ? 'linear' : 'ease',
      camera: cameraKeys, // camera keyframes on the timeline
    },
    d2: m?.kind === '2d' || m?.d2 ? normalize2D(m?.d2) : null,
    thumb: mockupFile(m?.thumb),
    createdAt: num(m?.createdAt, 0, 1e14, 0),
    updatedAt: num(m?.updatedAt, 0, 1e14, 0),
  };
}
export function normalizeMockupModel(m) {
  return {
    id: str(m?.id, 40) || nanoid(10),
    name: str(m?.name, 120) || '3D model',
    file: mockupFile(m?.file),
    format: ['glb', 'gltf', 'usdz'].includes(m?.format) ? m.format : 'glb',
    size: num(m?.size, 0, 1e13, 0),
    screenMesh: str(m?.screenMesh, 200),
    screenTurn: [0, 90, 180, 270].includes(Number(m?.screenTurn)) ? Number(m.screenTurn) : 0,
    screenFlip: !!m?.screenFlip,
    // The part that opens / closes (a lid's hinge): a node of the model, the
    // axis it turns around (in its own space) and which way is "open".
    // null = not looked at yet (a likely hinge is picked for you), false = none.
    hinge: m?.hinge === false ? false
      : m?.hinge?.node ? { node: str(m.hinge.node, 200), axis: ['x', 'y', 'z'].includes(m.hinge.axis) ? m.hinge.axis : 'x', invert: !!m.hinge.invert } : null,
    createdAt: num(m?.createdAt, 0, 1e14, 0),
  };
}
/** One of your own HDRIs: an .hdr / .exr or a panorama picture, with a small preview. */
export function normalizeMockupHdri(h) {
  return {
    id: str(h?.id, 40) || nanoid(10),
    name: str(h?.name, 120) || 'HDRI',
    file: mockupFile(h?.file),
    format: ['hdr', 'exr', 'jpg', 'png', 'webp', 'avif'].includes(h?.format) ? h.format : 'hdr',
    size: num(h?.size, 0, 1e13, 0),
    thumb: h?.thumb ? mockupFile(h.thumb) : null,
    createdAt: num(h?.createdAt, 0, 1e14, 0),
  };
}
