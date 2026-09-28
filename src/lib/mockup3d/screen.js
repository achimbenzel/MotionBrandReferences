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

// The cover glass over a screen: black, so all it adds is what it reflects —
// the room, the soft boxes, the sun — faint straight on and stronger at a
// slant, as on a real display. On top of the room, a big soft card behind
// the camera (the photographer's white V-flat) leaves a gentle sheen that
// sweeps across the screen as the device turns. Glossy is a mirror-like
// pane, anti-glare (nano-texture) a soft haze.
export const GLASS = {
  glossy: { label: 'Glossy', roughness: 0.035, soft: 0.16 },
  antiglare: { label: 'Anti-glare', roughness: 0.42, soft: 0.5 },
  off: { label: 'Off', roughness: 0.035, soft: 0.16 },
};

const GLASS_CARD = /* glsl */`
  {
    // The reflected view ray (view space: +z is behind the camera, +y up). The
    // card fills the upper left behind the camera; its soft edge runs
    // diagonally, so it crosses the screen as a gradient.
    vec3 rv = reflect( - geometryViewDir, geometryNormal );
    float edge = dot( rv, vec3( -0.6, 0.8, 0.0 ) ) - 0.5;
    float card = smoothstep( - glassSoft, glassSoft, edge ) * smoothstep( -0.2, 0.35, rv.z );
    float fres = 0.04 + 0.96 * pow( 1.0 - saturate( dot( geometryNormal, geometryViewDir ) ), 5.0 );
    outgoingLight += vec3( glassSheen * card * ( 0.3 + 3.0 * fres ) );
    // A mockup shows the design: even a big soft box in the glass stays a
    // veil over it (a soft limit, not a hard cut).
    outgoingLight = glassMax * ( 1.0 - exp( - outgoingLight / glassMax ) );
  }
  #include <opaque_fragment>
`;

export function glassMaterial() {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0x000000, metalness: 0, roughness: GLASS.glossy.roughness, ior: 1.5,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, // just in front of the picture
  });
  const uniforms = { glassSheen: { value: 0.1 }, glassSoft: { value: GLASS.glossy.soft }, glassMax: { value: 0.15 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.fragmentShader = `uniform float glassSheen;\nuniform float glassSoft;\nuniform float glassMax;\n${sh.fragmentShader.replace('#include <opaque_fragment>', GLASS_CARD)}`;
  };
  m.customProgramCacheKey = () => 'glass-v4';
  m.userData.glass = uniforms;
  return m;
}

/** `glass`: glossy | antiglare | off; `reflect` 0–1 (0.5 = as bright as real glass, 1 = twice). */
export function setGlass(mat, { glass = 'glossy', reflect = 0.5 } = {}) {
  const g = GLASS[glass] || GLASS.glossy;
  mat.visible = glass !== 'off' && reflect > 0;
  mat.roughness = g.roughness;
  mat.envMapIntensity = reflect * 2;
  mat.specularIntensity = Math.min(1, reflect * 2);
  const u = mat.userData.glass;
  if (u) {
    u.glassSheen.value = reflect * (glass === 'antiglare' ? 0.1 : 0.14);
    u.glassSoft.value = g.soft;
    u.glassMax.value = Math.max(0.001, reflect * 0.14); // 50%: at most ~7 % of white over the picture
  }
}

/**
 * Point a screen material at a texture. `screenAspect` = the screen's width /
 * height (in its UV space), `contentAspect` = the picture's, `turn` = quarter
 * turns to show it upright, `fit` = 'cover' | 'contain', `adjust` = your own
 * size (× the fitted size) and position (centre offset in screen widths /
 * heights as you see it, y down), flipV / mirror for imported models whose
 * UVs run the other way.
 */
export function fitScreen(mat, texture, opts) {
  mat.uniforms.map.value = texture || null;
  mat.uniforms.hasMap.value = texture ? 1 : 0;
  if (!texture) return;
  mat.uniforms.uvT.value.copy(fitMatrix(opts));
}

/** The screen-uv → picture-uv transform behind fitScreen (also used for printed surfaces). */
export function fitMatrix({ screenAspect, contentAspect, turn = 0, fit = 'cover', adjust, flipV = false, mirror = false }) {
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
  return toPic.multiply(shift).multiply(rot).multiply(toUnits).multiply(m);
}
