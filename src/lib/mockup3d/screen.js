// The screen: a material that shows a picture or video fitted into the
// screen's shape — cropped to fill it (cover) or whole with black bars
// (contain) — turned for landscape, and unaffected by the scene's lighting.
import * as THREE from 'three';
import { contentBox } from './fit.js';

const vertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const fragmentShader = /* glsl */`
  uniform sampler2D map;
  uniform float hasMap;
  uniform mat3 uvT;
  uniform vec3 emptyTop;
  uniform vec3 emptyBottom;
  varying vec2 vUv;
  void main() {
    vec4 c;
    if (hasMap < 0.5) {
      c = vec4(mix(emptyBottom, emptyTop, vUv.y), 1.0);
    } else {
      vec2 uv = (uvT * vec3(vUv, 1.0)).xy;
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) c = vec4(0.0, 0.0, 0.0, 1.0);
      else c = texture2D(map, uv);
    }
    gl_FragColor = c;
    #include <colorspace_fragment>
  }
`;

export function screenMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: null },
      hasMap: { value: 0 },
      uvT: { value: new THREE.Matrix3() },
      emptyTop: { value: new THREE.Color('#2a2c36').convertSRGBToLinear() },
      emptyBottom: { value: new THREE.Color('#101116').convertSRGBToLinear() },
    },
    vertexShader,
    fragmentShader,
    toneMapped: false,
  });
}

export { contentBox };

/**
 * Point a screen material at a texture. `screenAspect` = the screen's width /
 * height (in its UV space), `contentAspect` = the picture's, `turn` = quarter
 * turns to show it upright, `fit` = 'cover' | 'contain', `adjust` = your own
 * size (× the fitted size) and position (centre offset in screen widths /
 * heights as you see it, y down), flipV / mirror for imported models whose
 * UVs run the other way.
 */
export function fitScreen(mat, texture, { screenAspect, contentAspect, turn = 0, fit = 'cover', adjust, flipV = false, mirror = false }) {
  mat.uniforms.map.value = texture || null;
  mat.uniforms.hasMap.value = texture ? 1 : 0;
  if (!texture) return;
  const { q, cw, ch, vw, vh } = contentBox({ screenAspect, contentAspect, turn, fit });
  const k = Math.max(0.01, adjust?.scale || 1);
  const dx = (adjust?.x || 0) * vw; const dy = -(adjust?.y || 0) * vh;
  const a = (q * Math.PI) / 2;
  const cos = Math.cos(a); const sin = Math.sin(a);
  // screen uv → centred screen units → turned upright → minus the picture's
  // centre → picture uv
  const m = new THREE.Matrix3().set(1, 0, -0.5, 0, 1, -0.5, 0, 0, 1);
  const toUnits = new THREE.Matrix3().set(screenAspect, 0, 0, 0, 1, 0, 0, 0, 1);
  const rot = new THREE.Matrix3().set(cos, sin, 0, -sin, cos, 0, 0, 0, 1);
  const shift = new THREE.Matrix3().set(1, 0, -dx, 0, 1, -dy, 0, 0, 1);
  const toPic = new THREE.Matrix3().set((mirror ? -1 : 1) / (cw * k), 0, 0.5, 0, (flipV ? -1 : 1) / (ch * k), 0.5, 0, 0, 1);
  mat.uniforms.uvT.value.copy(toPic.multiply(shift).multiply(rot).multiply(toUnits).multiply(m));
}
