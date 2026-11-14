// Thin, opinionated WebGL2 layer: programs, meshes, textures, render targets.
// Everything the scene needs, nothing it doesn't.

export const ATTRIBS = [
  { name: 'aPos', size: 3 },
  { name: 'aNormal', size: 3 },
  { name: 'aUV', size: 2 },
  { name: 'aColor', size: 3 },
  { name: 'aParams', size: 4 }, // roughness, metalness, detailId, ao
  { name: 'aEmissive', size: 3 },
];

export const VERTEX_FLOATS = ATTRIBS.reduce((n, a) => n + a.size, 0); // 18
export const VERTEX_BYTES = VERTEX_FLOATS * 4;

export class GL {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
      desynchronized: true,
    });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.canvas = canvas;
    this.ext = {
      colorFloat: gl.getExtension('EXT_color_buffer_float'),
      floatLinear: gl.getExtension('OES_texture_float_linear'),
      aniso: gl.getExtension('EXT_texture_filter_anisotropic'),
      lose: gl.getExtension('WEBGL_lose_context'),
    };
    this.halfFloat = !!this.ext.colorFloat;
    this.maxAniso = this.ext.aniso ? gl.getParameter(this.ext.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 1;
    this._vao = null;
    this._program = null;
    this._emptyVao = gl.createVertexArray();
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.memory = { textures: 0, buffers: 0 };
  }

  get vw() { return this.gl.drawingBufferWidth; }
  get vh() { return this.gl.drawingBufferHeight; }

  program(vs, fs, name = 'program') {
    const p = new Program(this, vs, fs, name);
    return p;
  }

  use(program) {
    if (this._program === program) return program;
    this.gl.useProgram(program.prog);
    this._program = program;
    return program;
  }

  bindVAO(vao) {
    if (this._vao === vao) return;
    this.gl.bindVertexArray(vao);
    this._vao = vao;
  }

  drawFullscreen() {
    this.bindVAO(this._emptyVao);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }

  /* ------------------------------------------------------------ meshes */

  // data: interleaved Float32Array (VERTEX_FLOATS per vertex), index: Uint32Array|null
  mesh(data, index, instanceCount = 0) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    let off = 0;
    for (let i = 0; i < ATTRIBS.length; i++) {
      const a = ATTRIBS[i];
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, a.size, gl.FLOAT, false, VERTEX_BYTES, off);
      off += a.size * 4;
    }
    let ibo = null;
    let count = data.length / VERTEX_FLOATS;
    if (index) {
      ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW);
      count = index.length;
    }
    gl.bindVertexArray(null);
    this._vao = null;
    this.memory.buffers++;
    return {
      vao, vbo, ibo, count,
      indexed: !!index,
      instanceCount,
      draw(n = instanceCount) {
        const g = gl;
        if (index) g.drawElements(g.TRIANGLES, count, g.UNSIGNED_INT, 0);
        else g.drawArrays(g.TRIANGLES, 0, count);
      },
      dispose() {
        gl.deleteVertexArray(vao);
        gl.deleteBuffer(vbo);
        if (ibo) gl.deleteBuffer(ibo);
      },
    };
  }

  // Instanced mesh: base geometry in the standard 18-float layout plus one or more
  // instance streams described by { loc, size, data }.
  instancedMesh({ data, index, instanceCount, streams = [], baseAttribs = 6, stride = VERTEX_FLOATS }) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    let off = 0;
    for (let i = 0; i < baseAttribs; i++) {
      const a = ATTRIBS[i];
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, a.size, gl.FLOAT, false, stride * 4, off);
      off += a.size * 4;
    }
    let ibo = null;
    let count = data.length / stride;
    if (index) {
      ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW);
      count = index.length;
    }
    const buffers = [];
    for (const s of streams) {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, s.data, s.dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
      const size = s.size ?? 4;
      const sStride = s.stride ?? size * 4;
      for (let k = 0; k < (s.components ?? 1); k++) {
        const loc = s.loc + k;
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, sStride, k * size * 4);
        gl.vertexAttribDivisor(loc, 1);
      }
      buffers.push({ buf: b, stream: s });
    }
    gl.bindVertexArray(null);
    this._vao = null;
    return {
      vao, vbo, ibo, count, instanceCount, indexed: !!index, streams: buffers,
      draw(n = instanceCount) {
        if (index) gl.drawElementsInstanced(gl.TRIANGLES, count, gl.UNSIGNED_INT, 0, n);
        else gl.drawArraysInstanced(gl.TRIANGLES, 0, count, n);
      },
      updateStream(i, arr) {
        const s = buffers[i];
        gl.bindBuffer(gl.ARRAY_BUFFER, s.buf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, arr);
      },
      dispose() {
        gl.deleteVertexArray(vao);
        gl.deleteBuffer(vbo);
        if (ibo) gl.deleteBuffer(ibo);
        for (const s of buffers) gl.deleteBuffer(s.buf);
      },
    };
  }

  /* ---------------------------------------------------------- textures */
  texture2D({ width, height, data = null, internalFormat = null, format = null, type = null,
              filter = 'linear', wrap = 'clamp', mips = false, levels = 1, aniso = 1, flipY = false }) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const ifmt = internalFormat || gl.RGBA8;
    const lv = levels > 1 ? levels : (mips ? Math.floor(Math.log2(Math.max(width, height))) + 1 : 1);
    gl.texStorage2D(gl.TEXTURE_2D, lv, ifmt, width, height);
    if (data) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, format || gl.RGBA, type || gl.UNSIGNED_BYTE, data);
    const f = filter === 'nearest' ? gl.NEAREST : filter === 'linear' ? gl.LINEAR : (gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? (filter === 'nearest' ? gl.NEAREST_MIPMAP_NEAREST : gl.LINEAR_MIPMAP_LINEAR) : f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter === 'nearest' ? gl.NEAREST : gl.LINEAR);
    const w = wrap === 'repeat' ? gl.REPEAT : wrap === 'mirror' ? gl.MIRRORED_REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, w);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, w);
    if (aniso > 1 && this.ext.aniso) gl.texParameterf(gl.TEXTURE_2D, this.ext.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(aniso, this.maxAniso));
    if (mips && data) gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.memory.textures++;
    return { tex, width, height, levels: lv };
  }

  bindTexture(unit, tex, target = null) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(target || gl.TEXTURE_2D, tex ? tex.tex : null);
  }

  /* -------------------------------------------------------- render targets */

  target({ width, height, float = true, depth = false, mips = false, filter = 'linear' }) {
    const gl = this.gl;
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    const useFloat = float && this.halfFloat;
    const internal = useFloat ? gl.RGBA16F : gl.RGBA8;
    const type = useFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    const levels = mips ? Math.floor(Math.log2(Math.max(w, h))) + 1 : 1;
    const tex = this.texture2D({ width: w, height: h, internalFormat: internal, format: gl.RGBA, type, levels, filter, wrap: 'clamp', mips });
    let depthTex = null;
    if (depth) {
      depthTex = this.texture2D({
        width: w, height: h, internalFormat: gl.DEPTH_COMPONENT24, format: gl.DEPTH_COMPONENT,
        type: gl.UNSIGNED_INT, filter: 'nearest',
      });
    }
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex.tex, 0);
    if (depthTex) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex.tex, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Incomplete framebuffer: 0x' + status.toString(16));
    const rt = {
      width: w, height: h, tex, depthTex, fbo, float: useFloat, mips, levels,
      bind() { gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, w, h); },
      dispose() {
        gl.deleteFramebuffer(fbo);
        gl.deleteTexture(tex.tex);
        if (depthTex) gl.deleteTexture(depthTex.tex);
      },
    };
    return rt;
  }

  // Multisampled offscreen target + resolve into a texture target.
  msaaTarget({ width, height, samples = 4, depth = true }) {
    const gl = this.gl;
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    const internal = this.halfFloat ? gl.RGBA16F : gl.RGBA8;
    const maxSamples = gl.getParameter(gl.MAX_SAMPLES);
    const s = Math.min(samples, maxSamples);
    const color = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, color);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, s, internal, w, h);
    let depthRb = null;
    if (depth) {
      depthRb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, depthRb);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, s, gl.DEPTH_COMPONENT24, w, h);
    }
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
    if (depthRb) gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRb);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    if (!ok) return null;
    return {
      width: w, height: h, samples: s, fbo, color, depthRb,
      bind() { gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, w, h); },
      resolve(dst) {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fbo);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dst.fbo);
        gl.blitFramebuffer(0, 0, w, h, 0, 0, dst.width, dst.height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      },
      dispose() {
        gl.deleteFramebuffer(fbo);
        gl.deleteRenderbuffer(color);
        if (depthRb) gl.deleteRenderbuffer(depthRb);
      },
    };
  }
}

/* ---------------------------------------------------------------- program */

export class Program {
  constructor(glc, vsSrc, fsSrc, name) {
    const gl = glc.gl;
    this.gl = gl;
    this.name = name;
    this.uniforms = new Map();
    const vs = compile(gl, gl.VERTEX_SHADER, vsSrc, name + '.vert');
    const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc, name + '.frag');
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`[${name}] link failed:\n${gl.getProgramInfoLog(prog)}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.prog = prog;
    this.unit = 0;
  }

  loc(n) {
    let l = this.uniforms.get(n);
    if (l === undefined) {
      l = this.gl.getUniformLocation(this.prog, n);
      this.uniforms.set(n, l);
    }
    return l;
  }

  f(n, v) { const l = this.loc(n); if (l) this.gl.uniform1f(l, v); return this; }
  i(n, v) { const l = this.loc(n); if (l) this.gl.uniform1i(l, v); return this; }
  v2(n, a) { const l = this.loc(n); if (l) this.gl.uniform2f(l, a[0], a[1]); return this; }
  v3(n, a) { const l = this.loc(n); if (l) this.gl.uniform3f(l, a[0], a[1], a[2]); return this; }
  v4(n, a) { const l = this.loc(n); if (l) this.gl.uniform4f(l, a[0], a[1], a[2], a[3]); return this; }
  fv(n, a) { const l = this.loc(n); if (l && a.length) this.gl.uniform1fv(l, a); return this; }
  v3fv(n, a) { const l = this.loc(n); if (l && a.length) this.gl.uniform3fv(l, a); return this; }
  v4fv(n, a) { const l = this.loc(n); if (l && a.length) this.gl.uniform4fv(l, a); return this; }
  m4(n, m) { const l = this.loc(n); if (l) this.gl.uniformMatrix4fv(l, false, m); return this; }
  m4v(n, arr) { const l = this.loc(n); if (l) this.gl.uniformMatrix4fv(l, false, arr); return this; }

  // Sampler binding: tex({uSampler: tex}) assigns units in declaration order.
  tex(bindings) {
    const gl = this.gl;
    let unit = 0;
    for (const key in bindings) {
      const t = bindings[key];
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t ? (t.tex || t) : null);
      const l = this.loc(key);
      if (l) gl.uniform1i(l, unit);
      unit++;
    }
    return this;
  }
}

function compile(gl, type, src, label) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || '';
    // Annotate the failing lines to make shader debugging bearable.
    const lines = src.split('\n');
    const annotated = log.replace(/ERROR:\s*\d+:(\d+)/g, (m, ln) => {
      const i = parseInt(ln, 10) - 1;
      return `${m}  |  ${(lines[i] || '').trim()}`;
    });
    throw new Error(`[${label}] compile failed:\n${annotated}\n--- log ---\n${log}`);
  }
  return sh;
}
