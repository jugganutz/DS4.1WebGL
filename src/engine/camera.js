// Camera rigs: cinematic dolly (default), a slow handheld dock shot, and free-fly.

import { mat4, lookAt, perspective, clamp, smoothstep, DEG, v3add, v3norm } from './math.js';

const easeInOut = (t) => t * t * (3 - 2 * t);

// Cheap smooth noise for handheld drift.
function wobble(t, seed) {
  return (
    Math.sin(t * 0.73 + seed * 12.9) * 0.55 +
    Math.sin(t * 1.31 + seed * 31.7) * 0.3 +
    Math.sin(t * 2.17 + seed * 7.3) * 0.15
  );
}

const SHOTS = [
  // looking down the quay: cranes receding, ship to the right
  { pos: [-84, 6.4, 34], target: [30, 10, 44], hold: 11 },
  // low near the edge, looking up at the ship and the crane boom
  { pos: [70, 4.2, 36], target: [-32, 8.5, 46], hold: 10 },
  // from the water off the bow, the whole berth in view
  { pos: [126, 7.5, 86], target: [-2, 8, 32], hold: 12 },
  // from the yard, through the cranes toward the water
  { pos: [8, 14, -33], target: [10, 6.5, 46], hold: 10 },
  // straight up into the rain under the swinging lamps
  { pos: [-8, 3.1, 35], target: [12, 21, 56], hold: 9 },
];

export class Camera {
  constructor(aspect) {
    this.pos = [0, 6, 0];
    this.target = [0, 5, 40];
    this.up = [0, 1, 0];
    this.fov = 52 * DEG;
    this.near = 0.15;
    this.far = 2600;
    this.aspect = aspect;
    this.view = mat4();
    this.proj = mat4();
    this.viewProj = mat4();
    this.mode = 'cinematic';
    this.time = 0;
    this.shot = 0;
    this.shotT = 0;
    this.keys = new Set();
    this.mouse = { active: false, dx: 0, dy: 0, locked: false };
    this.freePos = [0, 6, 0];
    this.freeYaw = 0;
    this.freePitch = -0.1;
    this.intro = 0;
    this.sensitivity = 0.0022;
    this.speed = 14;
    this.basis = { forward: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0] };
    this.update(0);
  }

  setAspect(a) {
    this.aspect = a;
    perspective(this.proj, this.fov, a, this.near, this.far);
  }

  setMode(mode) {
    if (mode === this.mode) return;
    if (mode === 'free') {
      this.freePos = this.pos.slice();
      const f = this.basis.forward;
      this.freeYaw = Math.atan2(f[0], f[2]);
      this.freePitch = Math.asin(clamp(f[1], -1, 1));
    }
    this.mode = mode;
    this.shotT = 0;
  }

  update(dt) {
    this.time += dt;
    const t = this.time;

    if (this.mode === 'cinematic') {
      this.shotT += dt;
      const shot = SHOTS[this.shot % SHOTS.length];
      const k = clamp(this.shotT / shot.hold, 0, 1);
      // slow dolly in along the view axis, like a locked-off operator push
      const push = easeInOut(k) * 0.055;
      this.pos = [
        shot.pos[0] + (shot.target[0] - shot.pos[0]) * push,
        shot.pos[1] + (shot.target[1] - shot.pos[1]) * push,
        shot.pos[2] + (shot.target[2] - shot.pos[2]) * push,
      ];
      this.target = shot.target;
      if (k >= 1) {
        this.shot = (this.shot + 1) % SHOTS.length;
        this.shotT = 0;
      }
    } else if (this.mode === 'dock') {
      // A slow, low pan from the quay, water on the right.
      const a = t * 0.035;
      this.pos = [-42 + Math.sin(t * 0.05) * 6, 2.6 + Math.sin(t * 0.19) * 0.12, 12 + Math.cos(t * 0.043) * 4];
      this.target = [Math.sin(a) * 18 + 12, 4.2 + Math.sin(t * 0.07) * 0.6, 46];
    } else {
      this.updateFree(dt);
    }

    // Subtle handheld: a real operator is never perfectly still.
    const amp = this.mode === 'free' ? 0.0 : 1.0;
    const px = wobble(t * 0.5, 1) * 0.06 * amp;
    const py = wobble(t * 0.46, 2) * 0.05 * amp;
    const pz = wobble(t * 0.42, 3) * 0.06 * amp;

    const eye = [this.pos[0] + px, this.pos[1] + py, this.pos[2] + pz];
    const tg = [
      this.target[0] + wobble(t * 0.31, 4) * 0.09 * amp,
      this.target[1] + wobble(t * 0.27, 5) * 0.07 * amp,
      this.target[2] + wobble(t * 0.36, 6) * 0.09 * amp,
    ];
    this.posActual = eye;
    lookAt(this.view, eye, tg, this.up);

    const f = v3norm([tg[0] - eye[0], tg[1] - eye[1], tg[2] - eye[2]]);
    this.basis.forward = f;
    this.basis.right = v3norm([f[2], 0, -f[0]]);
    this.basis.up = [
      f[1] * this.basis.right[2] - f[2] * this.basis.right[1],
      f[2] * this.basis.right[0] - f[0] * this.basis.right[2],
      f[0] * this.basis.right[1] - f[1] * this.basis.right[0],
    ];
  }

  updateFree(dt) {
    const m = this.mouse;
    if (m.locked) {
      this.freeYaw -= m.dx * this.sensitivity;
      this.freePitch -= m.dy * this.sensitivity;
      this.freePitch = clamp(this.freePitch, -1.35, 1.35);
    }
    m.dx = 0;
    m.dy = 0;

    const cy = Math.cos(this.freeYaw), sy = Math.sin(this.freeYaw);
    const cp = Math.cos(this.freePitch), sp = Math.sin(this.freePitch);
    const fwd = [sy * cp, sp, cy * cp];
    const right = [cy, 0, -sy];

    let move = [0, 0, 0];
    const k = this.keys;
    const speed = this.speed * (k.has('ShiftLeft') || k.has('ShiftRight') ? 3 : 1) * dt;
    if (k.has('KeyW')) move = v3add(move, fwd);
    if (k.has('KeyS')) move = v3add(move, [-fwd[0], -fwd[1], -fwd[2]]);
    if (k.has('KeyD')) move = v3add(move, right);
    if (k.has('KeyA')) move = v3add(move, [-right[0], -right[1], -right[2]]);
    if (k.has('KeyE')) move = v3add(move, [0, 1, 0]);
    if (k.has('KeyQ')) move = v3add(move, [0, -1, 0]);
    const l = Math.hypot(move[0], move[1], move[2]);
    if (l > 0) {
      this.freePos = [
        this.freePos[0] + (move[0] / l) * speed,
        Math.max(0.4, this.freePos[1] + (move[1] / l) * speed),
        this.freePos[2] + (move[2] / l) * speed,
      ];
    }
    this.pos = this.freePos;
    this.target = [this.pos[0] + fwd[0] * 10, this.pos[1] + fwd[1] * 10, this.pos[2] + fwd[2] * 10];
  }

  computeProjection() {
    perspective(this.proj, this.fov, this.aspect, this.near, this.far);
  }
}
