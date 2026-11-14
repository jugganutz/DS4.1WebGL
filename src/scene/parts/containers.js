// Shipping containers: corrugated steel boxes with corner castings and door hardware.

import { mat4, compose, srgb } from '../../engine/math.js';

export const CONTAINER_COLORS = [
  { hex: '#8d2f28', w: 3 }, // oxide red
  { hex: '#1f4f74', w: 3 }, // hapag blue
  { hex: '#2a6b5f', w: 2 }, // evergreen green
  { hex: '#b06a20', w: 2 }, // msc orange
  { hex: '#8a8f92', w: 3 }, // grey
  { hex: '#a09a8e', w: 2 }, // dirty white reefer
  { hex: '#4a3f6b', w: 1 }, // one magenta-ish
  { hex: '#3d4a52', w: 2 }, // dark slate
  { hex: '#7d6a2f', w: 1 }, // olive
];

// Linear-space albedo is a touch darker than daylight: night scene, wet paint.
const cache = new Map();
export function containerColor(hex) {
  if (!cache.has(hex)) {
    const c = srgb(hex);
    const l = c[0] * 0.3 + c[1] * 0.5 + c[2] * 0.2;
    const desat = 0.18;
    cache.set(hex, [
      (c[0] + (l - c[0]) * desat) * 0.85,
      (c[1] + (l - c[1]) * desat) * 0.85,
      (c[2] + (l - c[2]) * desat) * 0.85,
    ]);
  }
  return cache.get(hex);
}

export function pickColor(rng) {
  const total = CONTAINER_COLORS.reduce((s, c) => s + c.w, 0);
  let r = rng() * total;
  for (const c of CONTAINER_COLORS) {
    r -= c.w;
    if (r <= 0) return c.hex;
  }
  return CONTAINER_COLORS[0].hex;
}

/**
 * Adds one container. Local space: length along X, width along Z, base at y=0.
 */
export function addContainer(b, { x = 0, y = 0, z = 0, yaw = 0, len = 12.19, color = '#8d2f28', seed = 1 }) {
  const W = 2.44;
  const H = 2.59;
  const L = len;
  const hl = L / 2, hw = W / 2;

  b.push(compose(mat4(), x, y, z, yaw, 0, 0));
  b.mat({ color: containerColor(color), rough: 0.55, metal: 0.35, detail: 1, ao: 1 });

  // ---- corrugated side walls (long faces at z = +/- hw)
  const ribs = Math.max(8, Math.round(L / 0.62));
  const ribDepth = 0.055;
  for (let side = -1; side <= 1; side += 2) {
    const zz = side * hw;
    for (let i = 0; i < ribs; i++) {
      const x0 = -hl + 0.12 + (i / ribs) * (L - 0.24);
      const x1 = -hl + 0.12 + ((i + 1) / ribs) * (L - 0.24);
      const out = i % 2 === 0 ? ribDepth : 0;
      // slightly tilted normals sell the corrugation under low light
      const tilt = i % 2 === 0 ? side * 0.35 : -side * 0.35;
      const nn = [tilt * 0.5, 0, side];
      b.quadUV(
        [x0, 0, zz + side * out], [x1, 0, zz + side * out],
        [x1, H, zz + side * out], [x0, H, zz + side * out],
        nn, [x0, 0], [x1, 0], [x1, H], [x0, H],
      );
    }
    // top and bottom rails
    b.push(compose(mat4(), 0, 0.06, zz + side * 0.02, 0, 0, 0));
    b.box(L - 0.1, 0.12, 0.1);
    b.pop();
    b.push(compose(mat4(), 0, H - 0.06, zz + side * 0.02, 0, 0, 0));
    b.box(L - 0.1, 0.12, 0.1);
    b.pop();
  }

  // ---- roof (slight camber) + floor
  b.push(compose(mat4(), 0, H - 0.02, 0, 0, 0, 0));
  b.box(L - 0.24, 0.09, W - 0.1);
  b.pop();
  b.push(compose(mat4(), 0, 0.05, 0, 0, 0, 0));
  b.metal = 0.5;
  b.box(L - 0.3, 0.1, W - 0.2);
  b.pop();
  b.metal = 0.35;

  // ---- ends: one plain, one with doors
  for (let side = -1; side <= 1; side += 2) {
    const xx = side * hl;
    const n = [side, 0, 0];
    b.quadUV(
      [xx, 0, -hw], [xx, 0, hw], [xx, H, hw], [xx, H, -hw],
      n, [0, 0], [W, 0], [W, H], [0, H],
    );
    if (side > 0) {
      // door leaves: two panels with vertical hardware
      b.push(compose(mat4(), xx + 0.02, H / 2, 0, 0, 0, 0));
      b.mat({ color: containerColor(color), rough: 0.5, metal: 0.5, detail: 1 });
      b.box(0.06, H - 0.26, W * 0.44);
      b.pop();
      b.push(compose(mat4(), xx + 0.031, H / 2, W * 0.225, 0, 0, 0));
      b.box(0.05, H - 0.3, W * 0.42);
      b.pop();
      b.push(compose(mat4(), xx + 0.031, H / 2, -W * 0.225, 0, 0, 0));
      b.box(0.05, H - 0.3, W * 0.42);
      b.pop();
      for (let k = -1; k <= 1; k += 2) {
        b.push(compose(mat4(), xx + 0.06, H * 0.5, k * W * 0.16, 0, 0, 0));
        b.mat({ color: [0.22, 0.22, 0.23], rough: 0.4, metal: 0.9, detail: 4 });
        b.box(0.05, H * 0.8, 0.045);
        b.pop();
      }
      // locking bars
      for (let k = -2; k <= 2; k++) {
        if (k === 0) continue;
        b.push(compose(mat4(), xx + 0.11, H * 0.5, k * W * 0.105, 0, 0, 0));
        b.mat({ color: [0.25, 0.25, 0.26], rough: 0.45, metal: 0.85, detail: 4 });
        b.box(0.05, H * 0.72, 0.05);
        b.pop();
      }
    }
  }

  // ---- corner castings
  b.mat({ color: [0.1, 0.1, 0.11], rough: 0.6, metal: 0.7, detail: 4 });
  for (let sx = -1; sx <= 1; sx += 2) {
    for (let sz = -1; sz <= 1; sz += 2) {
      for (let sy = 0; sy < 2; sy++) {
        b.push(compose(mat4(), sx * (hl - 0.1), sy ? H - 0.1 : 0.1, sz * (hw - 0.1), 0, 0, 0));
        b.box(0.22, 0.22, 0.22);
        b.pop();
      }
    }
  }
  // ---- bottom rails (visible from below, adds depth at the stack base)
  b.mat({ color: [0.12, 0.12, 0.13], rough: 0.7, metal: 0.5, detail: 4 });
  for (let sz = -1; sz <= 1; sz += 2) {
    b.push(compose(mat4(), 0, 0.16, sz * (hw - 0.14), 0, 0, 0));
    b.box(L - 0.3, 0.16, 0.12);
    b.pop();
  }

  b.pop();
  return { len: L, width: W, height: H };
}

/**
 * A block of containers. `alongZ` rotates them 90 degrees so their long axis runs
 * with Z: rows then march along X and bays along Z.
 */
export function addContainerBlock(b, rng, opts) {
  const {
    x0, z0, rows, bays, rowGap = 2.62, bayGap = 13.9,
    maxStack = 4, minStack = 1, yaw = 0, offsetY = 0,
    alongZ = false, mix20 = 0.15, heightLimit = 5,
  } = opts;

  const baseYaw = yaw + (alongZ ? Math.PI / 2 : 0);
  let cells = 0;

  for (let r = 0; r < rows; r++) {
    const rowHeight = rng.int(minStack, maxStack);
    for (let c = 0; c < bays; c++) {
      if (rng.chance(0.07)) continue; // gaps
      let count = rowHeight;
      if (rng.chance(0.22)) count = rng.int(minStack, maxStack);
      count = Math.min(count, heightLimit);
      const px = x0 + (alongZ ? r * rowGap : c * bayGap);
      const pz = z0 + (alongZ ? c * bayGap : r * rowGap);
      const twenty = rng.chance(mix20);
      const len = twenty ? 6.06 : 12.19;
      const color = pickColor(rng);
      const stackYaw = baseYaw + (rng.chance(0.04) ? (rng() - 0.5) * 0.05 : 0);
      for (let k = 0; k < count; k++) {
        addContainer(b, {
          x: px + (rng() - 0.5) * 0.16,
          y: offsetY + k * 2.59,
          z: pz + (rng() - 0.5) * 0.16,
          yaw: stackYaw, len, color, seed: rng() * 999,
        });
      }
      cells++;
    }
  }
  return { cells };
}
