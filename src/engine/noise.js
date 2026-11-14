// CPU-side procedural texture generation. Produces tileable noise that the
// shaders use for surface grit, rust, puddle breakup and rain jitter.

function hash2(x, y, seed = 0) {
  let h = x * 374761393 + y * 668265263 + seed * 1442695040888963407;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

function smooth(t) { return t * t * (3 - 2 * t); }

// Tileable value noise: lattice wraps at `period`.
function valueNoise(x, y, period, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = smooth(x - xi), fy = smooth(y - yi);
  const x0 = ((xi % period) + period) % period;
  const y0 = ((yi % period) + period) % period;
  const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
  const a = hash2(x0, y0, seed), b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed), d = hash2(x1, y1, seed);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

export function fbm2(x, y, period, octaves, seed, gain = 0.5) {
  let sum = 0, amp = 0.5, norm = 0, p = period;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * p, y * p, p, seed + i * 17);
    norm += amp;
    amp *= gain;
    p *= 2;
  }
  return sum / norm;
}

export function ridged2(x, y, period, octaves, seed) {
  let sum = 0, amp = 0.5, norm = 0, p = period;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise(x * p, y * p, p, seed + i * 31) * 2 - 1);
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5;
    p *= 2;
  }
  return sum / norm;
}

/**
 * 512x512 RGBA:
 *   R - low frequency blotches (rust, water stains, dirt)
 *   G - high frequency grit (concrete, asphalt)
 *   B - ridged turbulence (scratches, streaks)
 *   A - white noise (dithering / jitter)
 */
export function makeNoiseTexture(size = 512, seed = 1337) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const r = fbm2(u, v, 4, 4, seed);
      const g = fbm2(u, v, 32, 3, seed + 100);
      const b = ridged2(u, v, 8, 4, seed + 200);
      const a = hash2(x, y, seed + 300);
      const i = (y * size + x) * 4;
      data[i] = Math.round(r * 255);
      data[i + 1] = Math.round(g * 255);
      data[i + 2] = Math.round(b * 255);
      data[i + 3] = Math.round(a * 255);
    }
  }
  return { data, size };
}

/** Tangent-space normal map derived from the grit channel. */
export function makeNormalTexture(size = 512, seed = 77, strength = 2.2) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const n = fbm2(u, v, 16, 5, seed) * 0.6 + ridged2(u, v, 6, 3, seed + 9) * 0.4;
      h[y * size + x] = n;
    }
  }
  const data = new Uint8Array(size * size * 4);
  const at = (x, y) => h[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      data[i] = Math.round((-dx / len * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((-dy / len * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  return { data, size };
}

/**
 * Procedural stencil atlas for container markings, signage and lane paint.
 * Drawn with Canvas2D at load time; no external assets.
 */
export function makeSignTexture(size = 512) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);

  // quadrant 0: container owner code block (white on transparent-ish black)
  g.save();
  g.translate(0, 0);
  g.fillStyle = '#fff';
  g.font = 'bold 44px monospace';
  g.textBaseline = 'top';
  const codes = ['MAEU', 'MSCU', 'CMAU', 'HLXU', 'TGHU', 'SEGU'];
  for (let i = 0; i < 6; i++) {
    g.fillText(codes[i], 16, 14 + i * 62);
    g.font = 'bold 34px monospace';
    g.fillText(String(400000 + ((i * 9137) % 599999)), 16, 44 + i * 62);
    g.font = 'bold 44px monospace';
  }
  g.restore();

  // quadrant 1: hazard stripes + terminal signage
  g.save();
  g.translate(size / 2, 0);
  for (let i = 0; i < 10; i++) {
    g.fillStyle = i % 2 ? '#fff' : '#000';
    g.beginPath();
    g.moveTo(i * 26, 0);
    g.lineTo(i * 26 + 26, 0);
    g.lineTo(i * 26 - 40, 120);
    g.lineTo(i * 26 - 66, 120);
    g.fill();
  }
  g.fillStyle = '#fff';
  g.font = 'bold 30px monospace';
  g.fillText('BERTH 04', 20, 170);
  g.font = 'bold 20px monospace';
  g.fillText('NO MOORING', 20, 210);
  g.fillText('BEYOND LINE', 20, 236);
  g.restore();

  // quadrant 2: lane markings
  g.save();
  g.translate(0, size / 2);
  g.fillStyle = '#fff';
  for (let i = 0; i < 4; i++) g.fillRect(10, 20 + i * 46, size / 2 - 20, 12);
  g.restore();

  // quadrant 3: rust / grime decal (soft blobs)
  g.save();
  g.translate(size / 2, size / 2);
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * (size / 2), y = Math.random() * (size / 2);
    const r = 3 + Math.random() * 26;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.06 + Math.random() * 0.22;
    grd.addColorStop(0, `rgba(255,255,255,${a})`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.restore();

  return c;
}
