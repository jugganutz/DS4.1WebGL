// Swaying cable-hung work lamps. Owns their geometry, transforms and light sources.

import { Builder } from '../engine/mesh.js';
import { mat4, compose, multiply, srgb, DEG } from '../engine/math.js';

export function buildLampMesh(def) {
  const b = new Builder(4000);
  const cord = def.cord;

  // cord
  b.mat({ color: [0.02, 0.02, 0.022], rough: 0.6, metal: 0.3, detail: 5 });
  b.push(compose(mat4(), 0, -cord / 2, 0, 0, 0, 0));
  b.cylinder(0.022, 0.022, cord, 6, false);
  b.pop();

  // clamp
  b.mat({ color: [0.1, 0.1, 0.11], rough: 0.5, metal: 0.8, detail: 4 });
  b.push(compose(mat4(), 0, -0.06, 0, 0, 0, 0));
  b.box(0.16, 0.16, 0.16);
  b.pop();

  // shade (downward opening cone)
  b.mat({ color: srgb('#2f3639'), rough: 0.42, metal: 0.6, detail: 3 });
  b.push(compose(mat4(), 0, -cord - 0.24, 0, 0, 0, 0));
  b.lathe([[0.66, -0.34], [0.62, -0.3], [0.34, -0.16], [0.16, 0.0]], 18, false);
  b.pop();

  // bright reflector inside the shade
  b.mat({ color: [0.9, 0.86, 0.78], rough: 0.3, metal: 0.1, detail: 0, emissive: [1.4, 1.05, 0.72] });
  b.push(compose(mat4(), 0, -cord - 0.30, 0, 0, 0, 0));
  b.cylinder(0.63, 0.16, 0.06, 18, false);
  b.pop();

  // bulb
  b.mat({ color: [1.0, 0.9, 0.7], rough: 0.1, metal: 0.0, detail: 0, emissive: [5.0, 3.5, 2.0] });
  b.push(compose(mat4(), 0, -cord - 0.42, 0, 0, 0, 0));
  b.sphere(0.15, 10, 6);
  b.pop();

  // protective cage
  b.mat({ color: [0.09, 0.09, 0.1], rough: 0.5, metal: 0.7, detail: 4 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    b.push(compose(mat4(), 0, -cord - 0.34, 0, 0, 0, a));
    b.box(0.72, 0.02, 0.02);
    b.pop();
  }

  return b.build();
}

const tmpR = mat4();
const tmpM = mat4();

export class LampSystem {
  constructor(defs, lights, glows, shafts) {
    this.defs = defs;
    this.lights = lights;
    this.glows = glows;
    this.shafts = shafts;
    this.matrices = new Float32Array(defs.length * 16);
    this.t = 0;

    // link light sources & glows to their rigs
    for (const d of defs) {
      d.light = lights.find((l) => l.source === d.id) || null;
      d.glow = glows.find((g) => g.dynamic === d.id) || null;
      d.shaft = shafts.find((s) => s.dynamic === d.id) || null;
      d.gust = 0;
    }
  }

  update(time, wind, rain) {
    this.t = time;
    const windAmp = 0.35 + wind * 1.6 + rain * 0.35;
    for (let i = 0; i < this.defs.length; i++) {
      const d = this.defs[i];
      // slow gust envelope so the lamps don't swing metronomically
      d.gust += (Math.sin(time * 0.23 + d.phase * 2.1) * 0.5 + 0.5 - d.gust) * 0.02;
      const amp = d.swing * windAmp * (0.55 + d.gust * 0.9);
      const a = Math.sin(time * d.freq + d.phase) * amp;
      const b = Math.cos(time * d.freq * 0.81 + d.phase * 1.7) * amp * 0.8;
      const spin = Math.sin(time * d.freq * 0.37 + d.phase) * amp * 0.5;

      // T(pivot) * Ry(spin) * Rz(a) * Rx(b)
      const R = compose(mat4(), d.pivot[0], d.pivot[1], d.pivot[2], spin, b, a, 1, 1, 1);
      this.matrices.set(R, i * 16);

      // world position of the bulb
      const lx = 0, ly = -d.cord - 0.42, lz = 0;
      const wx = R[0] * lx + R[4] * ly + R[8] * lz + R[12];
      const wy = R[1] * lx + R[5] * ly + R[9] * lz + R[13];
      const wz = R[2] * lx + R[6] * ly + R[10] * lz + R[14];

      let flicker = 1;
      if (d.flicker > 0) {
        const n = Math.sin(time * 31.0 + Math.sin(time * 7.3) * 4.0);
        flicker = 0.72 + 0.28 * Math.max(0, n) + (Math.sin(time * 3.1) > 0.86 ? -0.45 : 0);
        flicker = Math.max(0.15, flicker);
      }

      if (d.light) {
        d.light.pos = [wx, wy, wz];
        d.light.intensityMul = flicker;
      }
      if (d.glow) {
        d.glow.pos = [wx, wy - 0.05, wz];
        d.glow.flicker = flicker;
      }
      if (d.shaft) {
        d.shaft.pos = [wx, wy, wz];
        d.shaft.rot = [b, a, spin];
        d.shaft.flicker = flicker;
      }
    }
  }
}
