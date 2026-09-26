// Branding objects for the 3D mockups: a business card, a poster, a box and a
// mug — plain shapes at their real sizes (cm), lit by the scene's light, with
// your designs printed on them. Each has a few printed faces (front, back,
// sides …); every face shows its own picture.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { roundedRect, panel, canvasTexture } from './geometry.js';
import { printMaterial } from './print.js';
import { CARD_SIZES, POSTER_SIZES, FINISHES, POSTER_FRAMES, BOX_MATERIALS, defaultObject } from './catalog.js';

const D = Math.PI / 180;

const finishOf = (o) => FINISHES[o.finish] || FINISHES.matte;
// A few steady "random" numbers so a stack of cards looks the same every time.
const jitter = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; };

// ---- Business card ----------------------------------------------------------------------
function cardMesh(w, h, t, r, o, screens) {
  const g = new THREE.Group();
  const fin = finishOf(o);
  const front = new THREE.Mesh(panel(w, h, Math.max(0.0001, r)), printMaterial({ color: o.color, ...fin }));
  front.position.z = t / 2;
  const back = new THREE.Mesh(panel(w, h, Math.max(0.0001, r)), printMaterial({ color: o.color, ...fin }));
  back.rotation.y = Math.PI; back.position.z = -t / 2;
  const edgeGeo = new THREE.ExtrudeGeometry(roundedRect(w, h, Math.max(0.0001, r)), { depth: t, bevelEnabled: false, curveSegments: 16 });
  edgeGeo.translate(0, 0, -t / 2);
  const edge = new THREE.Mesh(edgeGeo, [new THREE.MeshBasicMaterial({ visible: false }), new THREE.MeshStandardMaterial({ color: o.color, roughness: 0.9 })]);
  g.add(front, back, edge);
  screens.push({ mesh: front, aspect: w / h, turn: 0, face: 'front', print: true }, { mesh: back, aspect: w / h, turn: 0, face: 'back', print: true });
  return g;
}

function card(o, screens) {
  const s = CARD_SIZES[o.size] || CARD_SIZES.eu;
  const [w, h] = o.landscape === false ? [Math.min(s.w, s.h), Math.max(s.w, s.h)] : [Math.max(s.w, s.h), Math.min(s.w, s.h)];
  const t = 0.04; // 400 g/m² board
  const r = Math.min(o.radius || 0, 5) / 10;
  const group = new THREE.Group();
  // Lying flat, the picture's top away from you; showing the back = turned over first.
  const flat = (m, showBack) => { m.rotation.x = -Math.PI / 2; if (showBack) m.rotation.y = Math.PI; return m; };
  if (o.layout === 'single') {
    const c = flat(cardMesh(w, h, t, r, o, screens), false);
    c.rotation.z = -6 * D;
    group.add(c);
  } else if (o.layout === 'stack') {
    for (let i = 0; i < 16; i += 1) {
      const c = flat(cardMesh(w, h, t, r, o, screens), false);
      c.position.set(jitter(i, 1) * 0.08, t * (i + 0.5), jitter(i, 2) * 0.08);
      c.rotation.z = jitter(i, 3) * 1.5 * D;
      group.add(c);
    }
    const loose = flat(cardMesh(w, h, t, r, o, screens), true);
    loose.position.set(w * 1.02, t / 2, h * 0.3);
    loose.rotation.z = 9 * D;
    group.add(loose);
  } else { // pair: the front and the back side by side, overlapping a little
    const a = flat(cardMesh(w, h, t, r, o, screens), false);
    a.position.set(-w * 0.47, t * 1.5, -h * 0.12); a.rotation.z = 7 * D;
    const b = flat(cardMesh(w, h, t, r, o, screens), true);
    b.position.set(w * 0.5, t / 2, h * 0.14); b.rotation.z = 8 * D;
    group.add(a, b);
  }
  return { group, lying: true };
}

// ---- Poster ------------------------------------------------------------------------------
// A soft shadow a frame throws on the wall (drawn once).
let wallShadowTex = null;
function wallShadow() {
  if (!wallShadowTex) {
    wallShadowTex = canvasTexture(256, 256, (x, W, H) => {
      x.filter = 'blur(18px)';
      x.fillStyle = 'rgba(0,0,0,0.9)';
      x.fillRect(W * 0.16, H * 0.16, W * 0.68, H * 0.68);
    }, { srgb: false });
  }
  return wallShadowTex;
}

function poster(o, screens) {
  const s = POSTER_SIZES[o.size] || POSTER_SIZES.a2;
  const [w, h] = o.landscape ? [Math.max(s.w, s.h), Math.min(s.w, s.h)] : [Math.min(s.w, s.h), Math.max(s.w, s.h)];
  const fr = POSTER_FRAMES[o.frame] || POSTER_FRAMES.black;
  const framed = o.frame !== 'none';
  const mat = framed && o.mat ? Math.min(w, h) * 0.09 : 0;
  const bar = framed ? Math.max(1.4, Math.min(3.2, Math.min(w, h) * 0.05)) : 0;
  const depth = framed ? 2.6 : 0.03;
  const W = w + 2 * mat + 2 * bar; const H = h + 2 * mat + 2 * bar;
  const piece = new THREE.Group();

  const art = new THREE.Mesh(panel(w, h, 0.0001), printMaterial({ color: o.color, roughness: 0.75 }));
  art.position.z = framed ? 0.6 : depth / 2;
  screens.push({ mesh: art, aspect: w / h, turn: 0, face: 'front', print: true });
  piece.add(art);
  if (framed) {
    const back = new THREE.Mesh(new THREE.BoxGeometry(W - 0.4, H - 0.4, 0.5), new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.9 }));
    back.position.z = 0.25;
    piece.add(back);
    if (mat) {
      const shape = roundedRect(w + 2 * mat, h + 2 * mat, 0.0001);
      shape.holes.push(roundedRect(w, h, 0.0001));
      const board = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: '#f7f6f2', roughness: 0.9 }));
      board.position.z = 0.6;
      piece.add(board);
    }
    const frameMat = new THREE.MeshStandardMaterial({ color: fr.color, roughness: fr.roughness, metalness: fr.metalness });
    const shape = roundedRect(W, H, 0.0001);
    shape.holes.push(roundedRect(W - 2 * bar, H - 2 * bar, 0.0001));
    const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.15, bevelSegments: 2 }), frameMat);
    piece.add(frame);
    // The glass: barely there, but it catches the room.
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(W - 2 * bar, H - 2 * bar), new THREE.MeshPhysicalMaterial({
      color: '#ffffff', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.1, depthWrite: false, envMapIntensity: 2.2,
    }));
    glass.position.z = depth - 0.3;
    glass.userData.noShadow = true;
    piece.add(glass);
  } else {
    // The sheet's edges and back; its front is the printed panel (no second surface in the same place).
    const paper = new THREE.MeshStandardMaterial({ color: o.color, roughness: 0.8 });
    const sheet = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), [paper, paper, paper, paper, new THREE.MeshBasicMaterial({ visible: false }), paper]);
    piece.add(sheet);
  }

  const group = new THREE.Group();
  const place = o.placement || 'wall';
  if (place === 'free') {
    piece.position.y = H / 2;
    group.add(piece);
    return { group, lying: false };
  }
  // A wall behind (left out of the framing, the shadow and the selection box).
  const wallW = Math.max(W * 4, 260); const wallH = Math.max(H * 2.8, 260);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(wallW, wallH), new THREE.MeshStandardMaterial({ color: o.color2 || '#E9E7E2', roughness: 0.95 }));
  wall.receiveShadow = true;
  wall.userData.backdrop = true;
  wall.position.set(0, wallH / 2, 0);
  group.add(wall);
  if (place === 'lean') {
    const tilt = 6 * D;
    piece.rotation.x = -tilt;
    piece.position.set(0, (H / 2) * Math.cos(tilt), (H / 2) * Math.sin(tilt) + 0.3);
  } else {
    piece.position.set(0, Math.max(H / 2 + 25, 95), 0.4);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.5, H * 1.5), new THREE.MeshBasicMaterial({ map: wallShadow(), transparent: true, opacity: 0.35, depthWrite: false, color: '#000' }));
    sh.position.set(0, piece.position.y - 1.8, 0.05);
    sh.userData.backdrop = true;
    group.add(sh);
  }
  group.add(piece);
  return { group, lying: false };
}

// ---- Box ---------------------------------------------------------------------------------
function box(o, screens) {
  const w = Math.max(1, o.w || 12); const h = Math.max(1, o.h || 18); const d = Math.max(0.5, o.d || 5);
  const base = BOX_MATERIALS[o.material]?.color || o.color || '#F3F2EF';
  const fin = finishOf(o);
  const m = () => printMaterial({ color: base, ...fin });
  // BoxGeometry faces: +x, −x, +y, −y, +z (front), −z (back)
  const mats = [m(), m(), m(), new THREE.MeshStandardMaterial({ color: base, roughness: 0.85 }), m(), m()];
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(0.15, d / 6)), mats);
  mesh.position.y = h / 2;
  // Each printed face as its own "surface": the material, its shape.
  const face = (i, name, aspect) => screens.push({ mesh, material: mats[i], aspect, turn: 0, face: name, print: true });
  face(4, 'front', w / h); face(5, 'back', w / h); face(0, 'side', d / h); face(1, 'side', d / h); face(2, 'top', w / d);
  const group = new THREE.Group();
  group.add(mesh);
  return { group, lying: false };
}

// ---- Mug ---------------------------------------------------------------------------------
function mug(o, screens) {
  const R = 4.1; const H = 9.5; const wall = 0.32;
  const fin = FINISHES[o.finish] || FINISHES.gloss;
  const glaze = (color) => new THREE.MeshPhysicalMaterial({ color, roughness: Math.min(0.4, fin.roughness * 0.6), clearcoat: 1, clearcoatRoughness: 0.06 });
  const outer = [
    [0, 0.02], [R - 0.55, 0.02], [R - 0.25, 0.1], [R - 0.06, 0.4], [R, 0.9], [R, H - 0.25], [R - 0.02, H - 0.08], [R - 0.1, H], [R - wall + 0.08, H],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const inner = [
    [R - wall + 0.08, H], [R - wall, H - 0.1], [R - wall, 0.9], [R - wall - 0.25, 0.55], [R - wall - 0.8, 0.45], [0, 0.45],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(outer, 128), glaze(o.color));
  const inside = new THREE.Mesh(new THREE.LatheGeometry(inner, 128), glaze(o.color2 || o.color));
  inside.material.side = THREE.DoubleSide;
  // The handle, on the right as you look at the print.
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(R - 0.2, H * 0.8, 0), new THREE.Vector3(R + 1.6, H * 0.82, 0), new THREE.Vector3(R + 2.7, H * 0.64, 0),
    new THREE.Vector3(R + 2.6, H * 0.36, 0), new THREE.Vector3(R + 1.4, H * 0.2, 0), new THREE.Vector3(R - 0.2, H * 0.22, 0),
  ]);
  const handle = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.48, 24, false), glaze(o.color));
  handle.scale.z = 0.85;
  // The print: a sleeve just outside the glaze. Front = a band facing you; full = all round but the handle.
  const printH = 8.2;
  const full = o.wrap === 'full';
  const len = (full ? 300 : 150) * D;
  // CylinderGeometry's angle 0 faces +z (you); the handle sits at +x (90°).
  const start = full ? (90 + 30) * D : -len / 2;
  const sleeveGeo = new THREE.CylinderGeometry(R + 0.012, R + 0.012, printH, 160, 1, true, start, len);
  const sleeve = new THREE.Mesh(sleeveGeo, printMaterial({ color: o.color, roughness: Math.min(0.4, fin.roughness * 0.6), clearcoat: 1 }));
  sleeve.position.y = H / 2 + 0.1;
  screens.push({ mesh: sleeve, aspect: ((R + 0.012) * len) / printH, turn: 0, face: 'front', print: true });
  const group = new THREE.Group();
  group.add(body, inside, handle, sleeve);
  return { group, lying: false };
}

const BUILD = { card, poster, box, mug };

/** Build an object → { group, screens: [{ mesh, material?, aspect, face, print }], lying }. */
export function buildObject(o) {
  const screens = [];
  const built = (BUILD[o?.type] || card)(o || defaultObject('card'), screens);
  built.group.traverse((x) => { if (x.isMesh) x.castShadow = !x.userData.backdrop && !x.userData.noShadow; });
  return { group: built.group, screens, lying: built.lying };
}
