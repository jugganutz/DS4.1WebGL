// Minimal linear algebra for a WebGL2 renderer. Column-major mat4, plain arrays for vectors.
// No dependencies, no allocation inside hot paths (out-parameters everywhere).

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/* ---------------------------------------------------------------- mat4 */

export const mat4 = () => {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
};

export const identity = (o) => {
  o.fill(0);
  o[0] = o[5] = o[10] = o[15] = 1;
  return o;
};

export const copy = (o, a) => { o.set(a); return o; };

export function multiply(o, a, b) {
  // o = a * b  (column-major, a applied after b)
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  for (let i = 0; i < 4; i++) {
    const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
    o[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    o[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    o[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    o[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  }
  return o;
}

export function perspective(o, fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  o.fill(0);
  o[0] = f / aspect;
  o[5] = f;
  o[10] = (far + near) / (near - far);
  o[11] = -1;
  o[14] = (2 * far * near) / (near - far);
  return o;
}

export function ortho(o, l, r, b, t, n, f) {
  o.fill(0);
  o[0] = 2 / (r - l);
  o[5] = 2 / (t - b);
  o[10] = -2 / (f - n);
  o[12] = -(r + l) / (r - l);
  o[13] = -(t + b) / (t - b);
  o[14] = -(f + n) / (f - n);
  o[15] = 1;
  return o;
}

export function lookAt(o, eye, center, up) {
  let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
  let l = Math.hypot(zx, zy, zz) || 1;
  zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz) || 1;
  xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0;
  o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0;
  o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
  o[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  o[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  o[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  o[15] = 1;
  return o;
}

export function invert(o, a) {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;

  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return identity(o);
  det = 1 / det;

  o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return o;
}

export function transpose(o, a) {
  if (o === a) {
    let t;
    t = a[1]; o[1] = a[4]; o[4] = t;
    t = a[2]; o[2] = a[8]; o[8] = t;
    t = a[3]; o[3] = a[12]; o[12] = t;
    t = a[6]; o[6] = a[9]; o[9] = t;
    t = a[7]; o[7] = a[13]; o[13] = t;
    t = a[11]; o[11] = a[14]; o[14] = t;
    return o;
  }
  o[0] = a[0]; o[1] = a[4]; o[2] = a[8]; o[3] = a[12];
  o[4] = a[1]; o[5] = a[5]; o[6] = a[9]; o[7] = a[13];
  o[8] = a[2]; o[9] = a[6]; o[10] = a[10]; o[11] = a[14];
  o[12] = a[3]; o[13] = a[7]; o[14] = a[11]; o[15] = a[15];
  return o;
}

export const translation = (o, x, y, z) => {
  identity(o);
  o[12] = x; o[13] = y; o[14] = z;
  return o;
};

export function scale(o, x, y, z) {
  identity(o);
  o[0] = x; o[5] = y; o[10] = z;
  return o;
}

export function rotationX(o, a) {
  const c = Math.cos(a), s = Math.sin(a);
  identity(o);
  o[5] = c; o[6] = s; o[9] = -s; o[10] = c;
  return o;
}

export function rotationY(o, a) {
  const c = Math.cos(a), s = Math.sin(a);
  identity(o);
  o[0] = c; o[2] = -s; o[8] = s; o[10] = c;
  return o;
}

export function rotationZ(o, a) {
  const c = Math.cos(a), s = Math.sin(a);
  identity(o);
  o[0] = c; o[1] = s; o[4] = -s; o[5] = c;
  return o;
}

// Yaw (Y) * Pitch (X) * Roll (Z), translation, then scale.
export function compose(o, px, py, pz, yaw, pitch, roll, sx = 1, sy = 1, sz = 1) {
  const cy = Math.cos(yaw), sy_ = Math.sin(yaw);
  const cx = Math.cos(pitch), sx_ = Math.sin(pitch);
  const cz = Math.cos(roll), sz_ = Math.sin(roll);
  // R = Ry * Rx * Rz
  const r00 = cy * cz + sy_ * sx_ * sz_;
  const r01 = cx * sz_;
  const r02 = -sy_ * cz + cy * sx_ * sz_;
  const r10 = -cy * sz_ + sy_ * sx_ * cz;
  const r11 = cx * cz;
  const r12 = sy_ * sz_ + cy * sx_ * cz;
  const r20 = sy_ * cx;
  const r21 = -sx_;
  const r22 = cy * cx;

  o[0] = r00 * sx; o[1] = r01 * sx; o[2] = r02 * sx; o[3] = 0;
  o[4] = r10 * sy; o[5] = r11 * sy; o[6] = r12 * sy; o[7] = 0;
  o[8] = r20 * sz; o[9] = r21 * sz; o[10] = r22 * sz; o[11] = 0;
  o[12] = px; o[13] = py; o[14] = pz; o[15] = 1;
  return o;
}

// Reflection about the horizontal plane y = h.
export function mirrorY(o, h) {
  identity(o);
  o[5] = -1;
  o[13] = 2 * h;
  return o;
}

export function transformPoint(out, m, p) {
  const x = p[0], y = p[1], z = p[2];
  const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
  out[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
  out[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
  out[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
  return out;
}

export function transformDir(out, m, p) {
  const x = p[0], y = p[1], z = p[2];
  out[0] = m[0] * x + m[4] * y + m[8] * z;
  out[1] = m[1] * x + m[5] * y + m[9] * z;
  out[2] = m[2] * x + m[6] * y + m[10] * z;
  return out;
}

// Normal matrix = transpose(inverse(upper 3x3)) packed into mat4 (w=0 rows).
const _n1 = mat4();
export function normalMatrix(o, m) {
  invert(_n1, m);
  transpose(o, _n1);
  o[3] = o[7] = o[11] = o[15] = 0;
  return o;
}

/* ---------------------------------------------------------------- vec3 */

export const v3 = (x = 0, y = 0, z = 0) => [x, y, z];

export const v3add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const v3sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const v3scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const v3len = (a) => Math.hypot(a[0], a[1], a[2]);
export const v3dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const v3cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const v3norm = (a) => {
  const l = v3len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const v3lerp = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/* ---------------------------------------------------------------- misc */

// Deterministic RNG (mulberry32) so the terminal looks the same on every load.
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * next());
  next.pick = (arr) => arr[Math.floor(next() * arr.length) % arr.length];
  next.chance = (p) => next() < p;
  next.sign = () => (next() < 0.5 ? -1 : 1);
  return next;
}

// sRGB hex -> linear rgb triple (renderer works in linear space)
export function srgb(hex) {
  const n = typeof hex === 'string' ? parseInt(hex.replace('#', ''), 16) : hex;
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return c;
}

export const mulColor = (c, s) => [c[0] * s, c[1] * s, c[2] * s];
