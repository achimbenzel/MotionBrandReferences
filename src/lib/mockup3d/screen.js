// The screen: a material that shows a picture or video fitted into the
// screen's shape — cropped to fill it (cover) or whole with black bars
// (contain) — turned for landscape, and unaffected by the scene's lighting.
import * as THREE from 'three';

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

/**
 * Point a screen material at a texture. `screenAspect` = the screen's width /
 * height (in its UV space), `contentAspect` = the picture's, `turn` = quarter
 * turns to show it upright, `fit` = 'cover' | 'contain', flipV / mirror for
 * imported models whose UVs run the other way.
 */
export function fitScreen(mat, texture, { screenAspect, contentAspect, turn = 0, fit = 'cover', flipV = false, mirror = false }) {
  mat.uniforms.map.value = texture || null;
  mat.uniforms.hasMap.value = texture ? 1 : 0;
  if (!texture) return;
  const q = ((Math.round(turn) % 4) + 4) % 4;
  // The picture's box once turned, in screen units (screen height = 1).
  const boxAspect = q % 2 ? 1 / contentAspect : contentAspect;
  const s = fit === 'contain' ? Math.min(screenAspect / boxAspect, 1) : Math.max(screenAspect / boxAspect, 1);
  const bw = boxAspect * s; const bh = s; // turned box, screen units
  const cw = q % 2 ? bh : bw; const ch = q % 2 ? bw : bh; // picture before turning
  const a = (q * Math.PI) / 2;
  const cos = Math.cos(a); const sin = Math.sin(a);
  // screen uv → centred screen units → turned back → picture uv
  const m = new THREE.Matrix3().set(
    1, 0, -0.5,
    0, 1, -0.5,
    0, 0, 1,
  );
  const toUnits = new THREE.Matrix3().set(screenAspect, 0, 0, 0, 1, 0, 0, 0, 1);
  const rot = new THREE.Matrix3().set(cos, sin, 0, -sin, cos, 0, 0, 0, 1);
  const toPic = new THREE.Matrix3().set((mirror ? -1 : 1) / cw, 0, 0.5, 0, (flipV ? -1 : 1) / ch, 0.5, 0, 0, 1);
  mat.uniforms.uvT.value.copy(toPic.multiply(rot).multiply(toUnits).multiply(m));
}
