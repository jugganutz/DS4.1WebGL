// Quay structure, terminal buildings, light towers and set dressing.

import { mat4, compose, srgb } from '../../engine/math.js';

const CONCRETE = () => srgb('#4e5254');
const CONCRETE_DARK = () => srgb('#3a3e40');
const STEEL = () => srgb('#5a6167');
const RUST = () => srgb('#6a3a24');

export function addQuayEdge(b, { zEdge = 40, x0 = -100, x1 = 100, seaLevel = -2.2 }) {
  // ---- quay wall face
  b.mat({ color: CONCRETE_DARK(), rough: 0.8, metal: 0.03, detail: 2 });
  b.quadN(
    [x0, seaLevel - 1.2, zEdge], [x1, seaLevel - 1.2, zEdge],
    [x1, 0.02, zEdge], [x0, 0.02, zEdge],
    [0, 0, 1], 1,
  );
  // ---- coping / kerb along the edge
  b.mat({ color: CONCRETE(), rough: 0.7, metal: 0.05, detail: 2 });
  b.push(compose(mat4(), (x0 + x1) / 2, 0.11, zEdge - 0.55, 0, 0, 0));
  b.box(x1 - x0, 0.24, 1.5);
  b.pop();
  // steel edge beam
  b.mat({ color: RUST(), rough: 0.55, metal: 0.7, detail: 4 });
  b.push(compose(mat4(), (x0 + x1) / 2, 0.02, zEdge + 0.06, 0, 0, 0));
  b.box(x1 - x0, 0.12, 0.16);
  b.pop();

  // ---- fenders
  for (let x = x0 + 8; x < x1; x += 13) {
    b.mat({ color: [0.045, 0.045, 0.048], rough: 0.85, metal: 0.0, detail: 5 });
    b.push(compose(mat4(), x, -0.75, zEdge + 0.55, 0, 0, Math.PI / 2));
    b.cylinder(0.55, 0.55, 1.0, 14, true);
    b.pop();
    b.push(compose(mat4(), x, -0.75, zEdge + 0.9, 0, 0, 0));
    b.cylinder(0.42, 0.42, 3.2, 12, true);
    b.pop();
    // chain
    b.mat({ color: [0.2, 0.2, 0.21], rough: 0.5, metal: 0.8, detail: 4 });
    b.push(compose(mat4(), x, 0.0, zEdge + 0.5, 0, 0, 0));
    b.box(0.06, 1.6, 0.06);
    b.pop();
  }

  // ---- bollards
  for (let x = x0 + 14; x < x1; x += 21) {
    b.mat({ color: srgb('#3a3f42'), rough: 0.5, metal: 0.65, detail: 4 });
    b.push(compose(mat4(), x, 0.22, zEdge - 2.2, 0, 0, 0));
    b.cylinder(0.28, 0.34, 0.44, 12, true);
    b.pop();
    b.push(compose(mat4(), x, 0.5, zEdge - 2.2, 0, 0, 0));
    b.cylinder(0.26, 0.26, 0.2, 12, true);
    b.pop();
    b.push(compose(mat4(), x, 0.62, zEdge - 2.2, 0, 0, 0, 1, 1, 1));
    b.cylinder(0.3, 0.26, 0.12, 12, true);
    b.pop();
  }

  // ---- access ladders
  for (const x of [-46, 12, 58]) {
    b.mat({ color: STEEL(), rough: 0.5, metal: 0.8, detail: 4 });
    for (const s of [-0.28, 0.28]) {
      b.push(compose(mat4(), x + s, -1.0, zEdge + 0.14, 0, 0, 0));
      b.box(0.07, 2.3, 0.07);
      b.pop();
    }
    for (let i = 0; i < 6; i++) {
      b.push(compose(mat4(), x, -1.95 + i * 0.38, zEdge + 0.14, 0, 0, 0));
      b.box(0.6, 0.05, 0.05);
      b.pop();
    }
  }
}

export function addTerminalBuildings(b) {
  // ---------------- main warehouse
  const wx = -18, wz = -62, wl = 62, wd = 20, wh = 13;
  b.mat({ color: srgb('#3f4548'), rough: 0.78, metal: 0.1, detail: 2 });
  b.push(compose(mat4(), wx, wh / 2, wz, 0, 0, 0));
  b.box(wl, wh, wd);
  b.pop();
  // roof parapet
  b.mat({ color: CONCRETE(), rough: 0.75, metal: 0.08, detail: 2 });
  b.push(compose(mat4(), wx, wh + 0.4, wz, 0, 0, 0));
  b.box(wl + 1.0, 0.8, wd + 1.0);
  b.pop();
  // vertical ribbing on the facade
  b.mat({ color: srgb('#474d50'), rough: 0.72, metal: 0.15, detail: 2 });
  for (let i = 0; i < 30; i++) {
    b.push(compose(mat4(), wx - wl / 2 + 1.2 + i * 2.05, wh / 2, wz + wd / 2 + 0.12, 0, 0, 0));
    b.box(0.24, wh - 1.2, 0.24);
    b.pop();
  }
  // window band
  b.mat({ color: [0.01, 0.012, 0.014], rough: 0.15, metal: 0.2, detail: 0, emissive: [0.42, 0.5, 0.46] });
  b.push(compose(mat4(), wx, wh - 3.2, wz + wd / 2 + 0.05, 0, 0, 0));
  b.box(wl - 4, 1.0, 0.12);
  b.pop();
  // loading doors
  b.mat({ color: srgb('#2c3235'), rough: 0.6, metal: 0.4, detail: 3 });
  for (let i = 0; i < 5; i++) {
    b.push(compose(mat4(), wx - 22 + i * 11, 2.6, wz + wd / 2 + 0.2, 0, 0, 0));
    b.box(5.2, 5.2, 0.2);
    b.pop();
  }

  // ---------------- office block
  const ox = 44, oz = -66;
  b.mat({ color: srgb('#4a4e50'), rough: 0.7, metal: 0.15, detail: 2 });
  b.push(compose(mat4(), ox, 8, oz, 0, 0, 0));
  b.box(20, 16, 15);
  b.pop();
  // lit windows
  b.mat({ color: [0.01, 0.012, 0.014], rough: 0.1, metal: 0.2, detail: 0, emissive: [0.5, 0.55, 0.5] });
  for (let f = 0; f < 4; f++) {
    for (let i = 0; i < 8; i++) {
      if ((i + f) % 5 === 0) continue;
      b.push(compose(mat4(), ox - 8.6 + i * 2.45, 2.4 + f * 3.4, oz + 7.56, 0, 0, 0));
      b.box(1.7, 1.5, 0.08);
      b.pop();
    }
  }
  b.mat({ color: [0.02, 0.02, 0.022], rough: 0.2, metal: 0.3, detail: 0, emissive: [0.06, 0.07, 0.06] });
  b.push(compose(mat4(), ox, 16.3, oz, 0, 0, 0));
  b.box(20.4, 0.8, 15.4);
  b.pop();

  // ---------------- illuminated terminal sign
  b.mat({ color: [0.02, 0.02, 0.02], rough: 0.4, metal: 0.2, detail: 0, emissive: [1.4, 0.72, 0.3] });
  b.push(compose(mat4(), wx, wh + 2.2, wz + wd / 2 + 0.3, 0, 0, 0));
  b.box(13.5, 2.6, 0.35);
  b.pop();
  b.mat({ color: [0.02, 0.02, 0.02], rough: 0.4, metal: 0.3, detail: 0 });
  for (let i = 0; i < 5; i++) {
    b.push(compose(mat4(), wx - 6.5 + i * 3.2, wh + 2.2, wz + wd / 2 + 0.5, 0, 0, 0));
    b.box(1.6, 1.5, 0.06);
    b.pop();
  }
}

export function addLightTower(b, { x, z, height = 26, yaw = 0 }) {
  b.push(compose(mat4(), x, 0, z, yaw, 0, 0));
  b.mat({ color: STEEL(), rough: 0.55, metal: 0.75, detail: 4 });
  b.truss([0, 0, 0], [0, height, 0], 1.5, 1.5, 7, 0.11);
  // head frame
  b.push(compose(mat4(), 0, height + 0.5, 0.9, 0, 0, 0));
  b.box(4.4, 0.4, 0.5);
  b.pop();
  b.mat({ color: [0.05, 0.055, 0.06], rough: 0.4, metal: 0.6, detail: 4 });
  for (let i = 0; i < 4; i++) {
    b.push(compose(mat4(), -1.8 + i * 1.2, height + 1.15, 1.05, -0.5, 0, 0));
    b.box(0.85, 0.75, 0.35);
    b.pop();
  }
  b.pop();
  return { x, y: height + 1.1, z: z + 1.4 };
}

export function addFence(b, { x0 = -100, x1 = 100, z = -72, height = 2.6 }) {
  b.mat({ color: STEEL(), rough: 0.5, metal: 0.8, detail: 4 });
  for (let x = x0; x <= x1; x += 3.2) {
    b.push(compose(mat4(), x, height / 2, z, 0, 0, 0));
    b.box(0.07, height, 0.07);
    b.pop();
  }
  for (const y of [0.25, height * 0.55, height]) {
    b.push(compose(mat4(), (x0 + x1) / 2, y, z, 0, 0, 0));
    b.box(x1 - x0, 0.04, 0.05);
    b.pop();
  }
}

export function addProps(b, rng) {
  // ---- cable reels
  for (let i = 0; i < 3; i++) {
    const x = -58 + i * 3.2, z = 22 + (i % 2) * 2.4;
    b.mat({ color: srgb('#4a3b2a'), rough: 0.85, metal: 0.05, detail: 2 });
    b.push(compose(mat4(), x, 0.9, z, 0.2 * i, 0, Math.PI / 2));
    b.cylinder(1.0, 1.0, 1.4, 16, true);
    b.pop();
    b.mat({ color: [0.03, 0.03, 0.03], rough: 0.7, metal: 0.1, detail: 5 });
    b.push(compose(mat4(), x, 0.9, z, 0.2 * i, 0, Math.PI / 2));
    b.cylinder(1.06, 1.06, 1.0, 16, true);
    b.pop();
  }

  // ---- traffic cones
  for (let i = 0; i < 14; i++) {
    const x = -70 + rng() * 140;
    const z = 26 + rng() * 10;
    b.mat({ color: srgb('#b8451f'), rough: 0.75, metal: 0.02, detail: 0 });
    b.push(compose(mat4(), x, 0.02, z, 0, 0, 0));
    b.cylinder(0.06, 0.19, 0.62, 8, true);
    b.pop();
    b.push(compose(mat4(), x, 0.02, z, 0, 0, 0));
    b.box(0.42, 0.05, 0.42);
    b.pop();
    b.mat({ color: [0.6, 0.6, 0.58], rough: 0.6, metal: 0.05, detail: 0 });
    b.push(compose(mat4(), x, 0.02, z, 0, 0, 0));
    b.cylinder(0.11, 0.14, 0.12, 8, true);
    b.pop();
  }

  // ---- pallets + drums near the warehouse
  for (let i = 0; i < 9; i++) {
    const x = -40 + rng() * 70, z = -40 + rng() * 12;
    b.mat({ color: srgb('#5a4630'), rough: 0.85, metal: 0.02, detail: 2 });
    b.push(compose(mat4(), x, 0.09, z, rng() * 3.14, 0, 0));
    b.box(1.2, 0.18, 0.9);
    b.pop();
    b.push(compose(mat4(), x, 0.3, z, rng() * 3.14, 0, 0));
    b.box(1.1, 0.22, 0.85);
    b.pop();
  }
  for (let i = 0; i < 6; i++) {
    const x = 26 + rng() * 8, z = -30 + rng() * 6;
    b.mat({ color: srgb('#2e4a5c'), rough: 0.5, metal: 0.55, detail: 4 });
    b.push(compose(mat4(), x, 0.45, z, 0, 0, 0));
    b.cylinder(0.3, 0.3, 0.9, 12, true);
    b.pop();
  }

  // ---- reefer plug rack: the little green/red lights read well at night
  b.mat({ color: STEEL(), rough: 0.5, metal: 0.7, detail: 4 });
  b.push(compose(mat4(), 66, 2.4, -8, 0, 0, 0));
  b.box(0.3, 4.8, 9.0);
  b.pop();
  b.push(compose(mat4(), 66, 4.9, -8, 0, 0, 0));
  b.box(1.4, 0.16, 9.2);
  b.pop();

  // ---- fuel tank + pipe rack
  b.mat({ color: srgb('#585c5b'), rough: 0.55, metal: 0.5, detail: 4 });
  b.push(compose(mat4(), 72, 1.6, -46, 0, 0, 0));
  b.cylinder(1.6, 1.6, 6.0, 18, true);
  b.pop();
  b.push(compose(mat4(), 72, 1.6, -46, 0, 0, Math.PI / 2));
  b.cylinder(1.6, 1.6, 0.2, 18, true);
  b.pop();

  // ---- concrete barriers along the yard road
  for (let i = 0; i < 12; i++) {
    b.mat({ color: CONCRETE(), rough: 0.8, metal: 0.03, detail: 2 });
    b.push(compose(mat4(), -70 + i * 12.5, 0.45, -14, 0, 0, 0));
    b.box(2.2, 0.9, 0.6);
    b.pop();
  }

  // ---- small boat alongside the quay ladder (foreground interest)
  b.mat({ color: srgb('#8a8e8c'), rough: 0.5, metal: 0.1, detail: 4 });
  b.push(compose(mat4(), -34, -1.6, 42.5, 0.35, 0, 0));
  b.box(4.6, 0.75, 1.7);
  b.pop();
  b.push(compose(mat4(), -34, -1.05, 42.5, 0.35, 0, 0));
  b.mat({ color: [0.02, 0.03, 0.03], rough: 0.3, metal: 0.2, detail: 0, emissive: [0.3, 0.36, 0.32] });
  b.box(1.1, 0.06, 1.2);
  b.pop();
}
