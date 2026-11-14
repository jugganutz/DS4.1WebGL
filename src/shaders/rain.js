// Instanced rain streaks: a wrapping volume of stretched, camera-facing quads.
import { NOISE, BRDF, GLOBALS, LIGHTS } from './lib.js';

const VS = /* glsl */ `
#version 300 es
precision highp float;
#include "globals"
#include "noise"
#include "brdf"
#include "lights"

layout(location = 0) in vec3 aCorner;    // x: -0.5..0.5 across, y: 0..1 along
layout(location = 6) in vec4 iSeed;      // xyz base position, w random
layout(location = 7) in vec4 iParams;    // speed, length, width, brightness

uniform vec3 uBoxSize;
uniform vec3 uWindVec;
uniform float uRainDensity;

out vec3 vColor;
out float vAlpha;
out vec2 vUV;

vec3 rainLight(vec3 P) {
  vec3 acc = uSkyAmbient * 0.8 + uBounceAmbient * 0.5;
  for (int i = 0; i < NL; i++) {
    if (i >= 12) break;
    vec3 d = uLightA[i].xyz - P;
    float dist2 = dot(d, d);
    acc += uLightB[i].rgb * (0.0009 / (1.0 + dist2 * 0.05));
  }
  return acc;
}

void main() {
  float t = uTime * iParams.x;
  vec3 p = iSeed.xyz;
  p.y -= t;
  vec2 wind = uWindVec.xz;
  p.xz += wind * t;

  // Wrap the volume around the camera.
  vec3 c = uCameraPos;
  p = c + mod(p - c + uBoxSize * 0.5, uBoxSize) - uBoxSize * 0.5;

  vec3 vel = normalize(vec3(uWindVec.x * 1.4, -1.0, uWindVec.z * 1.4));
  vec3 toCam = normalize(c - p);
  vec3 side = normalize(cross(vel, toCam));

  float len = iParams.y * (0.65 + 0.7 * fract(iSeed.w * 13.71));
  float wdt = iParams.z * (0.7 + 0.6 * fract(iSeed.w * 7.13));

  vec3 wp = p + vel * (aCorner.y * len) + side * (aCorner.x * wdt);

  // Keep rain out of the camera's face but visible near it.
  float dist = length(wp - c);
  float near = smoothstep(0.35, 2.2, dist);
  float far = 1.0 - smoothstep(uBoxSize.x * 0.28, uBoxSize.x * 0.5, dist);

  vec4 vp = uViewProj * vec4(wp, 1.0);
  gl_Position = vp;

  vUV = aCorner.xy;
  vColor = rainLight(wp) * iParams.w;
  vAlpha = near * far * uRainDensity * (0.42 + 0.3 * fract(iSeed.w * 3.3));
}
`;

const FS = /* glsl */ `
#version 300 es
precision highp float;

in vec3 vColor;
in float vAlpha;
in vec2 vUV;

out vec4 fragColor;

void main() {
  // soft along the streak, hard across it
  float across = smoothstep(0.5, 0.06, abs(vUV.x));
  float along = smoothstep(0.0, 0.25, vUV.y) * smoothstep(1.0, 0.72, vUV.y);
  float a = across * along * vAlpha;
  if (a < 0.004) discard;
  vec3 col = vColor * (1.0 + 1.6 * across);
  fragColor = vec4(col * a, a);
}
`;

export default {
  name: 'rain',
  vs: VS,
  fs: FS,
  chunks: { noise: NOISE, brdf: BRDF, globals: GLOBALS, lights: LIGHTS },
};
