// Sea surface: non-uniform grid so the near water is dense and the horizon is cheap.

import { Builder } from '../engine/mesh.js';
import { LAYOUT } from './world.js';

function axis(min, max, denseFrom, denseTo, step, growth) {
  const out = [];
  // dense middle
  for (let v = denseFrom; v <= denseTo + 1e-6; v += step) out.push(v);
  // grow outward in both directions
  let s = step;
  let v = denseTo;
  while (v < max) { s *= growth; v += s; out.push(Math.min(v, max)); }
  s = step;
  v = denseFrom;
  const low = [];
  while (v > min) { s *= growth; v -= s; low.push(Math.max(v, min)); }
  return low.reverse().concat(out);
}

export function buildSeaMesh() {
  const b = new Builder(24000);
  const xs = axis(-4200, 4200, -140, 140, 3.2, 1.34);
  const zs = axis(33, 5200, 33, 170, 3.2, 1.30);
  const y = LAYOUT.seaLevel;

  for (let j = 0; j < zs.length - 1; j++) {
    for (let i = 0; i < xs.length - 1; i++) {
      const x0 = xs[i], x1 = xs[i + 1], z0 = zs[j], z1 = zs[j + 1];
      b.quadUV(
        [x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0],
        [0, 1, 0], [x0, z0], [x0, z1], [x1, z1], [x1, z0],
      );
    }
  }
  return b.build();
}
