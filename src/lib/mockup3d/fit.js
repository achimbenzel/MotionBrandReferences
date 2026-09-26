// How a picture sits in a screen or a picture slot — plain maths, shared by
// the 3D screens, the screen fitter and the 2D mockups (no three.js here).

/**
 * The picture's box on a screen, before your own size / position: the screen
 * as you see it (`viewAspect`, width / height, the picture upright) and the
 * picture's width / height as fractions of that screen (cover: at least 1 on
 * both sides; contain: at most 1). `turn` = quarter turns of the screen.
 */
export function contentBox({ screenAspect, contentAspect, turn = 0, fit = 'cover' }) {
  const q = ((Math.round(turn) % 4) + 4) % 4;
  const boxAspect = q % 2 ? 1 / contentAspect : contentAspect; // the picture, as it lies on the screen
  const s = fit === 'contain' ? Math.min(screenAspect / boxAspect, 1) : Math.max(screenAspect / boxAspect, 1);
  const bw = boxAspect * s; const bh = s;                      // in screen units (screen height = 1)
  const cw = q % 2 ? bh : bw; const ch = q % 2 ? bw : bh;      // the same, upright
  const vw = q % 2 ? 1 : screenAspect; const vh = q % 2 ? screenAspect : 1;
  return { q, cw, ch, vw, vh, viewAspect: vw / vh, w: cw / vw, h: ch / vh };
}
