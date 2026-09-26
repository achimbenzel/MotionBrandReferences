// Printed surfaces (business cards, posters, boxes, mugs): the material —
// paper, card or glazed ceramic — lit by the scene like everything else, with
// your picture printed on it. Where the picture doesn't reach, and where it is
// transparent, the material's own colour shows (a logo on a white mug).
import * as THREE from 'three';
import { fitMatrix } from './screen.js';

const PRINT_MAP = /* glsl */`
#ifdef USE_MAP
  vec4 printColor = texture2D( map, vMapUv );
  float printIn = step( 0.0, vMapUv.x ) * step( vMapUv.x, 1.0 ) * step( 0.0, vMapUv.y ) * step( vMapUv.y, 1.0 );
  diffuseColor.rgb = mix( diffuseColor.rgb, printColor.rgb, printColor.a * printIn );
#endif
`;

/** Paper / card / ceramic in `color`; roughness and clearcoat give matte, silk or gloss. */
export function printMaterial({ color = '#f4f2ee', roughness = 0.8, clearcoat = 0, metalness = 0, side = THREE.FrontSide } = {}) {
  const m = new THREE.MeshPhysicalMaterial({ color, roughness, metalness, clearcoat, clearcoatRoughness: 0.12, side });
  m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', PRINT_MAP); };
  m.customProgramCacheKey = () => 'print-v1';
  m.userData.print = true;
  return m;
}

/**
 * Put a picture (a texture, or null) on a printed surface, fitted like a
 * screen's (cover / contain, your size and position). Each surface gets its
 * own copy of the texture — the picture itself is shared, only where it sits
 * differs.
 */
export function fitPrint(mat, texture, opts) {
  if (!texture) {
    if (mat.map) { mat.map = null; mat.needsUpdate = true; }
    return;
  }
  let t = mat.userData.tex;
  if (!t || t.userData.src !== texture) {
    t?.dispose();
    t = texture.clone();
    t.userData = { src: texture };
    t.matrixAutoUpdate = false;
    t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
    mat.userData.tex = t;
  }
  t.matrix.copy(fitMatrix(opts));
  if (mat.map !== t) { mat.map = t; mat.needsUpdate = true; }
}

/** Let go of a printed surface's texture copy. */
export function releasePrint(mat) {
  mat.userData.tex?.dispose();
  mat.userData.tex = null;
}
