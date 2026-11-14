// Scene assembly: terminal layout, lights, and the baked static geometry.

import { Builder, sagPoints } from '../engine/mesh.js';
import { mat4, compose, srgb, rng as makeRng, smoothstep } from '../engine/math.js';
import { addContainer, addContainerBlock, pickColor } from './parts/containers.js';
import { addCrane, addCraneRails } from './parts/crane.js';
import { addShip } from './parts/ship.js';
import {
  addQuayEdge, addTerminalBuildings, addLightTower, addFence, addProps,
} from './parts/quay.js';

export const LAYOUT = {
  seaLevel: -2.2,
  quayZ: 40,
  groundMinZ: -78,
  groundMaxZ: 40,
  groundHalfX: 105,
  ship: { x: 6, z: 60 },
  cranes: [{ x: -30, z: 8 }, { x: 4, z: 8 }, { x: 38, z: 8 }],
  mastL: { x: -62, y: 17.6, z: 30 },
  mastR: { x: 62, y: 17.6, z: 30 },
  lampXs: [-44, -22, 0, 22, 44],
};

export const PALETTE = {
  fog: [0.0125, 0.0150, 0.0192],
  zenith: [0.0032, 0.0050, 0.0082],
  skyAmbient: [0.098, 0.118, 0.155],
  bounce: [0.052, 0.045, 0.040],
  moonDir: [-0.27, 0.27, -0.924],
  moonColor: [0.075, 0.090, 0.125],
};

const vec = (c, s = 1) => [c[0] * s, c[1] * s, c[2] * s];

function makeLight(pos, color, intensity, radius, opts = {}) {
  return {
    pos,
    radius,
    color: vec(color, intensity),
    type: opts.type || 'point',
    dir: opts.dir || [0, -1, 0],
    cosOuter: opts.cosOuter ?? -2,
    cosInner: opts.cosInner ?? 1,
    source: opts.source || null,
  };
}

export function buildScene() {
  const rng = makeRng(0x5eed0919);
  const b = new Builder(340000);
  const shipB = new Builder(90000);
  const lights = [];
  const glows = [];
  const shafts = [];
  const L = LAYOUT;

  /* ------------------------------------------------------------ containers */
  // Main yard: rows receding toward the terminal building.
  addContainerBlock(b, rng, {
    x0: -56, z0: -30, rows: 18, bays: 2, rowGap: 2.62, bayGap: 13.9,
    maxStack: 4, minStack: 2, alongZ: true, mix20: 0.12,
  });
  addContainerBlock(b, rng, {
    x0: 8, z0: -31, rows: 14, bays: 2, rowGap: 2.62, bayGap: 13.9,
    maxStack: 3, minStack: 1, alongZ: true, mix20: 0.4,
  });
  addContainerBlock(b, rng, {
    x0: -46, z0: -58, rows: 13, bays: 1, rowGap: 2.62, bayGap: 13.9,
    maxStack: 3, minStack: 2, alongZ: true, mix20: 0.1,
  });

  // Staged boxes on the quay between the cranes (foreground interest).
  for (const [sx, count] of [[-46.5, 3], [-18, 2], [10, 3], [38, 2]]) {
    for (let k = 0; k < count; k++) {
      addContainer(b, {
        x: sx + (rng() - 0.5) * 0.3, y: k * 2.59, z: 24.6 + (rng() - 0.5) * 0.3,
        yaw: (rng() - 0.5) * 0.02, len: 12.19, color: pickColor(rng), seed: rng() * 100,
      });
    }
    addContainer(b, {
      x: sx + 8.2, y: 0, z: 27.4, yaw: 0.01, len: 6.06, color: pickColor(rng), seed: rng() * 100,
    });
  }

  /* ----------------------------------------------------------------- cranes */
  addCraneRails(b, { from: -92, to: 92 });
  const craneInfo = [];
  for (const c of L.cranes) {
    craneInfo.push(addCrane(b, { x: c.x, z: c.z, seed: rng() * 100 }));
  }

  /* ------------------------------------------------------------------ ship */
  const ship = addShip(shipB, { x: L.ship.x, z: L.ship.z });

  /* ------------------------------------------------------------- structures */
  addQuayEdge(b, { zEdge: L.quayZ });
  addTerminalBuildings(b);
  addFence(b, { z: -74 });
  addProps(b, rng);

  const towers = [
    addLightTower(b, { x: -66, z: 24, height: 24, yaw: 0.3 }),
    addLightTower(b, { x: 66, z: 24, height: 24, yaw: -0.3 }),
    addLightTower(b, { x: -66, z: -44, height: 26, yaw: 0.1 }),
    addLightTower(b, { x: 66, z: -44, height: 26, yaw: -0.1 }),
    addLightTower(b, { x: -6, z: -56, height: 30, yaw: 0 }),
  ];

  /* ----------------------------------------------------------- lamp masts */
  const mastTop = { y: L.mastL.y };
  for (const m of [L.mastL, L.mastR]) {
    b.mat({ color: srgb('#5a6167'), rough: 0.62, metal: 0.25, detail: 3 });
    b.push(compose(mat4(), m.x, 0, m.z, 0, 0, 0));
    b.cylinder(0.14, 0.22, 18.4, 10, true);
    b.pop();
    // guy wires
    b.mat({ color: [0.16, 0.16, 0.17], rough: 0.5, metal: 0.8, detail: 4 });
    b.push(compose(mat4(), m.x, 9.3, m.z, 0, 0, 0));
    b.cylinder(0.015, 0.015, 0.03, 4, false);
    b.pop();
    // top cross arm
    b.mat({ color: srgb('#626a6f'), rough: 0.5, metal: 0.7, detail: 3 });
    b.push(compose(mat4(), m.x, m.y, m.z, 0, 0, 0));
    b.box(0.5, 0.5, 0.5);
    b.pop();
  }

  // catenary cable between the masts
  const cableA = [L.mastL.x, L.mastL.y, L.mastL.z];
  const cableB = [L.mastR.x, L.mastR.y, L.mastR.z];
  const cablePts = sagPoints(cableA, cableB, 3.6, 48);
  b.mat({ color: [0.05, 0.05, 0.055], rough: 0.45, metal: 0.85, detail: 4 });
  b.tube(cablePts, 0.045, 6);

  // a second, thinner cable for the far side (depth)
  b.tube(sagPoints([L.mastL.x, L.mastL.y - 0.35, L.mastL.z - 1.4], [L.mastR.x, L.mastR.y - 0.35, L.mastR.z - 1.4], 3.2, 40), 0.03, 5);

  /* ---------------------------------------------------------------- lights */
  const warm = [1.0, 0.73, 0.42];
  const cool = [0.72, 0.84, 1.0];
  const sodium = [1.0, 0.62, 0.28];

  // Hanging work lamps on the cable (they swing in lamps.js).
  const lampDefs = L.lampXs.map((x, i) => {
    const t = (x - L.mastL.x) / (L.mastR.x - L.mastL.x);
    const anchorY = L.mastL.y - 3.6 * Math.sin(Math.PI * t);
    return {
      id: `lamp${i}`,
      pivot: [x, anchorY, L.mastL.z],
      cord: 1.15,
      phase: rng() * 6.28,
      freq: 0.55 + rng() * 0.35,
      color: warm,
      intensity: 620 + rng() * 140,
      radius: 52,
      swing: 0.055 + rng() * 0.05,
      flicker: i === 2 ? 0.85 : 0,
      glowSize: 9.0,
      shaftRadius: 7.5,
    };
  });

  for (const d of lampDefs) {
    lights.push(makeLight(
      [d.pivot[0], d.pivot[1] - d.cord - 0.42, d.pivot[2]],
      d.color, d.intensity, d.radius, { source: d.id },
    ));
  }

  // Crane boom floods aimed at the ship deck.
  for (let i = 0; i < craneInfo.length; i++) {
    const c = craneInfo[i];
    const target = [c.boomTip.x * 0.4, 14, 50];
    for (const f of c.floods.slice(0, 2)) {
      const dir = [target[0] - f.x, target[1] - f.y, target[2] - f.z];
      const l = makeLight([f.x, f.y, f.z], cool, 1400, 66, {
        type: 'spot', dir, cosOuter: Math.cos(0.62), cosInner: Math.cos(0.28),
      });
      lights.push(l);
      glows.push({ pos: [f.x, f.y, f.z], color: vec(cool, 1.6), size: 2.2, stretch: 1.0 });
    }
    // red aviation beacon on the boom tip and apex
    glows.push({ pos: [c.boomTip.x, c.boomTip.y, c.boomTip.z], color: [1.6, 0.12, 0.06], size: 1.5, blink: 1.4, stretch: 1.0 });
    glows.push({ pos: [c.apex.x, c.apex.y, c.apex.z], color: [1.6, 0.12, 0.06], size: 1.2, blink: 1.4, stretch: 1.0 });
  }

  // Yard light towers
  for (let i = 0; i < towers.length; i++) {
    const t = towers[i];
    const dir = i === 0 ? [24, -t.y, -22] : i === 1 ? [-24, -t.y, -22]
      : i === 2 ? [20, -t.y, 30] : i === 3 ? [-20, -t.y, 30] : [0, -t.y, 42];
    const l = makeLight([t.x, t.y, t.z], cool, 2100, 82, {
      type: 'spot', dir, cosOuter: Math.cos(0.72), cosInner: Math.cos(0.42),
    });
    lights.push(l);
    for (let k = 0; k < 4; k++) {
      glows.push({
        pos: [t.x - 1.8 + k * 1.2, t.y + 0.05, t.z + 0.15],
        color: vec(cool, 1.3), size: 1.35, stretch: 1.0,
      });
    }
  }

  // Building floods spilling onto the yard
  lights.push(makeLight([-18, 9, -50], [1.0, 0.9, 0.75], 700, 58, {
    type: 'spot', dir: [0, -0.55, 1.0], cosOuter: Math.cos(0.8), cosInner: Math.cos(0.45),
  }));
  lights.push(makeLight([-38, 12, -50], [1.0, 0.9, 0.78], 820, 58, {
    type: 'spot', dir: [0, -0.5, 1.0], cosOuter: Math.cos(0.75), cosInner: Math.cos(0.4),
  }));

  // Ship deck / accommodation lights
  lights.push(makeLight([ship.sternX + 12, ship.deck + 12, L.ship.z], [1.0, 0.86, 0.62], 700, 46));
  lights.push(makeLight([ship.sternX + 12, ship.deck + 3, L.ship.z - 8], [1.0, 0.8, 0.55], 520, 36));
  lights.push(makeLight([L.ship.x + 40, ship.deck + 6, L.ship.z - 10], [0.9, 0.92, 1.0], 520, 40));
  // deck working lights along the hatch covers
  for (const dx of [-38, -6, 26, 56]) {
    lights.push(makeLight([L.ship.x + dx, ship.deck + 4.2, L.ship.z - 8], [1.0, 0.88, 0.66], 260, 26));
    glows.push({ pos: [L.ship.x + dx, ship.deck + 4.2, L.ship.z - 12.6], color: [1.5, 1.2, 0.85], size: 1.5, stretch: 1.0 });
  }
  // forecastle and poop lamps so the bow and stern read against the water
  lights.push(makeLight([L.ship.x + 80, ship.deck + 5, L.ship.z], [1.0, 0.9, 0.7], 900, 34));
  lights.push(makeLight([L.ship.x - 78, ship.deck + 4, L.ship.z], [1.0, 0.9, 0.72], 700, 30));
  glows.push({ pos: [L.ship.x + 80, ship.deck + 5, L.ship.z - 5], color: [1.6, 1.3, 0.95], size: 1.7, stretch: 1.0 });
  // A cold quay-edge light near the ladder
  lights.push(makeLight([12, 6.4, 37.5], [0.8, 0.9, 1.0], 700, 36, {
    type: 'spot', dir: [0, -1, 0.35], cosOuter: Math.cos(0.7), cosInner: Math.cos(0.35),
  }));

  // Working floods washing the ship's side (very characteristic of a night berth)
  for (const fx of [-26, 30]) {
    lights.push(makeLight([fx, 17, 26], [0.95, 0.86, 0.7], 2400, 54, {
      type: 'spot', dir: [fx * -0.15, -0.42, 1.0], cosOuter: Math.cos(0.75), cosInner: Math.cos(0.42),
    }));
    glows.push({ pos: [fx, 17, 26.6], color: [1.3, 1.15, 0.9], size: 2.4, stretch: 1.0 });
  }

  // Emissive-only nav lights and beacons on the ship
  const nav = [
    { pos: [ship.sternX + 10, ship.deck + 34.6, L.ship.z], color: [1.4, 1.5, 1.6], size: 1.1 },
    { pos: [L.ship.x + 78, ship.deck + 4, L.ship.z - 15], color: [1.8, 0.15, 0.1], size: 1.2 },
    { pos: [L.ship.x + 78, ship.deck + 4, L.ship.z + 15], color: [0.15, 1.8, 0.5], size: 1.2 },
  ];
  for (const n of nav) glows.push({ ...n, stretch: 1.0 });

  /* ------------------------------------------------------- hanging lamps */
  const lampRig = { defs: lampDefs };
  for (const d of lampDefs) {
    glows.push({
      pos: [d.pivot[0], d.pivot[1] - d.cord - 0.34, d.pivot[2]],
      color: vec(warm, 1.5), size: d.glowSize, dynamic: d.id, stretch: 1.0,
    });
    shafts.push({ dynamic: d.id, radius: d.shaftRadius, height: d.pivot[1] - d.cord - 0.5 });
  }

  const worldMesh = b.build();
  const shipMesh = shipB.build();

  return {
    worldMesh,
    shipMesh,
    ship,
    lights,
    glows,
    shafts,
    lamps: lampRig,
    craneInfo,
    stats: {
      vertices: worldMesh.vertices + shipMesh.vertices,
      triangles: worldMesh.triangles + shipMesh.triangles,
    },
  };
}
