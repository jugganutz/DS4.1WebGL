// Post: bloom pyramid, ACES tonemap, grade, grain, chromatic aberration, lens rain.
import { NOISE } from './lib.js';

const FULLSCREEN_VS = /* glsl */ `
#version 300 es
precision highp float;
out vec2 vUV;
void main() {
  vUV = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(vUV * 2.0 - 1.0, 0.0, 1.0);
}
`;

const DOWN_FS = /* glsl */ `
#version 300 es
precision highp float;
#include "noise"
in vec2 vUV;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uKnee;
uniform int uPrefilter;
out vec4 fragColor;

vec3 tap(vec2 uv) { return texture(uSrc, uv).rgb; }

void main() {
  vec3 c = tap(vUV) * 4.0;
  c += tap(vUV + uTexel * vec2(-1.0, -1.0));
  c += tap(vUV + uTexel * vec2(1.0, -1.0));
  c += tap(vUV + uTexel * vec2(-1.0, 1.0));
  c += tap(vUV + uTexel * vec2(1.0, 1.0));
  c /= 8.0;

  if (uPrefilter == 1) {
    float br = max(c.r, max(c.g, c.b));
    float w = smoothstep(uThreshold, uThreshold + uKnee, br);
    c *= w;
    // kill fireflies
    c = min(c, vec3(24.0));
  }
  fragColor = vec4(max(c, vec3(0.0)), 1.0);
}
`;

const UP_FS = /* glsl */ `
#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uRadius;
out vec4 fragColor;

void main() {
  vec3 c = texture(uSrc, vUV).rgb * 4.0;
  c += texture(uSrc, vUV + vec2(-1.0, 0.0) * uTexel * uRadius).rgb * 2.0;
  c += texture(uSrc, vUV + vec2(1.0, 0.0) * uTexel * uRadius).rgb * 2.0;
  c += texture(uSrc, vUV + vec2(0.0, -1.0) * uTexel * uRadius).rgb * 2.0;
  c += texture(uSrc, vUV + vec2(0.0, 1.0) * uTexel * uRadius).rgb * 2.0;
  c += texture(uSrc, vUV + vec2(-1.0, -1.0) * uTexel * uRadius).rgb;
  c += texture(uSrc, vUV + vec2(1.0, -1.0) * uTexel * uRadius).rgb;
  c += texture(uSrc, vUV + vec2(-1.0, 1.0) * uTexel * uRadius).rgb;
  c += texture(uSrc, vUV + vec2(1.0, 1.0) * uTexel * uRadius).rgb;
  fragColor = vec4(c / 16.0, 1.0);
}
`;

const COMPOSITE_FS = /* glsl */ `
#version 300 es
precision highp float;
#include "noise"

in vec2 vUV;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2 uResolution;
uniform float uBloomStrength;
uniform float uExposure;
uniform float uTime;
uniform float uVignette;
uniform float uGrain;
uniform float uChromatic;
uniform float uDroplets;
uniform float uFlash;
uniform float uWetEdge;

out vec4 fragColor;

vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

// Two layers of drifting droplets on the front element.
vec2 dropletRefract(vec2 uv, out float gloss, out float dark) {
  vec2 offset = vec2(0.0);
  gloss = 0.0;
  dark = 0.0;
  float aspect = uResolution.x / uResolution.y;
  for (int L = 0; L < 2; L++) {
    float scale = L == 0 ? 4.0 : 9.0;
    float speed = L == 0 ? 0.0025 : 0.005;
    vec2 p = uv * vec2(aspect, 1.0) * scale;
    p.y += uTime * speed * scale;
    p.x += sin(uTime * 0.3 + float(L)) * 0.15;
    vec2 ip = floor(p);
    vec2 fp = fract(p) - 0.5;
    vec2 rnd = hash22(ip + float(L) * 31.7);
    float radius = 0.05 + 0.09 * rnd.y;
    vec2 centre = (rnd - 0.5) * 0.44;
    float d = length(fp - centre);
    float m = smoothstep(radius, radius * 0.2, d);
    if (m > 0.0) {
      // droplets cling to the edges of the frame and warp what is behind them
      float edge = smoothstep(0.26, 0.92, length(uv - 0.5) * 1.45);
      vec2 dir = normalize(fp - centre + 1e-5);
      offset += dir * m * m * 0.008 * (0.35 + rnd.x) * edge;
      gloss += pow(m, 3.0) * 0.012 * edge;
      dark += m * 0.10 * edge;
    }
  }
  return offset;
}

void main() {
  vec2 uv = vUV;
  float gloss = 0.0, dark = 0.0;
  if (uDroplets > 0.0) {
    vec2 off = dropletRefract(uv, gloss, dark);
    uv += off * uDroplets;
  }

  // Lens chromatic aberration, strongest at the edges.
  vec2 dir = uv - 0.5;
  float r2 = dot(dir, dir);
  float ca = uChromatic * (0.4 + r2 * 2.4) * 0.0035;
  vec3 col;
  col.r = texture(uScene, uv + dir * ca).r;
  col.g = texture(uScene, uv).g;
  col.b = texture(uScene, uv - dir * ca).b;

  vec3 bloom = texture(uBloom, uv).rgb;
  col += bloom * uBloomStrength;
  col += vec3(0.55, 0.62, 0.75) * uFlash * 0.015;
  col += vec3(0.8, 0.85, 0.9) * gloss * uDroplets * 9.0;
  col *= 1.0 - dark * uDroplets * 0.55;

  col *= uExposure * (1.0 + uFlash * 0.08);
  col = aces(col);

  // Grade: cool shadows, faintly warm highlights, slight lift.
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  vec3 shadowTint = vec3(0.86, 0.95, 1.08);
  vec3 highTint = vec3(1.05, 1.0, 0.94);
  col *= mix(shadowTint, highTint, smoothstep(0.05, 0.6, luma));
  col = pow(max(col, vec3(0.0)), vec3(0.955, 1.0, 1.045));
  col = mix(vec3(luma), col, 1.06);

  // Vignette
  float vig = 1.0 - uVignette * pow(clamp(r2 * 2.2, 0.0, 1.0), 1.6);
  col *= vig;

  // Wet lens edge: rain droplets pooling at the bottom corners.
  float bottom = smoothstep(0.55, 1.0, uv.y) * smoothstep(0.35, 1.0, abs(uv.x - 0.5) * 2.0);
  col *= 1.0 - bottom * 0.18 * uWetEdge;

  // Film grain, slightly stronger in the shadows.
  float g = hash12(uv * uResolution + fract(uTime) * 913.7) - 0.5;
  col += g * uGrain * (0.6 + 0.8 * (1.0 - luma));

  // Gamma
  col = pow(max(col, vec3(0.0)), vec3(1.0 / 2.2));
  fragColor = vec4(col, 1.0);
}
`;

export const bloomDown = {
  name: 'bloomDown',
  vs: FULLSCREEN_VS,
  fs: DOWN_FS,
  chunks: { noise: NOISE },
};
export const bloomUp = {
  name: 'bloomUp',
  vs: FULLSCREEN_VS,
  fs: UP_FS,
  chunks: {},
};
export const composite = {
  name: 'composite',
  vs: FULLSCREEN_VS,
  fs: COMPOSITE_FS,
  chunks: { noise: NOISE },
};
