// Terminal 09 — bootstrap, frame loop, input and UI.

import { GL } from './engine/gl.js';
import { Camera } from './engine/camera.js';
import { Renderer, QUALITY } from './engine/renderer.js';
import { Builder } from './engine/mesh.js';
import {
  mat4, compose, multiply, clamp, lookAt as lookAtV, v3norm,
} from './engine/math.js';
import { buildScene, LAYOUT, PALETTE } from './scene/world.js';
import { buildLampMesh, LampSystem } from './scene/lamps.js';
import { buildSeaMesh } from './scene/sea.js';
import { buildRainInstanceData, buildRainBaseMesh } from './scene/rain.js';

const $ = (id) => document.getElementById(id);
const nextTick = () => new Promise((r) => requestAnimationFrame(() => r()));
const DPR_CAP = 2;

function buildShaftMesh() {
  const b = new Builder(3000);
  b.mat({ color: [1, 1, 1], rough: 0.5, metal: 0.0, detail: 0 });
  b.lathe([[1.0, -1.0], [0.02, 0.0]], 18, false);
  return b.build();
}

async function boot() {
  const canvas = $('scene');
  const loaderBar = $('loaderBar');
  const loaderMsg = $('loaderMsg');
  const setProgress = (p, msg) => {
    loaderBar.style.width = `${Math.round(p * 100)}%`;
    if (msg) loaderMsg.textContent = msg;
  };

  let glc;
  try {
    glc = new GL(canvas);
  } catch (err) {
    $('fatal').hidden = false;
    $('fatalMsg').textContent = String(err.message || err);
    document.getElementById('loader').classList.add('is-done');
    return;
  }

  setProgress(0.06, 'layouting berth');
  await nextTick();

  const scene = buildScene();
  setProgress(0.28, 'welding containers');
  await nextTick();

  scene.lampMesh = buildLampMesh(scene.lamps.defs[0]);
  scene.shaftMesh = buildShaftMesh();
  scene.seaMesh = buildSeaMesh();
  setProgress(0.44, 'flooding the basin');
  await nextTick();

  const RAIN_MAX = QUALITY.high.rain;
  scene.rainData = buildRainInstanceData(RAIN_MAX);
  scene.rainBase = buildRainBaseMesh();

  const lamps = new LampSystem(scene.lamps.defs, scene.lights, scene.glows, scene.shafts);
  scene.lamps = lamps;
  // LampSystem needs the buffer; keep defs accessible
  scene.lamps.defs = lamps.defs;

  const renderer = new Renderer(glc, scene);
  renderer.init((p, msg) => setProgress(0.45 + p * 0.5, msg));
  setProgress(0.97, 'starting rain');
  await nextTick();

  /* ------------------------------------------------------------- state */
  const state = {
    time: 0,
    paused: false,
    rain: 0.72,
    rainTarget: 0.72,
    wind: 0.45,
    windTarget: 0.45,
    exposure: 0.7,
    fogVolume: true,
    lensRain: false,
    quality: 'high',
    flash: 0,
    flashT: 1e9,
    nextFlash: 26 + Math.random() * 34,
    droplets: 0,
  };

  const camera = new Camera(canvas.width / Math.max(1, canvas.height));
  let dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    canvas.width = Math.max(2, Math.floor(w * dpr));
    canvas.height = Math.max(2, Math.floor(h * dpr));
    renderer.resize(canvas.width, canvas.height, dpr);
    camera.setAspect(canvas.width / canvas.height);
  }

  window.addEventListener('resize', resize);
  resize();

  /* -------------------------------------------------- url overrides */
  const qp = new URLSearchParams(location.search);
  const t0 = parseFloat(qp.get('t') || '0');
  state.time = t0;
  if (qp.has('shot')) camera.shot = parseInt(qp.get('shot'), 10) || 0;
  if (qp.has('shotT')) camera.shotT = parseFloat(qp.get('shotT')) || 0;
  if (qp.has('cam')) camera.setMode(qp.get('cam'));
  if (qp.has('rain')) state.rain = state.rainTarget = parseFloat(qp.get('rain'));
  if (qp.has('wind')) state.wind = state.windTarget = parseFloat(qp.get('wind'));
  if (qp.has('exp')) state.exposure = parseFloat(qp.get('exp'));
  if (qp.has('paused')) state.paused = true;
  if (qp.has('nofog')) state.fogVolume = false;
  if (qp.has('nolens')) { state.lensRain = false; state.droplets = 0; }
  if (qp.has('nobloom')) state.nobloom = true;
  if (qp.has('norain')) state.norain = true;
  if (qp.has('norefl')) state.norefl = true;
  if (qp.has('nodetail')) state.nodetail = true;
  if (qp.has('noglow')) state.noglow = true;
  if (qp.has('noshaft')) state.noshaft = true;
  if (qp.has('nolampmesh')) state.nolampmesh = true;
  if (qp.has('flash')) state.forceFlash = true;
  if (qp.has('quality')) {
    state.quality = qp.get('quality');
    renderer.setQuality(state.quality);
  }
  camera.time = t0;
  if (qp.has('eye') && qp.has('look')) {
    const e = qp.get('eye').split(',').map(Number);
    const lk = qp.get('look').split(',').map(Number);
    camera.mode = 'manual';
    camera.manualPos = e;
    camera.manualTarget = lk;
    camera.pos = e;
    camera.target = lk;
    camera.update = function (dt) {
      this.time += dt;
      this.pos = this.manualPos;
      this.target = this.manualTarget;
      const eye = this.pos;
      lookAtV(this.view, eye, this.manualTarget, this.up);
      this.posActual = eye;
      const f = v3norm([this.manualTarget[0] - eye[0], this.manualTarget[1] - eye[1], this.manualTarget[2] - eye[2]]);
      this.basis.forward = f;
      this.basis.right = v3norm([f[2], 0, -f[0]]);
    };
  }
  camera.update(0);
  lamps.update(t0, state.wind, state.rain);

  /* --------------------------------------------------------------- UI */
  const bindRange = (id, out, fn) => {
    const el = $(id);
    const o = $(out);
    const apply = () => {
      const v = parseFloat(el.value);
      o.textContent = v.toFixed(2);
      fn(v);
    };
    el.addEventListener('input', apply);
    apply();
  };

  bindRange('cRain', 'oRain', (v) => { state.rainTarget = v; });
  bindRange('cWind', 'oWind', (v) => { state.windTarget = v; });
  bindRange('cExp', 'oExp', (v) => { state.exposure = v; });

  $('cFog').addEventListener('change', (e) => { state.fogVolume = e.target.checked; });
  $('cLens').addEventListener('change', (e) => { state.lensRain = e.target.checked; });

  for (const btn of document.querySelectorAll('#camSeg button')) {
    btn.addEventListener('click', () => {
      for (const b of document.querySelectorAll('#camSeg button')) b.classList.remove('is-on');
      btn.classList.add('is-on');
      camera.setMode(btn.dataset.cam);
      if (btn.dataset.cam !== 'free' && document.pointerLockElement) document.exitPointerLock();
    });
  }
  for (const btn of document.querySelectorAll('#qualitySeg button')) {
    btn.addEventListener('click', () => {
      for (const b of document.querySelectorAll('#qualitySeg button')) b.classList.remove('is-on');
      btn.classList.add('is-on');
      state.quality = btn.dataset.q;
      renderer.adaptive = 1;
      renderer.setQuality(state.quality);
      camera.setAspect(canvas.width / canvas.height);
    });
  }

  $('panelToggle').addEventListener('click', () => {
    const panel = $('panel');
    panel.hidden = !panel.hidden;
    $('panelToggle').setAttribute('aria-expanded', String(!panel.hidden));
  });

  window.addEventListener('keydown', (e) => {
    camera.keys.add(e.code);
    if (e.code === 'KeyH') document.body.classList.toggle('ui-hidden');
    if (e.code === 'KeyF') {
      camera.setMode(camera.mode === 'free' ? 'cinematic' : 'free');
      for (const b of document.querySelectorAll('#camSeg button')) {
        b.classList.toggle('is-on', b.dataset.cam === camera.mode);
      }
    }
    if (e.code === 'KeyR') {
      camera.setMode('cinematic');
      camera.shot = 0;
      camera.shotT = 0;
      for (const b of document.querySelectorAll('#camSeg button')) {
        b.classList.toggle('is-on', b.dataset.cam === 'cinematic');
      }
    }
    if (e.code === 'Space') { state.paused = !state.paused; e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => camera.keys.delete(e.code));

  canvas.addEventListener('click', () => {
    if (camera.mode === 'free') canvas.requestPointerLock();
  });
  document.addEventListener('pointerlockchange', () => {
    camera.mouse.locked = document.pointerLockElement === canvas;
  });
  document.addEventListener('mousemove', (e) => {
    if (camera.mouse.locked) {
      camera.mouse.dx += e.movementX;
      camera.mouse.dy += e.movementY;
    }
  });

  /* ------------------------------------------------------------ lights */
  const shipMatrix = mat4();
  const tmpA = mat4();
  const tmpB = mat4();
  const tmpC = mat4();

  function shipTransform(t) {
    const cx = LAYOUT.ship.x, cz = LAYOUT.ship.z;
    const heave = Math.sin(t * 0.52) * 0.085 + Math.sin(t * 0.31 + 1.3) * 0.04;
    const roll = Math.sin(t * 0.41 + 0.7) * 0.0045;
    const pitch = Math.sin(t * 0.33) * 0.0022;
    const yaw = Math.sin(t * 0.17) * 0.0006;
    compose(tmpA, cx, 0, cz, yaw, pitch, roll);
    compose(tmpB, -cx, 0, -cz, 0, 0, 0);
    compose(tmpC, 0, heave, 0, 0, 0, 0);
    multiply(tmpA, tmpA, tmpB);
    multiply(shipMatrix, tmpA, tmpC);
    return shipMatrix;
  }

  /* -------------------------------------------------------------- loop */
  let last = performance.now();
  let acc = 0;
  let frames = 0;
  let fps = 60;
  let fpsTimer = 0;
  let slowFrames = 0;
  let fastFrames = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    const dtRaw = Math.min(0.08, (now - last) / 1000);
    last = now;
    const dt = state.paused ? 0 : dtRaw;
    state.time += dt;
    const t = state.time;

    // smooth controls
    state.rain += (state.rainTarget - state.rain) * Math.min(1, dtRaw * 4);
    state.wind += (state.windTarget - state.wind) * Math.min(1, dtRaw * 4);
    state.droplets += ((state.lensRain ? 1 : 0) - state.droplets) * Math.min(1, dtRaw * 3);

    // lightning
    state.flashT += dtRaw;
    if (state.flashT > state.nextFlash) {
      state.flashT = 0;
      state.nextFlash = 40 + Math.random() * 50;
    }
    const ft = state.flashT;
    let flash = 0;
    if (ft < 1.2) {
      flash = Math.exp(-ft * 13) * 0.75 + Math.exp(-Math.pow((ft - 0.16) * 16, 2)) * 0.55;
      flash += Math.exp(-Math.pow((ft - 0.42) * 22, 2)) * 0.3;
      flash *= 0.75 + 0.25 * Math.sin(ft * 90);
      flash = clamp(flash, 0, 1.2);
    }
    state.flash += (flash - state.flash) * Math.min(1, dtRaw * 30);
    if (state.forceFlash) state.flash = 1.0;

    camera.update(dt);
    lamps.update(t, state.wind, state.rain);

    const fogDensity = state.nofog ? 0 : 0.0060 * (0.8 + state.rain * 0.4);

    renderer.render({
      time: t,
      dt,
      eye: camera.posActual || camera.pos,
      view: camera.view,
      proj: camera.proj,
      viewProj: multiply(mat4(), camera.proj, camera.view),
      palette: PALETTE,
      fogDensity,
      rain: state.norain ? 0 : state.rain,
      wind: state.wind,
      wetness: 0.82,
      exposure: state.exposure,
      cloudCover: 0.95,
      flash: state.flash,
      droplets: state.droplets,
      bloomStrength: state.nobloom ? 0 : 0.34,
      reflStrength: state.norefl ? 0 : 1.0,
      detail: state.nodetail ? 0 : 1,
      noGlow: state.noglow,
      noShaft: state.noshaft,
      noLampMesh: state.nolampmesh,
      shipMatrix: shipTransform(t),
    });

    // stats + adaptive resolution
    frames++;
    fpsTimer += dtRaw;
    if (fpsTimer > 0.5) {
      fps = frames / fpsTimer;
      frames = 0;
      fpsTimer = 0;
      $('fpsLabel').textContent = `${fps.toFixed(0)} fps`;
      $('qualityLabel').textContent = `${state.quality} · ${(renderer.q.scale * renderer.adaptive * 100).toFixed(0)}%`;

      if (!state.paused) {
        if (fps < 48) { slowFrames++; fastFrames = 0; } else if (fps > 58) { fastFrames++; slowFrames = 0; }
        if (slowFrames >= 3 && renderer.adaptive > 0.62) {
          renderer.adaptive = Math.max(0.62, renderer.adaptive - 0.08);
          slowFrames = 0;
          resize();
        } else if (fastFrames >= 10 && renderer.adaptive < 1) {
          renderer.adaptive = Math.min(1, renderer.adaptive + 0.05);
          fastFrames = 0;
          resize();
        }
      }
    }

    window.__stats = { fps, triangles: scene.stats.triangles, vertices: scene.stats.vertices, quality: state.quality, scale: renderer.q.scale * renderer.adaptive };
  }

  requestAnimationFrame(frame);
  setTimeout(() => $('loader').classList.add('is-done'), 220);
  window.__ready = true;
  window.__scene = scene;
  window.__renderer = renderer;
  window.__state = state;
  window.__camera = camera;
}

boot().catch((err) => {
  console.error(err);
  const f = $('fatal');
  f.hidden = false;
  $('fatalMsg').textContent = String(err && err.stack ? err.stack : err);
  const l = $('loader');
  if (l) l.classList.add('is-done');
});
