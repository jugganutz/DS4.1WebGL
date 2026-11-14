// The frame graph: reflections -> HDR forward pass -> bloom -> tonemap/composite.

import { Program } from './gl.js';
import { mat4, identity, multiply, invert, mirrorY, compose } from './math.js';
import { assemble } from './shader.js';
import { makeNoiseTexture, makeNormalTexture } from './noise.js';
import { Builder } from './mesh.js';
import worldShader from '../shaders/world.js';
import groundShader from '../shaders/ground.js';
import seaShader from '../shaders/sea.js';
import skyShader from '../shaders/sky.js';
import rainShader from '../shaders/rain.js';
import glowShader from '../shaders/glow.js';
import shaftShader from '../shaders/shaft.js';
import { bloomDown, bloomUp, composite } from '../shaders/post.js';
import { LAYOUT as SCENE_LAYOUT } from '../scene/world.js';

export const QUALITY = {
  low: { scale: 0.6, msaa: 0, rain: 12000, bloom: 4, refl: [0.3, 0.25], detail: 0.65 },
  medium: { scale: 0.78, msaa: 2, rain: 24000, bloom: 5, refl: [0.42, 0.34], detail: 0.85 },
  high: { scale: 1.0, msaa: 4, rain: 40000, bloom: 6, refl: [0.55, 0.45], detail: 1.0 },
};

const MAX_LIGHTS = 40;
const DEFINES = { NL: MAX_LIGHTS, NUM_LIGHTS: MAX_LIGHTS };

export class Renderer {
  constructor(glc, scene) {
    this.glc = glc;
    this.gl = glc.gl;
    this.scene = scene;
    this.quality = 'high';
    this.q = QUALITY.high;
    this.adaptive = 1;
    this.width = 1;
    this.height = 1;
    this.dpr = 1;

    this.lightA = new Float32Array(MAX_LIGHTS * 4);
    this.lightB = new Float32Array(MAX_LIGHTS * 4);
    this.lightC = new Float32Array(MAX_LIGHTS * 4);
    this.lightOrder = [];

    this.programs = {};
    this.targets = {};
  }

  /* -------------------------------------------------------------- setup */

  init(onProgress = () => {}) {
    const glc = this.glc;
    const gl = this.gl;

    onProgress(0.1, 'compiling shaders');
    const P = (desc, extra = {}) => {
      const defs = { ...DEFINES, ...extra };
      return new Program(glc, assembleFor(desc, defs).vs, assembleFor(desc, defs).fs, desc.name + (extra.INSTANCED ? '.inst' : ''));
    };
    this.programs.world = P(worldShader);
    this.programs.worldInst = P(worldShader, { INSTANCED: 1 });
    this.programs.ground = P(groundShader);
    this.programs.sea = P(seaShader);
    this.programs.sky = P(skyShader);
    this.programs.rain = P(rainShader);
    this.programs.glow = P(glowShader);
    this.programs.shaft = P(shaftShader);
    this.programs.bloomDown = P(bloomDown);
    this.programs.bloomUp = P(bloomUp);
    this.programs.composite = P(composite);

    onProgress(0.3, 'baking textures');
    this.tex = buildTextures(glc);

    onProgress(0.45, 'uploading geometry');
    this.mesh = {};
    const scene = this.scene;
    this.mesh.world = glc.mesh(scene.worldMesh.data, scene.worldMesh.index);
    this.mesh.ship = glc.mesh(scene.shipMesh.data, scene.shipMesh.index);
    this.mesh.ground = glc.mesh(...groundGeometry());
    this.mesh.sea = glc.mesh(scene.seaMesh.data, scene.seaMesh.index);

    // instanced: lamps
    const lampMesh = scene.lampMesh;
    this.lampCount = scene.lamps.defs.length;
    this.mesh.lamps = glc.instancedMesh({
      data: lampMesh.data,
      index: lampMesh.index,
      instanceCount: this.lampCount,
      streams: [{ loc: 6, size: 4, stride: 64, components: 4, data: scene.lamps.matrices, dynamic: true }],
    });

    // instanced: glows
    const quad = new Float32Array(6 * 18);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
    for (let i = 0; i < 6; i++) {
      quad[i * 18] = corners[i][0];
      quad[i * 18 + 1] = corners[i][1];
      quad[i * 18 + 11] = 0.5;
    }
    this.glowData = new Float32Array(scene.glows.length * 12);
    this.mesh.glows = glc.instancedMesh({
      data: quad,
      instanceCount: scene.glows.length,
      streams: [{ loc: 6, size: 4, stride: 48, components: 3, data: this.glowData, dynamic: true }],
    });

    // instanced: shafts (cones)
    this.shaftData = new Float32Array(Math.max(1, scene.shafts.length) * 24);
    this.mesh.shafts = glc.instancedMesh({
      data: scene.shaftMesh.data,
      index: scene.shaftMesh.index,
      instanceCount: Math.max(1, scene.shafts.length),
      streams: [{ loc: 6, size: 4, stride: 96, components: 6, data: this.shaftData, dynamic: true }],
    });

    // instanced: rain
    this.rainMax = scene.rainData.length / 8;
    this.mesh.rain = glc.instancedMesh({
      data: scene.rainBase,
      instanceCount: this.rainMax,
      streams: [{ loc: 6, size: 4, stride: 32, components: 2, data: scene.rainData }],
    });

    onProgress(0.85, 'warming up');
    this.buildTargets();
    return this;
  }

  setQuality(name) {
    const q = QUALITY[name] || QUALITY.high;
    this.quality = name;
    this.q = q;
    this.adaptive = 1;
    this.resize(this.cssW || this.width, this.cssH || this.height, this.dpr);
  }

  buildTargets() {
    const gl = this.gl;
    const t = this.targets;
    for (const k in t) disposeTargets(t[k]);
    this.targets = {};
    const q = this.q;
    const w = Math.max(2, Math.floor(this.width));
    const h = Math.max(2, Math.floor(this.height));

    this.targets.main = this.glc.msaaTarget({ width: w, height: h, samples: q.msaa || 1, depth: true });
    this.targets.hdr = this.glc.target({ width: w, height: h, float: true, depth: false });
    if (!this.targets.main) {
      this.targets.main = this.glc.target({ width: w, height: h, float: true, depth: true });
      this.msaaFallback = true;
    } else {
      this.msaaFallback = false;
    }

    const rw = Math.max(2, Math.floor(w * q.refl[0]));
    const rh = Math.max(2, Math.floor(h * q.refl[0]));
    this.targets.ground = this.glc.target({ width: rw, height: rh, float: true, depth: true, mips: true });
    this.targets.sea = this.glc.target({
      width: Math.max(2, Math.floor(w * q.refl[1])),
      height: Math.max(2, Math.floor(h * q.refl[1])),
      float: true, depth: true, mips: true,
    });

    // bloom pyramid
    const levels = Math.max(2, Math.min(q.bloom, Math.floor(Math.log2(Math.min(w, h))) - 3));
    this.targets.bloom = [];
    let bw = Math.max(2, w >> 1), bh = Math.max(2, h >> 1);
    for (let i = 0; i < levels; i++) {
      this.targets.bloom.push(this.glc.target({ width: bw, height: bh, float: true }));
      bw = Math.max(2, bw >> 1);
      bh = Math.max(2, bh >> 1);
    }
  }

  resize(cssW, cssH, dpr) {
    const scale = this.q.scale * (this.adaptive || 1);
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    this.width = Math.max(2, Math.floor(cssW * scale));
    this.height = Math.max(2, Math.floor(cssH * scale));
    this.buildTargets();
  }

  /* ---------------------------------------------------------- uniforms */

  uploadLights(p, lights, eye) {
    const order = this.lightOrder;
    order.length = 0;
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i];
      const dx = l.pos[0] - eye[0], dy = l.pos[1] - eye[1], dz = l.pos[2] - eye[2];
      const d2 = dx * dx + dy * dy + dz * dz + 1;
      const mag = (l.color[0] + l.color[1] + l.color[2]) * (l.intensityMul ?? 1);
      order.push({ i, score: mag / d2 });
    }
    order.sort((a, b) => b.score - a.score);
    const n = Math.min(order.length, MAX_LIGHTS);
    for (let k = 0; k < n; k++) {
      const l = lights[order[k].i];
      const mul = l.intensityMul ?? 1;
      const o = k * 4;
      this.lightA[o] = l.pos[0];
      this.lightA[o + 1] = l.pos[1];
      this.lightA[o + 2] = l.pos[2];
      this.lightA[o + 3] = l.radius;
      this.lightB[o] = l.color[0] * mul;
      this.lightB[o + 1] = l.color[1] * mul;
      this.lightB[o + 2] = l.color[2] * mul;
      this.lightB[o + 3] = l.cosOuter;
      const dl = Math.hypot(l.dir[0], l.dir[1], l.dir[2]) || 1;
      this.lightC[o] = l.dir[0] / dl;
      this.lightC[o + 1] = l.dir[1] / dl;
      this.lightC[o + 2] = l.dir[2] / dl;
      this.lightC[o + 3] = l.cosInner;
    }
    p.v4fv('uLightA[0]', this.lightA.subarray(0, n * 4));
    p.v4fv('uLightB[0]', this.lightB.subarray(0, n * 4));
    p.v4fv('uLightC[0]', this.lightC.subarray(0, n * 4));
    p.i('uNumLights', n);
  }

  setFrame(p, f) {
    const pal = f.palette;
    p.m4('uViewProj', f.viewProj)
      .v3('uCameraPos', f.eye)
      .f('uTime', f.time)
      .v2('uResolution', [f.res[0], f.res[1]])
      .f('uClipOn', f.clipOn ? 1 : 0)
      .f('uClipY', f.clipY || 0)
      .f('uEmissiveBoost', 1.0)
      .v3('uSkyAmbient', pal.skyAmbient)
      .v3('uBounceAmbient', pal.bounce)
      .v3('uMoonDir', pal.moonDir)
      .v3('uMoonColor', pal.moonColor)
      .v3('uFogColor', pal.fog)
      .v3('uZenithColor', pal.zenith)
      .f('uFogDensity', f.fogDensity)
      .f('uFogFalloff', 0.055)
      .f('uFogMax', 0.80)
      .f('uRain', f.rain)
      .f('uWind', f.wind)
      .f('uWetness', f.wetness)
      .f('uExposure', f.exposure)
      .f('uCloudCover', f.cloudCover)
      .f('uFlash', f.flash);
  }

  setSurfaceTexture(p) {
    p.tex({ uNoise: this.tex.noise, uNormalTex: this.tex.normal });
  }

  /* ------------------------------------------------------------ passes */

  drawSky(f, invViewProj, eye) {
    const gl = this.gl;
    const p = this.glc.use(this.programs.sky);
    this.setFrame(p, f);
    p.m4('uInvViewProj', invViewProj).v3('uCameraPos', eye);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.BLEND);
    this.glc.drawFullscreen();
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
  }

  drawWorld(f, opts = {}) {
    const gl = this.gl;
    const scene = this.scene;
    const clip = opts.clip;
    const f2 = { ...f, clipOn: !!clip, clipY: opts.clipY };

    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);

    // static world
    const p = this.glc.use(this.programs.world);
    this.setFrame(p, f2);
    this.uploadLights(p, scene.lights, f.eye);
    this.setSurfaceTexture(p);
    p.m4('uModel', IDENT);
    p.f('uDetailStrength', (f.detail ?? 1) * this.q.detail);
    p.f('uRainStreaks', f.rain);
    this.glc.bindVAO(this.mesh.world.vao);
    this.mesh.world.draw();

    // ship
    p.m4('uModel', f.shipMatrix);
    this.glc.bindVAO(this.mesh.ship.vao);
    this.mesh.ship.draw();

    // lamps (instanced)
    const pl = this.glc.use(this.programs.worldInst);
    this.setFrame(pl, f2);
    this.uploadLights(pl, scene.lights, f.eye);
    this.setSurfaceTexture(pl);
    pl.f('uDetailStrength', (f.detail ?? 1) * this.q.detail);
    pl.f('uRainStreaks', f.rain);
    if (!f.noLampMesh) {
      this.mesh.lamps.updateStream(0, scene.lamps.matrices);
      this.glc.bindVAO(this.mesh.lamps.vao);
      this.mesh.lamps.draw();
    }
  }

  drawGround(f) {
    const gl = this.gl;
    const p = this.glc.use(this.programs.ground);
    this.setFrame(p, f);
    this.uploadLights(p, this.scene.lights, f.eye);
    p.tex({ uNoise: this.tex.noise, uNormalTex: this.tex.normal, uReflection: this.targets.ground.tex });
    p.f('uReflLevels', Math.log2(this.targets.ground.height));
    p.f('uReflStrength', f.reflStrength ?? 1.0);
    p.v2('uReflTexel', [1 / this.targets.ground.width, 1 / this.targets.ground.height]);
    p.m4('uModel', IDENT);
    gl.enable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    this.glc.bindVAO(this.mesh.ground.vao);
    this.mesh.ground.draw();
  }

  drawSea(f) {
    const gl = this.gl;
    const p = this.glc.use(this.programs.sea);
    this.setFrame(p, f);
    this.uploadLights(p, this.scene.lights, f.eye);
    p.tex({ uNoise: this.tex.noise, uReflection: this.targets.sea.tex });
    p.f('uReflLevels', Math.log2(this.targets.sea.height));
    p.f('uReflStrength', 1.0);
    p.f('uSeaLevel', SCENE_LAYOUT.seaLevel);
    const waves = new Float32Array([
      0.85, 0.52, 1.05, 74,
      -0.35, 0.94, 0.52, 41,
      0.96, -0.28, 0.26, 23,
      -0.7, -0.71, 0.14, 13,
    ]);
    p.v4fv('uWaves[0]', waves);
    p.m4('uModel', IDENT);
    gl.enable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    this.glc.bindVAO(this.mesh.sea.vao);
    this.mesh.sea.draw();
  }

  drawAdditive(f, opts = {}) {
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);

    // light shafts
    if (this.scene.shafts.length && !opts.skipShaft) {
      this.updateShaftData(f);
      const p = this.glc.use(this.programs.shaft);
      this.setFrame(p, f);
      p.f('uGain', 0.85).f('uTime', f.time);
      p.tex({ uNoise: this.tex.noise });
      this.glc.bindVAO(this.mesh.shafts.vao);
      this.mesh.shafts.draw();
    }

    // glow sprites
    if (!opts.skipGlow) {
      this.updateGlowData(f);
      const p = this.glc.use(this.programs.glow);
      this.setFrame(p, f);
      p.f('uGlowGain', opts.glowGain ?? 1.15).f('uTime', f.time);
      this.glc.bindVAO(this.mesh.glows.vao);
      this.mesh.glows.draw();
    }

    // rain
    if (f.rain > 0.001) {
      const p = this.glc.use(this.programs.rain);
      this.setFrame(p, f);
      p.v3('uBoxSize', [76, 46, 76]);
      p.v3('uWindVec', [f.wind * 2.2, 0, f.wind * 1.1]);
      p.f('uRainDensity', f.rain);
      this.glc.bindVAO(this.mesh.rain.vao);
      const count = Math.floor(this.rainMax * Math.min(1, 0.35 + f.rain * 0.65));
      this.mesh.rain.draw(count);
    }

    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
  }

  updateGlowData(f) {
    const glows = this.scene.glows;
    const d = this.glowData;
    for (let i = 0; i < glows.length; i++) {
      const g = glows[i];
      const o = i * 12;
      let mul = 1;
      if (g.blink) {
        const ph = Math.sin(f.time * g.blink * 2.2 + i * 1.7);
        mul = ph > 0.45 ? 1.0 : 0.03;
      }
      if (g.flicker) mul *= g.flicker;
      d[o] = g.pos[0];
      d[o + 1] = g.pos[1];
      d[o + 2] = g.pos[2];
      d[o + 3] = g.size;
      d[o + 4] = g.color[0];
      d[o + 5] = g.color[1];
      d[o + 6] = g.color[2];
      d[o + 7] = mul;
      d[o + 8] = g.stretch ?? 1.0;
      d[o + 9] = 0;
      d[o + 10] = 0;
      d[o + 11] = 0;
    }
    this.mesh.glows.updateStream(0, d);
  }

  updateShaftData(f) {
    const shafts = this.scene.shafts;
    const d = this.shaftData;
    for (let i = 0; i < shafts.length; i++) {
      const s = shafts[i];
      const o = i * 24;
      const h = s.height || 14;
      const r = s.radius || 7;
      const rot = s.rot || [0, 0, 0];
      const m = compose(mat4(), s.pos[0], s.pos[1], s.pos[2], rot[2] || 0, rot[0] || 0, rot[1] || 0, r, h, r);
      d.set(m, o);
      d[o + 16] = 0.85 * (s.flicker ?? 1);
      d[o + 17] = 0.60 * (s.flicker ?? 1);
      d[o + 18] = 0.36 * (s.flicker ?? 1);
      d[o + 19] = 0.22;
      d[o + 20] = h;
      d[o + 21] = r;
      d[o + 22] = 1.0;
      d[o + 23] = 0;
    }
    this.mesh.shafts.updateStream(0, d);
  }

  drawReflection(target, planeY, f, opts = {}) {
    const gl = this.gl;
    target.bind();
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);

    // mirrored camera
    const mirror = mirrorY(mat4(), planeY);
    const viewRefl = multiply(mat4(), f.view, mirror);
    const proj = f.proj;
    const vp = multiply(mat4(), proj, viewRefl);
    const eyeRefl = [f.eye[0], 2 * planeY - f.eye[1], f.eye[2]];
    const inv = invert(mat4(), vp);

    const rf = {
      ...f,
      view: viewRefl,
      viewProj: vp,
      eye: eyeRefl,
      res: [target.width, target.height],
      clipOn: true,
      clipY: planeY,
    };

    gl.frontFace(gl.CW);
    this.drawSky(rf, inv, eyeRefl);
    this.drawWorld(rf, { clip: true, clipY: planeY });
    this.drawAdditive(rf, opts);
    gl.frontFace(gl.CCW);

    gl.bindTexture(gl.TEXTURE_2D, target.tex.tex);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  render(f) {
    const gl = this.gl;
    const w = this.width, h = this.height;

    // ---- reflections
    this.drawReflection(this.targets.ground, 0.0, f, { skipShaft: true });
    this.drawReflection(this.targets.sea, SCENE_LAYOUT.seaLevel, f, { glowGain: 0.55, skipShaft: true });

    // ---- main pass
    const main = this.targets.main;
    main.bind();
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.frontFace(gl.CCW);

    const mf = { ...f, res: [main.width, main.height], clipOn: false, clipY: 0 };
    this.drawSky(mf, invert(mat4(), mf.viewProj), f.eye);
    this.drawWorld(mf);
    this.drawGround(mf);
    this.drawSea(mf);
    this.drawAdditive(mf, { skipGlow: f.noGlow, skipShaft: f.noShaft });

    // ---- resolve
    if (!this.msaaFallback && main.resolve) main.resolve(this.targets.hdr);
    else {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, main.fbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.targets.hdr.fbo);
      gl.blitFramebuffer(0, 0, main.width, main.height, 0, 0, this.targets.hdr.width,
        this.targets.hdr.height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    this.renderBloom();

    // ---- composite to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.glc.canvas.width, this.glc.canvas.height);
    const p = this.glc.use(this.programs.composite);
    p.tex({ uScene: this.targets.hdr.tex, uBloom: this.targets.bloom[0].tex });
    p.v2('uResolution', [this.glc.canvas.width, this.glc.canvas.height]);
    p.f('uBloomStrength', f.bloomStrength);
    p.f('uExposure', Math.pow(2, f.exposure));
    p.f('uTime', f.time);
    p.f('uVignette', 0.38);
    p.f('uGrain', 0.016);
    p.f('uChromatic', 0.55);
    p.f('uDroplets', f.droplets);
    p.f('uFlash', f.flash);
    p.f('uWetEdge', 0.8);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    this.glc.drawFullscreen();
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
  }

  renderBloom() {
    const gl = this.gl;
    const chain = this.targets.bloom;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    let src = this.targets.hdr;
    for (let i = 0; i < chain.length; i++) {
      const dst = chain[i];
      dst.bind();
      const p = this.glc.use(this.programs.bloomDown);
      p.tex({ uSrc: src.tex });
      p.v2('uTexel', [1 / src.width, 1 / src.height]);
      p.f('uThreshold', 1.0).f('uKnee', 0.7);
      p.i('uPrefilter', i === 0 ? 1 : 0);
      this.glc.drawFullscreen();
      src = dst;
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = chain.length - 1; i > 0; i--) {
      const s = chain[i];
      const d = chain[i - 1];
      d.bind();
      const p = this.glc.use(this.programs.bloomUp);
      p.tex({ uSrc: s.tex });
      p.v2('uTexel', [1 / s.width, 1 / s.height]);
      p.f('uRadius', 1.15);
      this.glc.drawFullscreen();
    }
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
  }
}

/* -------------------------------------------------------------- helpers */

const IDENT = identity(mat4());

function assembleFor(desc, defines) {
  return {
    vs: assemble(desc.vs, desc.chunks, defines),
    fs: assemble(desc.fs, desc.chunks, defines),
  };
}

function buildTextures(glc) {
  const gl = glc.gl;
  const n = makeNoiseTexture(512, 1337);
  const noise = glc.texture2D({
    width: n.size, height: n.size, data: n.data,
    internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE,
    filter: 'linear', wrap: 'repeat', mips: true, aniso: 8,
  });
  const nm = makeNormalTexture(512, 77, 2.4);
  const normal = glc.texture2D({
    width: nm.size, height: nm.size, data: nm.data,
    internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE,
    filter: 'linear', wrap: 'repeat', mips: true, aniso: 8,
  });
  return { noise, normal };
}

function groundGeometry() {
  const b = new Builder(20000);
  const x0 = -SCENE_LAYOUT.groundHalfX, x1 = SCENE_LAYOUT.groundHalfX;
  const z0 = SCENE_LAYOUT.groundMinZ, z1 = SCENE_LAYOUT.groundMaxZ + 0.4;
  b.mat({ color: [0.04, 0.04, 0.042], rough: 0.6, metal: 0.0, detail: 2 });
  b.at((x0 + x1) / 2, 0, (z0 + z1) / 2);
  b.planeXZ(x1 - x0, z1 - z0, 64, 40, 0);
  const g = b.build();
  return [g.data, g.index];
}

function disposeTargets(t) {
  if (!t) return;
  if (Array.isArray(t)) { t.forEach(disposeTargets); return; }
  if (t.dispose) t.dispose();
}
