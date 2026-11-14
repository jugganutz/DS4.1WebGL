// A 170 m container ship: lofted hull, deck cargo, accommodation block, funnel, masts.

import { mat4, compose, srgb, smoothstep } from '../../engine/math.js';
import { addContainer, pickColor } from './containers.js';

const DECK = 9.2;
const KEEL = -6.4;
const BEAM = 32;
const LEN = 170;

// Half-section (fraction of half beam, y) from keel to deck edge.
const PROFILE = [
  [0.0, KEEL],
  [0.16, KEEL + 0.25],
  [0.34, KEEL + 0.75],
  [0.55, KEEL + 1.9],
  [0.72, KEEL + 3.2],
  [0.86, KEEL + 4.6],
  [0.95, KEEL + 6.0],
  [1.0, DECK - 1.2],
  [1.0, DECK],
];

function widthAt(t) {
  // t: 0 = stern, 1 = bow
  if (t < 0.12) return 0.93 + 0.07 * (t / 0.12);
  if (t < 0.7) return 1.0;
  const k = smoothstep(0.7, 1.0, t);
  return 1.0 - Math.pow(k, 1.5) * 0.92;
}

function sheerAt(t) {
  const bow = Math.pow(smoothstep(0.72, 1.0, t), 2.0) * 3.4;
  const stern = Math.pow(smoothstep(0.12, 0.0, t), 2.0) * 0.7;
  return bow + stern;
}

export function addShip(b, { x = 0, z = 0, yaw = 0 }) {
  b.push(compose(mat4(), x, 0, z, yaw, 0, 0));

  const stations = 34;
  const halfB = BEAM / 2;

  // Build the section contour: port deck edge -> keel -> starboard deck edge.
  const contour = [];
  for (let j = PROFILE.length - 1; j >= 0; j--) contour.push([-PROFILE[j][0], PROFILE[j][1]]);
  for (let j = 1; j < PROFILE.length; j++) contour.push([PROFILE[j][0], PROFILE[j][1]]);
  const NC = contour.length;

  const sec = [];
  for (let i = 0; i < stations; i++) {
    const t = i / (stations - 1);
    const xpos = -LEN / 2 + LEN * t;
    const w = widthAt(t);
    const sheer = sheerAt(t);
    const ring = [];
    for (let j = 0; j < NC; j++) {
      const [zr, y] = contour[j];
      const zz = zr * halfB * w;
      const yy = y + (y > 0 ? sheer : 0);
      ring.push([xpos, yy, zz]);
    }
    // section normals
    const norms = [];
    for (let j = 0; j < NC; j++) {
      const a = ring[Math.max(0, j - 1)];
      const c = ring[Math.min(NC - 1, j + 1)];
      let nz = c[1] - a[1];
      let ny = -(c[2] - a[2]);
      const len = Math.hypot(nz, ny) || 1;
      nz /= len; ny /= len;
      // outward test against an interior point
      if (nz * ring[j][2] + ny * (ring[j][1] - 2.0) < 0) { nz = -nz; ny = -ny; }
      norms.push([0, ny, nz]);
    }
    sec.push({ ring, norms, t });
  }

  // ---- hull plating
  for (let i = 0; i < stations - 1; i++) {
    const A = sec[i], B = sec[i + 1];
    for (let j = 0; j < NC - 1; j++) {
      const p0 = A.ring[j], p1 = A.ring[j + 1], p2 = B.ring[j + 1], p3 = B.ring[j];
      const n = [
        (A.norms[j][0] + A.norms[j + 1][0] + B.norms[j][0] + B.norms[j + 1][0]) * 0.25,
        (A.norms[j][1] + A.norms[j + 1][1] + B.norms[j][1] + B.norms[j + 1][1]) * 0.25,
        (A.norms[j][2] + A.norms[j + 1][2] + B.norms[j][2] + B.norms[j + 1][2]) * 0.25,
      ];
      const my = (p0[1] + p1[1] + p2[1] + p3[1]) * 0.25;
      if (my < -1.6) {
        b.mat({ color: srgb('#5a2320'), rough: 0.62, metal: 0.25, detail: 6 });
      } else if (my < 0.1) {
        b.mat({ color: srgb('#1b1f24'), rough: 0.55, metal: 0.3, detail: 4 }); // boot topping
      } else {
        b.mat({ color: srgb('#2b3238'), rough: 0.5, metal: 0.35, detail: 6 });
      }
      b.quadN(p0, p1, p2, p3, n, 1);
    }
  }

  // ---- deck
  b.mat({ color: srgb('#33393d'), rough: 0.72, metal: 0.2, detail: 2 });
  for (let i = 0; i < stations - 1; i++) {
    const A = sec[i], B = sec[i + 1];
    const j = NC - 1;
    const p0 = [A.ring[j][0], A.ring[j][1], -A.ring[j][2] * 0.0 + A.ring[j][2]];
    const p3 = [B.ring[j][0], B.ring[j][1], B.ring[j][2]];
    const p1 = [A.ring[0][0], A.ring[0][1], A.ring[0][2]];
    const p2 = [B.ring[0][0], B.ring[0][1], B.ring[0][2]];
    b.quadN(p0, p1, p2, p3, [0, 1, 0], 1);
  }

  // ---- bulwark / rail along both deck edges
  b.mat({ color: srgb('#4d4b46'), rough: 0.62, metal: 0.15, detail: 2 });
  for (let i = 0; i < stations - 1; i++) {
    for (const jj of [0, NC - 1]) {
      const A = sec[i].ring[jj], B = sec[i + 1].ring[jj];
      const h = 1.05;
      const zdir = jj === 0 ? -1 : 1;
      const p0 = A, p1 = [A[0], A[1] + h, A[2]], p2 = [B[0], B[1] + h, B[2]], p3 = B;
      b.quadN(p0, p1, p2, p3, [0, 0, zdir], 1);
    }
  }

  // ---- company stripe along the hull side (near quay)
  b.mat({ color: srgb('#7d2a22'), rough: 0.45, metal: 0.3, detail: 2, emissive: [0.01, 0.002, 0.002] });
  for (let i = 0; i < stations - 1; i++) {
    const A = sec[i].ring[0], B = sec[i + 1].ring[0];
    const y0 = 2.6, y1 = 3.7;
    const p0 = [A[0], A[1] + y0 - 7.0, A[2] - 0.06];
    const p1 = [A[0], A[1] + y1 - 7.0, A[2] - 0.06];
    const p2 = [B[0], B[1] + y1 - 7.0, B[2] - 0.06];
    const p3 = [B[0], B[1] + y0 - 7.0, B[2] - 0.06];
    b.quadN(p0, p1, p2, p3, [0, 0, -1], 1);
  }

  /* --------------------------------------------------------- deck cargo */
  const rng = (() => { let s = 991; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; })();
  const rows = 5;
  const bays = 8;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < bays; c++) {
      if (rng() < 0.12) continue;
      const cx = -52 + c * 13.4 + 6;
      const cz = -11.2 + r * 5.6;
      const stack = 1 + Math.floor(rng() * 3.4);
      const color = pickColor(rng);
      for (let k = 0; k < stack; k++) {
        addContainer(b, {
          x: cx + (rng() - 0.5) * 0.2, y: DECK + 0.1 + k * 2.59, z: cz + (rng() - 0.5) * 0.2,
          yaw: 0, len: rng() < 0.2 ? 6.06 : 12.19, color, seed: rng() * 999,
        });
      }
    }
  }

  /* -------------------------------------------------- accommodation block */
  const sternX = -LEN / 2 + 6;
  b.mat({ color: srgb('#6b6962'), rough: 0.62, metal: 0.1, detail: 2 });
  b.push(compose(mat4(), sternX + 4, DECK + 10.5, 0, 0, 0, 0));
  b.box(14, 21, 15);
  b.pop();
  // stepped front
  b.push(compose(mat4(), sternX + 12.2, DECK + 12.5, 0, 0, 0, 0));
  b.box(3, 15, 13);
  b.pop();

  // window strips (emissive)
  b.mat({ color: [0.02, 0.025, 0.03], rough: 0.12, metal: 0.2, detail: 0, emissive: [0.55, 0.42, 0.24] });
  for (let f = 0; f < 7; f++) {
    const yy = DECK + 2.6 + f * 2.75;
    b.push(compose(mat4(), sternX + 11.7, yy, 0, 0, 0, 0));
    b.box(0.16, 0.85, 12.4);
    b.pop();
    b.push(compose(mat4(), sternX + 4, yy, 7.55, 0, 0, 0));
    b.box(13.6, 0.7, 0.12);
    b.pop();
    b.push(compose(mat4(), sternX + 4, yy, -7.55, 0, 0, 0));
    b.box(13.6, 0.7, 0.12);
    b.pop();
  }
  // bridge wings
  b.mat({ color: srgb('#64625c'), rough: 0.6, metal: 0.15, detail: 2 });
  b.push(compose(mat4(), sternX + 11.5, DECK + 19.4, 0, 0, 0, 0));
  b.box(3.4, 2.2, 21);
  b.pop();
  b.mat({ color: [0.02, 0.03, 0.035], rough: 0.1, metal: 0.1, detail: 0, emissive: [0.35, 0.45, 0.4] });
  b.push(compose(mat4(), sternX + 13.25, DECK + 20.4, 0, 0, 0, 0));
  b.box(0.12, 1.5, 18);
  b.pop();

  // funnel
  b.mat({ color: srgb('#b03a2e'), rough: 0.55, metal: 0.25, detail: 3 });
  b.push(compose(mat4(), sternX - 6, DECK + 17.5, 0, 0, 0.05, 0));
  b.box(7.5, 12, 9.5);
  b.pop();
  b.mat({ color: [0.05, 0.05, 0.06], rough: 0.6, metal: 0.3, detail: 3 });
  b.push(compose(mat4(), sternX - 6, DECK + 24.0, 0, 0, 0, 0));
  b.box(7.8, 1.0, 9.8);
  b.pop();

  // mast + radar
  b.mat({ color: srgb('#6d7376'), rough: 0.5, metal: 0.6, detail: 3 });
  b.push(compose(mat4(), sternX + 10, DECK + 28.5, 0, 0, 0, 0));
  b.cylinder(0.18, 0.28, 12, 8, true);
  b.pop();
  b.push(compose(mat4(), sternX + 10, DECK + 32.5, 0, 0, 0, 0));
  b.box(3.2, 0.5, 0.3);
  b.pop();

  b.pop();

  return {
    deck: DECK,
    length: LEN,
    beam: BEAM,
    sternX: x + sternX,
    mooring: [
      { x: x - 62, y: DECK + 0.9, z: z - BEAM / 2 + 0.5 },
      { x: x - 40, y: DECK + 0.9, z: z - BEAM / 2 + 0.5 },
      { x: x + 30, y: DECK + 0.9, z: z - BEAM / 2 + 0.5 },
      { x: x + 58, y: DECK + 0.9, z: z - BEAM / 2 + 0.5 },
      { x: x + 72, y: DECK + 1.4, z: z - BEAM / 2 + 0.5 },
    ],
  };
}
