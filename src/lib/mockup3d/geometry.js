// Shapes for the procedural devices. Units are centimetres; shapes are
// centred on the origin in the XY plane, facing +Z.
import * as THREE from 'three';

/** A rectangle with rounded corners (radius per corner: [tl, tr, br, bl]). */
export function roundedRect(w, h, r) {
  const [tl, tr, br, bl] = (Array.isArray(r) ? r : [r, r, r, r]).map((x) => Math.max(0.0001, Math.min(x, w / 2, h / 2)));
  const x = -w / 2; const y = -h / 2;
  const s = new THREE.Shape();
  s.moveTo(x + bl, y);
  s.lineTo(x + w - br, y);
  s.quadraticCurveTo(x + w, y, x + w, y + br);
  s.lineTo(x + w, y + h - tr);
  s.quadraticCurveTo(x + w, y + h, x + w - tr, y + h);
  s.lineTo(x + tl, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - tl);
  s.lineTo(x, y + bl);
  s.quadraticCurveTo(x, y, x + bl, y);
  return s;
}

/**
 * A rounded slab (a phone body, a laptop lid): w × h, `depth` thick, corner
 * radius r, edges rounded by `bevel`. Centred in Z. Material groups:
 * 0 = the two flat faces, 1 = the edges.
 */
export function slab(w, h, depth, r, bevel = 0.1, curveSegments = 28) {
  const b = Math.min(bevel, depth / 2 - 0.001);
  const geo = new THREE.ExtrudeGeometry(roundedRect(w - 2 * b, h - 2 * b, Math.max(0.01, r - b)), {
    depth: Math.max(0.001, depth - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 6, curveSegments,
  });
  geo.translate(0, 0, -(depth - 2 * b) / 2);
  geo.computeVertexNormals();
  return geo;
}

/** A flat rounded plane whose UVs run 0 → 1 across its width and height. */
export function panel(w, h, r, curveSegments = 24) {
  const geo = new THREE.ShapeGeometry(roundedRect(w, h, r), curveSegments);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i += 1) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  uv.needsUpdate = true;
  return geo;
}

/** A 2D canvas as a texture (drawn by `draw(ctx, w, h)`). */
export function canvasTexture(w, h, draw, { srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Rounded rectangle path on a 2D canvas. */
export function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
