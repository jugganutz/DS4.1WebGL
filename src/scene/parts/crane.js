// Ship-to-shore (STS) container crane: portal frame, A-frame, boom, trolley, spreader.

import { mat4, compose, srgb } from '../../engine/math.js';

const PAINT = () => srgb('#6b7378');
const PAINT_DARK = () => srgb('#353c41');
const ACCENT = () => srgb('#a83226');

export function addCrane(b, { x = 0, z = 0, yaw = 0, scale = 1, seed = 0 }) {
  b.push(compose(mat4(), x, 0, z, yaw, 0, 0, scale, scale, scale));

  const legX = 7.6;
  const legZ = 8.2;
  const portalY = 21;
  const apexY = 40.5;
  const boomY = 30.5;
  const boomZ0 = -13;
  const boomZ1 = 56;

  /* ------------------------------------------------------- bogies + legs */
  b.mat({ color: PAINT_DARK(), rough: 0.62, metal: 0.6, detail: 4 });
  for (let sx = -1; sx <= 1; sx += 2) {
    for (let sz = -1; sz <= 1; sz += 2) {
      b.push(compose(mat4(), sx * legX, 0.55, sz * legZ, 0, 0, 0));
      b.box(3.4, 1.1, 1.6);
      b.pop();
      // rail wheels
      b.mat({ color: [0.09, 0.09, 0.1], rough: 0.5, metal: 0.9, detail: 4 });
      for (let k = -1; k <= 1; k += 2) {
        b.push(compose(mat4(), sx * legX + k * 1.0, 0.45, sz * legZ, 0, 0, 0));
        b.push(compose(mat4(), 0, 0, 0, 0, 0, Math.PI / 2));
        b.cylinder(0.42, 0.42, 0.3, 12, true);
        b.pop();
        b.pop();
      }
      b.mat({ color: PAINT_DARK(), rough: 0.62, metal: 0.6, detail: 4 });
    }
  }

  b.mat({ color: PAINT(), rough: 0.5, metal: 0.45, detail: 3 });
  for (let sx = -1; sx <= 1; sx += 2) {
    // main leg trusses
    b.truss([sx * legX, 1.1, -legZ], [sx * legX, portalY, -legZ], 2.0, 2.0, 4, 0.15);
    b.truss([sx * legX, 1.1, legZ], [sx * legX, portalY, legZ], 2.0, 2.0, 4, 0.15);
    // portal cross beams along X
    b.strut([-legX, portalY, -legZ], [legX, portalY, -legZ], 2.1, 2.4);
    b.strut([-legX, portalY, legZ], [legX, portalY, legZ], 2.1, 2.4);
    // side beams along Z at the top of the portal
    b.strut([sx * legX, portalY, -legZ], [sx * legX, portalY, legZ], 1.8, 1.8);
    // diagonal knee braces
    b.strut([sx * legX, portalY - 4.2, -legZ], [sx * legX - sx * 3.0, portalY, -legZ], 0.5);
    b.strut([sx * legX, portalY - 4.2, legZ], [sx * legX - sx * 3.0, portalY, legZ], 0.5);
  }

  /* ------------------------------------------------------------- A-frame */
  for (let sx = -1; sx <= 1; sx += 2) {
    // inclined front / back struts meeting at the apex
    b.truss([sx * legX, portalY, legZ], [sx * legX, apexY, 2.0], 1.5, 1.5, 3, 0.13);
    b.truss([sx * legX, portalY, -legZ], [sx * legX, apexY, 2.0], 1.5, 1.5, 3, 0.13);
  }
  b.strut([-legX, apexY, 2.0], [legX, apexY, 2.0], 1.6, 1.8);
  // apex machinery platform
  b.push(compose(mat4(), 0, apexY + 0.9, 2.0, 0, 0, 0));
  b.mat({ color: PAINT_DARK(), rough: 0.6, metal: 0.55, detail: 3 });
  b.box(4.0, 1.2, 3.0);
  b.pop();

  /* ---------------------------------------------------------------- boom */
  b.mat({ color: PAINT(), rough: 0.48, metal: 0.5, detail: 3 });
  const bw = 2.6, bh = 2.6;
  for (let sx = -1; sx <= 1; sx += 2) {
    b.truss([sx * bw * 0.5, boomY, boomZ0], [sx * bw * 0.5, boomY, boomZ1], 1.6, 1.6, 12, 0.14);
  }
  // boom cross bracing between the two trusses
  for (let k = 0; k <= 12; k++) {
    const t = k / 12;
    const zz = boomZ0 + (boomZ1 - boomZ0) * t;
    b.strut([-bw * 0.5, boomY + 0.7, zz], [bw * 0.5, boomY + 0.7, zz], 0.3);
    b.strut([-bw * 0.5, boomY - 0.7, zz], [bw * 0.5, boomY - 0.7, zz], 0.3);
  }
  // boom stays from the apex
  b.mat({ color: PAINT_DARK(), rough: 0.55, metal: 0.7, detail: 3 });
  for (const zz of [-9, 8, 26, 44, 55]) {
    for (let sx = -1; sx <= 1; sx += 2) {
      b.strut([sx * legX * 0.7, apexY - 0.4, 2.0], [sx * bw * 0.5, boomY + 0.9, zz], 0.12, 0.12);
    }
  }

  /* --------------------------------------------------- machinery + cab */
  b.mat({ color: srgb('#626a6f'), rough: 0.55, metal: 0.45, detail: 3 });
  b.push(compose(mat4(), 0, portalY + 1.8, -5.2, 0, 0, 0));
  b.box(11.0, 3.6, 5.4);
  b.pop();
  b.push(compose(mat4(), 0, portalY + 3.9, -5.2, 0, 0, 0));
  b.mat({ color: PAINT_DARK(), rough: 0.5, metal: 0.6, detail: 3 });
  b.box(9.0, 0.5, 4.4);
  b.pop();

  // operator cab under the boom
  b.push(compose(mat4(), 0, boomY - 2.2, 33, 0, 0, 0));
  b.mat({ color: srgb('#8d9498'), rough: 0.35, metal: 0.2, detail: 0 });
  b.box(3.0, 2.4, 2.6);
  b.pop();
  b.push(compose(mat4(), 0, boomY - 2.2, 34.35, 0, 0, 0));
  b.mat({ color: [0.02, 0.03, 0.035], rough: 0.1, metal: 0.1, detail: 0, emissive: [0.25, 0.22, 0.14] });
  b.box(2.5, 1.7, 0.06);
  b.pop();

  /* ------------------------------------------------------------ trolley */
  b.push(compose(mat4(), 0, boomY + 0.9, 38, 0, 0, 0));
  b.mat({ color: ACCENT(), rough: 0.5, metal: 0.5, detail: 3 });
  b.box(4.2, 1.1, 3.0);
  b.pop();
  b.mat({ color: PAINT_DARK(), rough: 0.5, metal: 0.7, detail: 4 });
  for (let sx = -1; sx <= 1; sx += 2) {
    for (let sz = -1; sz <= 1; sz += 2) {
      b.strut([sx * 1.5, boomY + 0.4, 38 + sz * 1.1], [sx * 1.5, boomY - 6.5, 38 + sz * 1.1], 0.06, 0.06);
    }
  }
  // spreader
  b.mat({ color: ACCENT(), rough: 0.55, metal: 0.4, detail: 3 });
  b.push(compose(mat4(), 0, boomY - 7.0, 38, 0, 0, 0));
  b.box(12.4, 0.7, 2.6);
  b.pop();
  b.push(compose(mat4(), 0, boomY - 7.7, 38, 0, 0, 0));
  b.mat({ color: PAINT_DARK(), rough: 0.5, metal: 0.6, detail: 4 });
  b.box(9.0, 0.5, 1.8);
  b.pop();

  /* ------------------------------------------------------------- stairs */
  b.mat({ color: PAINT_DARK(), rough: 0.6, metal: 0.5, detail: 3 });
  b.truss([legX + 1.4, 0, -legZ - 1.2], [legX + 1.4, portalY, -legZ - 1.2], 0.9, 0.9, 14, 0.06);

  /* ------------------------------------------------------------- lights */
  // floodlight frames on the boom underside
  b.mat({ color: PAINT_DARK(), rough: 0.5, metal: 0.6, detail: 4 });
  const floods = [14, 30, 46];
  for (const fz of floods) {
    b.push(compose(mat4(), 0, boomY - 1.6, fz, 0, 0, 0));
    b.box(3.4, 0.28, 0.5);
    b.pop();
  }

  // hazard stripe on the boom tip
  b.push(compose(mat4(), 0, boomY + 0.9, boomZ1 - 1.2, 0, 0, 0));
  b.mat({ color: ACCENT(), rough: 0.5, metal: 0.4, detail: 0, emissive: [0.02, 0.004, 0.004] });
  b.box(2.4, 1.6, 2.4);
  b.pop();

  b.pop();

  return {
    floods: floods.map((fz) => ({ x, y: boomY - 1.9, z: z + fz, yaw })),
    boomTip: { x, y: boomY + 1.4, z: z + boomZ1 - 1.2 },
    apex: { x, y: apexY + 1.6, z: z + 2.0 },
    trolley: { x, y: boomY - 7.0, z: z + 38 },
    legZ, legX, portalY,
  };
}

// Crane rails set into the pavement.
export function addCraneRails(b, { from = -90, to = 90, z0 = -8.2, z1 = 8.2 }) {
  b.mat({ color: [0.14, 0.14, 0.15], rough: 0.35, metal: 0.9, detail: 4 });
  for (const zz of [z0, z1]) {
    b.push(compose(mat4(), (from + to) / 2, 0.02, zz, 0, 0, 0, 1, 1, 1));
    b.box(to - from, 0.1, 0.22);
    b.pop();
    // rail bed
    b.push(compose(mat4(), (from + to) / 2, -0.01, zz, 0, 0, 0));
    b.mat({ color: [0.05, 0.05, 0.055], rough: 0.7, metal: 0.2, detail: 2 });
    b.box(to - from, 0.02, 0.7);
    b.pop();
    b.mat({ color: [0.14, 0.14, 0.15], rough: 0.35, metal: 0.9, detail: 4 });
  }
}
