// The cover's smoke: the Confinium hero shader (domain-warped swirl + chroma
// flow, see the hero's shader) in a deck's accent colour, dark or light — kept
// smooth: no grain, no streaks. Drawn once per look as a picture for the
// slides (editor, thumbnails, PDF, PowerPoint), or running for presenting.

const VERT = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_dark;
uniform vec3 u_accent;
uniform vec3 u_accent2;
const float DETAIL = 1.7;
const float MOMENTUM = 13.0;
const float RADIUS = 3.5;

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0); // quintic: no creases between cells
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// Four octaves (the hero has six): the finest ones only add grain.
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a * vnoise(p); p *= 2.0; a *= 0.5; } return v / 0.9375; }
float swirl(vec2 uv, float t){
  vec2 q = vec2(fbm(uv + vec2(0.0, t * 0.15)), fbm(uv + vec2(5.2, 1.3 - t * 0.12)));
  vec2 r = vec2(fbm(uv + DETAIL * q + vec2(1.7, 9.2) + t * 0.1), fbm(uv + DETAIL * q + vec2(8.3, 2.8) - t * 0.08));
  return fbm(uv + DETAIL * r);
}
void main(){
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  vec2 p = uv - 0.5;
  p.x *= u_res.x / u_res.y;
  float t = u_time;
  float s = swirl(p * (1.4 + DETAIL * 0.4) + vec2(0.0, t * 0.05), t);
  float dist = length(p);
  float flow = sin(dist * RADIUS - t * (MOMENTUM * 0.06) + s * 4.0) * 0.5 + 0.5;
  flow *= smoothstep(1.1, 0.1, dist);
  flow = pow(flow, 1.6);
  vec3 baseDark = mix(vec3(0.043, 0.043, 0.055), vec3(0.02, 0.05, 0.07), s);
  vec3 baseLight = mix(vec3(0.92, 0.91, 0.88), vec3(0.85, 0.88, 0.90), s);
  vec3 colDark = mix(baseDark, baseDark + u_accent2 * 0.25, smoothstep(0.4, 0.85, s));
  colDark = mix(colDark, colDark + u_accent, flow * 0.9);
  vec3 colLight = mix(baseLight, mix(baseLight, u_accent2 * 0.85, 0.55), smoothstep(0.35, 0.9, s) * 0.7);
  colLight = mix(colLight, mix(colLight, u_accent * 0.9, 0.7), flow * 0.85);
  vec3 col = mix(colLight, colDark, u_dark);
  float band = sin((uv.x + uv.y) * 6.2831 + t * 0.25) * 0.5 + 0.5;
  col += (0.08 * u_dark) * pow(band, 8.0) * u_accent2;
  col -= (0.05 * (1.0 - u_dark)) * pow(band, 8.0) * (1.0 - u_accent);
  col *= 1.0 - dist * 0.35;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

const hexRgb = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const n = m ? parseInt(m[1], 16) : 0x007588;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
};
// The second, lighter tone beside the accent (petrol #007588 → sky #63b7ed in the hero).
function lighter([r, g, b]) {
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = ((h * 60 + 16) % 360 + 360) % 360;
  const s = d ? 0.8 : 0; const l = 0.66;
  const c = (1 - Math.abs(2 * l - 1)) * s; const x = c * (1 - Math.abs(((h / 60) % 2) - 1)); const m = l - c / 2;
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r1 + m, g1 + m, b1 + m];
}

/** A shader on a canvas: draw(time) paints one frame in the look given. Null without WebGL. */
export function glowPainter(canvas, { accent, dark }) {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: true });
  if (!gl) return null;
  const compile = (type, src) => {
    const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
    return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
  };
  const vs = compile(gl.VERTEX_SHADER, VERT); const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = (n) => gl.getUniformLocation(prog, n);
  const a1 = hexRgb(accent);
  gl.uniform3fv(U('u_accent'), a1);
  gl.uniform3fv(U('u_accent2'), lighter(a1));
  gl.uniform1f(U('u_dark'), dark ? 1 : 0);
  return {
    draw(time) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(U('u_res'), canvas.width, canvas.height);
      gl.uniform1f(U('u_time'), time);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() { gl.getExtension('WEBGL_lose_context')?.loseContext(); },
  };
}

// The moment of the smoke a deck shows (its "seed"): the hero's still frame by default.
export const glowTime = (seed) => 12 + (Number.isFinite(seed) ? seed : 0) * 0.37;

const W = 1280; const H = 480; // the cover's top (1920 × 720), drawn smaller: it's smoke
const pictures = new Map(); // look → { url, promise }
const keyOf = ({ accent, dark, seed }) => `${accent}|${dark ? 1 : 0}|${seed || 0}`;
/** A deck's look for its smoke: accent, dark or light, which swirl. */
export const glowLook = (deck) => ({ accent: deck?.theme?.accent || '#007588', dark: deck?.theme?.preset !== 'light', seed: deck?.theme?.glowSeed || 0 });

/** The picture for a look if it's ready (so a slide can show it straight away). */
export const glowPicture = (look) => pictures.get(keyOf(look))?.url || null;

/** The picture for a look (an object URL), drawn once; null without WebGL. */
export function makeGlowPicture(look) {
  const key = keyOf(look);
  let entry = pictures.get(key);
  if (!entry) {
    entry = { url: null };
    entry.promise = new Promise((resolve) => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const painter = glowPainter(canvas, look);
        if (!painter) { resolve(null); return; }
        painter.draw(glowTime(look.seed));
        canvas.toBlob((blob) => {
          painter.dispose();
          entry.url = blob ? URL.createObjectURL(blob) : null;
          resolve(entry.url);
        }, 'image/png');
      } catch { resolve(null); }
    });
    pictures.set(key, entry);
  }
  return entry.promise;
}

/** Waits for every picture asked for so far (before printing or exporting). */
export const glowPicturesReady = () => Promise.all([...pictures.values()].map((e) => e.promise));
