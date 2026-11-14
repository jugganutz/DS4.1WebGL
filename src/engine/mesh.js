// Procedural geometry toolkit. Everything in the scene is built from these primitives,
// baked into one interleaved vertex buffer with per-vertex material data.

import { VERTEX_FLOATS } from './gl.js';
import { mat4, identity, multiply, compose, normalMatrix } from './math.js';

const DEFAULT_COLOR = [0.5, 0.5, 0.5];
const NO_EMISSIVE = [0, 0, 0];

export class Builder {
  constructor(cap = 120000) {
    this.stride = VERTEX_FLOATS;
    this.v = new Float32Array(cap * this.stride);
    this.nv = 0;
    this.idx = new Uint32Array(cap * 2);
    this.ni = 0;

    this.M = mat4();
    this.NM = mat4();
    this.stack = [];
    this._tmpM = mat4();

    this.color = [0.5, 0.5, 0.5];
    this.rough = 0.7;
    this.metal = 0.0;
    this.detail = 0;
    this.emissive = [0, 0, 0];
    this.ao = 1.0;
    this.matStack = [];
  }

  /* --------------------------------------------------------- state */

  // Sets the full material. Unspecified fields reset to defaults so emissive
  // state can never leak from one part of the scene into another.
  mat(m = {}) {
    this.color = m.color || DEFAULT_COLOR;
    this.rough = m.rough ?? 0.7;
    this.metal = m.metal ?? 0.0;
    this.detail = m.detail ?? 0;
    this.emissive = m.emissive || NO_EMISSIVE;
    this.ao = m.ao ?? 1.0;
    return this;
  }

  push(m) {
    this.stack.push(this.M.slice());
    this.matStack.push({ color: this.color, rough: this.rough, metal: this.metal, detail: this.detail, emissive: this.emissive, ao: this.ao });
    if (m) this.applyMatrix(m);
    return this;
  }

  pop() {
    this.M = this.stack.pop() || mat4();
    const m = this.matStack.pop();
    if (m) Object.assign(this, m);
    this.NM = normalMatrix(mat4(), this.M);
    return this;
  }

  applyMatrix(m) {
    const out = mat4();
    multiply(out, this.M, m);
    this.M = out;
    this.NM = normalMatrix(mat4(), out);
    return this;
  }

  at(x, y, z, yaw = 0, pitch = 0, roll = 0, sx = 1, sy = 1, sz = 1) {
    return this.applyMatrix(compose(mat4(), x, y, z, yaw, pitch, roll, sx, sy, sz));
  }

  /* ------------------------------------------------------ vertices */

  grow() {
    const nv = new Float32Array(this.v.length * 2);
    nv.set(this.v);
    this.v = nv;
    const ni = new Uint32Array(this.idx.length * 2);
    ni.set(this.idx);
    this.idx = ni;
  }

  vert(p, n, u, v) {
    if ((this.nv + 1) * this.stride > this.v.length) this.grow();
    const o = this.nv * this.stride;
    const M = this.M, NM = this.NM;
    const x = p[0], y = p[1], z = p[2];
    const d = this.v;
    d[o] = M[0] * x + M[4] * y + M[8] * z + M[12];
    d[o + 1] = M[1] * x + M[5] * y + M[9] * z + M[13];
    d[o + 2] = M[2] * x + M[6] * y + M[10] * z + M[14];
    let nx = NM[0] * n[0] + NM[4] * n[1] + NM[8] * n[2];
    let ny = NM[1] * n[0] + NM[5] * n[1] + NM[9] * n[2];
    let nz = NM[2] * n[0] + NM[6] * n[1] + NM[10] * n[2];
    const nl = Math.hypot(nx, ny, nz) || 1;
    d[o + 3] = nx / nl;
    d[o + 4] = ny / nl;
    d[o + 5] = nz / nl;
    d[o + 6] = u;
    d[o + 7] = v;
    d[o + 8] = this.color[0];
    d[o + 9] = this.color[1];
    d[o + 10] = this.color[2];
    d[o + 11] = this.rough;
    d[o + 12] = this.metal;
    d[o + 13] = this.detail;
    d[o + 14] = this.ao;
    d[o + 15] = this.emissive[0];
    d[o + 16] = this.emissive[1];
    d[o + 17] = this.emissive[2];
    return this.nv++;
  }

  tri(a, b, c) {
    if ((this.ni + 3) > this.idx.length) {
      const ni = new Uint32Array(this.idx.length * 2);
      ni.set(this.idx);
      this.idx = ni;
    }
    this.idx[this.ni++] = a;
    this.idx[this.ni++] = b;
    this.idx[this.ni++] = c;
  }

  quadUV(p0, p1, p2, p3, n, uv0, uv1, uv2, uv3) {
    const a = this.vert(p0, n, uv0[0], uv0[1]);
    const b = this.vert(p1, n, uv1[0], uv1[1]);
    const c = this.vert(p2, n, uv2[0], uv2[1]);
    const d = this.vert(p3, n, uv3[0], uv3[1]);
    this.tri(a, b, c);
    this.tri(a, c, d);
  }

  // Quad with computed flat normal; points must be in CCW order seen from outside.
  quad(p0, p1, p2, p3, uvScale = 1) {
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    const vx = p3[0] - p0[0], vy = p3[1] - p0[1], vz = p3[2] - p0[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const w = Math.hypot(ux, uy, uz) * uvScale;
    const h = Math.hypot(vx, vy, vz) * uvScale;
    this.quadUV(p0, p1, p2, p3, [nx, ny, nz], [0, 0], [w, 0], [w, h], [0, h]);
  }

  // Quad with a supplied normal; winding is corrected automatically.
  quadN(p0, p1, p2, p3, n, uvScale = 1) {
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    const vx = p3[0] - p0[0], vy = p3[1] - p0[1], vz = p3[2] - p0[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const w = Math.hypot(ux, uy, uz) * uvScale;
    const h = Math.hypot(vx, vy, vz) * uvScale;
    if (cx * n[0] + cy * n[1] + cz * n[2] < 0) {
      return this.quadUV(p0, p3, p2, p1, n, [0, 0], [w, 0], [w, h], [0, h]);
    }
    return this.quadUV(p0, p1, p2, p3, n, [0, 0], [w, 0], [w, h], [0, h]);
  }

  /* ------------------------------------------------------ primitives */

  box(sx, sy, sz, uvScale = 1) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const W = sx * uvScale, H = sy * uvScale, D = sz * uvScale;
    // +Z
    this.quadUV([-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz], [0, 0, 1],
      [0, 0], [W, 0], [W, H], [0, H]);
    // -Z
    this.quadUV([hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz], [0, 0, -1],
      [0, 0], [W, 0], [W, H], [0, H]);
    // +X
    this.quadUV([hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [1, 0, 0],
      [0, 0], [D, 0], [D, H], [0, H]);
    // -X
    this.quadUV([-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-1, 0, 0],
      [0, 0], [D, 0], [D, H], [0, H]);
    // +Y
    this.quadUV([-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz], [0, 1, 0],
      [0, 0], [W, 0], [W, D], [0, D]);
    // -Y
    this.quadUV([-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz], [0, -1, 0],
      [0, 0], [W, 0], [W, D], [0, D]);
    return this;
  }

  boxMM(min, max, uvScale = 1) {
    this.push(compose(mat4(), (min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2, 0, 0, 0,
      max[0] - min[0], max[1] - min[1], max[2] - min[2]));
    this.box(1, 1, 1, uvScale);
    this.pop();
    return this;
  }

  // Horizontal plane, subdivided, normal up.
  planeXZ(sx, sz, nx = 1, nz = 1, y = 0) {
    const hx = sx / 2, hz = sz / 2;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x0 = -hx + (sx * i) / nx, x1 = -hx + (sx * (i + 1)) / nx;
        const z0 = -hz + (sz * j) / nz, z1 = -hz + (sz * (j + 1)) / nz;
        this.quadUV(
          [x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0],
          [0, 1, 0],
          [x0, z0], [x0, z1], [x1, z1], [x1, z0],
        );
      }
    }
    return this;
  }

  cylinder(rTop, rBot, h, segs = 16, caps = true) {
    const hy = h / 2;
    const slope = (rBot - rTop) / h;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const n0 = [c0, slope, s0], n1 = [c1, slope, s1];
      const p00 = [c0 * rBot, -hy, s0 * rBot], p01 = [c1 * rBot, -hy, s1 * rBot];
      const p10 = [c0 * rTop, hy, s0 * rTop], p11 = [c1 * rTop, hy, s1 * rTop];
      const u0 = (i / segs) * Math.PI * 2 * Math.max(rTop, rBot);
      const u1 = ((i + 1) / segs) * Math.PI * 2 * Math.max(rTop, rBot);
      const a = this.vert(p00, n0, u0, 0);
      const b = this.vert(p10, n0, u0, h);
      const c = this.vert(p11, n1, u1, h);
      const d = this.vert(p01, n1, u1, 0);
      this.tri(a, b, c);
      this.tri(a, c, d);
      if (caps) {
        if (rTop > 0.0001) {
          const ca = this.vert([0, hy, 0], [0, 1, 0], 0, 0);
          const cb = this.vert(p10, [0, 1, 0], c0 * rTop, s0 * rTop);
          const cc = this.vert(p11, [0, 1, 0], c1 * rTop, s1 * rTop);
          this.tri(ca, cb, cc);
        }
        if (rBot > 0.0001) {
          const ca = this.vert([0, -hy, 0], [0, -1, 0], 0, 0);
          const cb = this.vert(p01, [0, -1, 0], c1 * rBot, s1 * rBot);
          const cc = this.vert(p00, [0, -1, 0], c0 * rBot, s0 * rBot);
          this.tri(ca, cb, cc);
        }
      }
    }
    return this;
  }

  sphere(r, segs = 16, rings = 10) {
    for (let j = 0; j < rings; j++) {
      const v0 = j / rings, v1 = (j + 1) / rings;
      const t0 = v0 * Math.PI, t1 = v1 * Math.PI;
      for (let i = 0; i < segs; i++) {
        const u0 = (i / segs) * Math.PI * 2, u1 = ((i + 1) / segs) * Math.PI * 2;
        const p = (t, u) => [Math.sin(t) * Math.cos(u) * r, Math.cos(t) * r, Math.sin(t) * Math.sin(u) * r];
        const n = (t, u) => [Math.sin(t) * Math.cos(u), Math.cos(t), Math.sin(t) * Math.sin(u)];
        const a = this.vert(p(t0, u0), n(t0, u0), u0 * r, t0 * r);
        const b = this.vert(p(t1, u0), n(t1, u0), u0 * r, t1 * r);
        const c = this.vert(p(t1, u1), n(t1, u1), u1 * r, t1 * r);
        const d = this.vert(p(t0, u1), n(t0, u1), u1 * r, t0 * r);
        this.tri(a, b, c);
        this.tri(a, c, d);
      }
    }
    return this;
  }

  // Revolve a 2D profile [[r,y],...] around Y.
  lathe(profile, segs = 16, closeEnds = false) {
    const n = profile.length;
    for (let i = 0; i < n - 1; i++) {
      const p0 = profile[i], p1 = profile[i + 1];
      const dr = p1[0] - p0[0], dy = p1[1] - p0[1];
      const l = Math.hypot(dr, dy) || 1;
      const nr = dy / l, ny = -dr / l;
      for (let s = 0; s < segs; s++) {
        const a0 = (s / segs) * Math.PI * 2, a1 = ((s + 1) / segs) * Math.PI * 2;
        const c0 = Math.cos(a0), sn0 = Math.sin(a0), c1 = Math.cos(a1), sn1 = Math.sin(a1);
        const A = this.vert([p0[0] * c0, p0[1], p0[0] * sn0], [nr * c0, ny, nr * sn0], (s / segs) * 6, p0[1]);
        const B = this.vert([p1[0] * c0, p1[1], p1[0] * sn0], [nr * c0, ny, nr * sn0], (s / segs) * 6, p1[1]);
        const C = this.vert([p1[0] * c1, p1[1], p1[0] * sn1], [nr * c1, ny, nr * sn1], ((s + 1) / segs) * 6, p1[1]);
        const D = this.vert([p0[0] * c1, p0[1], p0[0] * sn1], [nr * c1, ny, nr * sn1], ((s + 1) / segs) * 6, p0[1]);
        this.tri(A, B, C);
        this.tri(A, C, D);
      }
    }
    if (closeEnds) {
      const a = profile[0], b = profile[n - 1];
      if (a[0] > 0) {
        for (let s = 0; s < segs; s++) {
          const a0 = (s / segs) * Math.PI * 2, a1 = ((s + 1) / segs) * Math.PI * 2;
          const c = this.vert([0, a[1], 0], [0, -1, 0], 0, 0);
          const p1 = this.vert([a[0] * Math.cos(a0), a[1], a[0] * Math.sin(a0)], [0, -1, 0], 0, 0);
          const p2 = this.vert([a[0] * Math.cos(a1), a[1], a[0] * Math.sin(a1)], [0, -1, 0], 0, 0);
          this.tri(c, p1, p2);
        }
      }
      if (b[0] > 0) {
        for (let s = 0; s < segs; s++) {
          const a0 = (s / segs) * Math.PI * 2, a1 = ((s + 1) / segs) * Math.PI * 2;
          const c = this.vert([0, b[1], 0], [0, 1, 0], 0, 0);
          const p1 = this.vert([b[0] * Math.cos(a1), b[1], b[0] * Math.sin(a1)], [0, 1, 0], 0, 0);
          const p2 = this.vert([b[0] * Math.cos(a0), b[1], b[0] * Math.sin(a0)], [0, 1, 0], 0, 0);
          this.tri(c, p1, p2);
        }
      }
    }
    return this;
  }

  // Thin box between two points (struts, beams, truss members).
  strut(p0, p1, w, h = null) {
    const hh = h === null ? w : h;
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-5) return this;
    const yaw = Math.atan2(dx, dz);
    const pitch = -Math.asin(dy / len);
    const m = compose(mat4(), (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2, yaw, pitch, 0, 1, 1, 1);
    this.push(m);
    this.box(w, hh, len, 1);
    this.pop();
    return this;
  }

  // Swept tube along a polyline (hoses, pipes, rails).
  tube(points, radius, segs = 8) {
    const n = points.length;
    if (n < 2) return this;
    const up = [0, 1, 0];
    let prevN = null;
    const rings = [];
    for (let i = 0; i < n; i++) {
      const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
      let t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const tl = Math.hypot(t[0], t[1], t[2]) || 1;
      t = [t[0] / tl, t[1] / tl, t[2] / tl];
      let ref = prevN || (Math.abs(t[1]) > 0.9 ? [1, 0, 0] : up);
      let nx = ref[1] * t[2] - ref[2] * t[1];
      let ny = ref[2] * t[0] - ref[0] * t[2];
      let nz = ref[0] * t[1] - ref[1] * t[0];
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      prevN = [nx, ny, nz];
      const bx = t[1] * nz - t[2] * ny, by = t[2] * nx - t[0] * nz, bz = t[0] * ny - t[1] * nx;
      const ring = [];
      for (let s = 0; s < segs; s++) {
        const a2 = (s / segs) * Math.PI * 2;
        const c = Math.cos(a2), si = Math.sin(a2);
        const nrm = [nx * c + bx * si, ny * c + by * si, nz * c + bz * si];
        ring.push([
          points[i][0] + nrm[0] * radius,
          points[i][1] + nrm[1] * radius,
          points[i][2] + nrm[2] * radius,
          nrm[0], nrm[1], nrm[2],
        ]);
      }
      rings.push(ring);
    }
    for (let i = 0; i < n - 1; i++) {
      for (let s = 0; s < segs; s++) {
        const s1 = (s + 1) % segs;
        const a = rings[i][s], b = rings[i][s1], c = rings[i + 1][s1], d = rings[i + 1][s];
        const va = this.vert([a[0], a[1], a[2]], [a[3], a[4], a[5]], s / segs, i);
        const vb = this.vert([b[0], b[1], b[2]], [b[3], b[4], b[5]], (s + 1) / segs, i);
        const vc = this.vert([c[0], c[1], c[2]], [c[3], c[4], c[5]], (s + 1) / segs, i + 1);
        const vd = this.vert([d[0], d[1], d[2]], [d[3], d[4], d[5]], s / segs, i + 1);
        this.tri(va, vd, vc);
        this.tri(va, vc, vb);
      }
    }
    return this;
  }

  // Square-section lattice tower between two points.
  truss(a, b, width, height, bays, thick = 0.09) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz);
    const dir = [dx / len, dy / len, dz / len];
    // Perpendicular basis
    let side = [1, 0, 0];
    if (Math.abs(dir[0]) > 0.9) side = [0, 0, 1];
    let nx = dir[1] * side[2] - dir[2] * side[1];
    let ny = dir[2] * side[0] - dir[0] * side[2];
    let nz = dir[0] * side[1] - dir[1] * side[0];
    let l = Math.hypot(nx, ny, nz) || 1;
    const sx = [nx / l, ny / l, nz / l];
    const sy = [dir[1] * sx[2] - dir[2] * sx[1], dir[2] * sx[0] - dir[0] * sx[2], dir[0] * sx[1] - dir[1] * sx[0]];
    const hw = width / 2, hh = height / 2;
    const corner = (t, i) => {
      const ox = (i === 0 || i === 3 ? -hw : hw);
      const oy = (i < 2 ? -hh : hh);
      return [
        a[0] + dx * t + sx[0] * ox + sy[0] * oy,
        a[1] + dy * t + sx[1] * ox + sy[1] * oy,
        a[2] + dz * t + sx[2] * ox + sy[2] * oy,
      ];
    };
    for (let i = 0; i < 4; i++) this.strut(corner(0, i), corner(1, i), thick);
    for (let k = 0; k <= bays; k++) {
      const t = k / bays;
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        this.strut(corner(t, i), corner(t, j), thick * 0.6);
      }
      if (k < bays) {
        const t1 = (k + 1) / bays;
        for (let i = 0; i < 4; i++) {
          const j = (i + 1) % 4;
          if ((k + i) % 2) this.strut(corner(t, i), corner(t1, j), thick * 0.55);
          else this.strut(corner(t, j), corner(t1, i), thick * 0.55);
        }
      }
    }
    return this;
  }

  ring(rIn, rOut, segs = 24) {
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      this.quadUV(
        [c0 * rOut, 0, s0 * rOut], [c1 * rOut, 0, s1 * rOut],
        [c1 * rIn, 0, s1 * rIn], [c0 * rIn, 0, s0 * rIn],
        [0, 1, 0], [0, 0], [1, 0], [1, 1], [0, 1],
      );
    }
    return this;
  }

  build(withIndex = true) {
    return {
      data: this.v.subarray(0, this.nv * this.stride),
      index: withIndex ? this.idx.subarray(0, this.ni) : null,
      vertices: this.nv,
      triangles: this.ni / 3,
    };
  }
}

// Utility: catenary-ish sag points between two anchors.
export function sagPoints(a, b, sag, segs = 10) {
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const x = a[0] + (b[0] - a[0]) * t;
    const z = a[2] + (b[2] - a[2]) * t;
    const y = a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag;
    pts.push([x, y, z]);
  }
  return pts;
}
