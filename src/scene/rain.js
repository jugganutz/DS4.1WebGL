// Rain volume: instanced billboard streaks wrapped around the camera on the GPU.

import { rng as makeRng } from '../engine/math.js';

export const RAIN_BOX = [76, 46, 76];

export function buildRainInstanceData(maxCount, seed = 4242) {
  const rng = makeRng(seed);
  const data = new Float32Array(maxCount * 8);
  for (let i = 0; i < maxCount; i++) {
    const o = i * 8;
    data[o] = rng() * RAIN_BOX[0];
    data[o + 1] = rng() * RAIN_BOX[1];
    data[o + 2] = rng() * RAIN_BOX[2];
    data[o + 3] = rng();
    data[o + 4] = 13 + rng() * 9;              // fall speed
    data[o + 5] = 0.40 + rng() * 0.65;         // streak length
    data[o + 6] = 0.012 + rng() * 0.016;       // width
    data[o + 7] = 0.5 + rng() * 0.9;           // brightness
  }
  return data;
}

export function buildRainBaseMesh() {
  const data = new Float32Array(6 * 18);
  const corners = [
    [-0.5, 0], [0.5, 0], [0.5, 1],
    [-0.5, 0], [0.5, 1], [-0.5, 1],
  ];
  for (let i = 0; i < 6; i++) {
    const o = i * 18;
    data[o] = corners[i][0];
    data[o + 1] = corners[i][1];
    data[o + 2] = 0;
    data[o + 4] = 0; // normal unused
    data[o + 11] = 0.5;
  }
  return data;
}
