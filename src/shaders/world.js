// Opaque world surfaces: containers, cranes, ship, terminal, props.
import { NOISE, UTIL, BRDF, GLOBALS, LIGHTS, SKY, ATMOS } from './lib.js';

const VS = /* glsl */ `
#version 300 es
precision highp float;
#include "globals"

layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUV;
layout(location = 3) in vec3 aColor;
layout(location = 4) in vec4 aParams;
layout(location = 5) in vec3 aEmissive;

#ifdef INSTANCED
layout(location = 6) in vec4 iM0;
layout(location = 7) in vec4 iM1;
layout(location = 8) in vec4 iM2;
layout(location = 9) in vec4 iM3;
#endif

out vec3 vWorld;
out vec3 vNormal;
out vec2 vUV;
out vec3 vColor;
out vec4 vParams;
out vec3 vEmissive;

void main() {
#ifdef INSTANCED
  mat4 M = mat4(iM0, iM1, iM2, iM3);
#else
  mat4 M = uModel;
#endif
  vec4 wp = M * vec4(aPos, 1.0);
  vWorld = wp.xyz;
  vNormal = mat3(M) * aNormal;
  vUV = aUV;
  vColor = aColor;
  vParams = aParams;
  vEmissive = aEmissive;
  gl_Position = uViewProj * wp;
}
`;

const FS = /* glsl */ `
#version 300 es
precision highp float;
precision highp sampler2D;

#include "noise"
#include "util"
#include "globals"
#include "brdf"
#include "lights"
#include "sky"
#include "atmos"

in vec3 vWorld;
in vec3 vNormal;
in vec2 vUV;
in vec3 vColor;
in vec4 vParams;
in vec3 vEmissive;

uniform sampler2D uNoise;
uniform sampler2D uNormalTex;
uniform float uDetailStrength;
uniform float uRainStreaks;

out vec4 fragColor;

void main() {
  if (uClipOn > 0.5 && vWorld.y < uClipY) discard;

  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCameraPos - vWorld);
  vec3 albedo = vColor;
  float rough = vParams.x;
  float metal = vParams.y;
  float detail = vParams.z;
  float ao = vParams.w;

  vec2 duv = planUV(vWorld, N);
  vec4 nA = texture(uNoise, duv * 0.14);
  vec4 nB = texture(uNoise, duv * 1.7);
  float dirt = nA.r;
  float grit = nB.g;
  float streak = texture(uNoise, vec2(duv.x * 0.55, duv.y * 0.045)).b;

  float bump = 0.0;

  if (detail < 0.5) {
    // plain painted surface
    albedo *= 0.92 + 0.16 * grit;
    bump = grit * 0.35;
  } else if (detail < 1.5) {
    // shipping container: rust blooms, grime running down, dented panels
    float rust = smoothstep(0.55, 0.92, dirt * 0.65 + streak * 0.5);
    albedo = mix(albedo, vec3(0.135, 0.062, 0.036), rust * 0.62);
    albedo *= 0.86 + 0.26 * grit;
    rough = mix(rough, 0.78, rust * 0.7);
    metal = mix(metal, 0.15, rust);
    float panel = smoothstep(0.42, 0.5, abs(fract(duv.y * 0.39) - 0.5));
    albedo *= 0.93 + 0.07 * panel;
    bump = grit * 0.5 + rust * 0.4;
  } else if (detail < 2.5) {
    // concrete
    albedo *= 0.78 + 0.34 * grit;
    albedo *= 1.0 - 0.22 * smoothstep(0.35, 0.0, vWorld.y);
    rough = mix(0.62, 0.92, dirt);
    float stain = smoothstep(0.55, 0.85, dirt * 0.8 + streak * 0.3);
    albedo *= 1.0 - stain * 0.22;
    bump = grit * 0.75 + dirt * 0.25;
  } else if (detail < 3.5) {
    // painted steel (cranes, masts, machinery)
    float wear = smoothstep(0.6, 0.95, dirt * 0.7 + streak * 0.55);
    albedo = mix(albedo, vec3(0.11, 0.055, 0.03), wear * 0.5);
    albedo *= 0.9 + 0.2 * grit;
    rough = mix(rough, 0.7, wear * 0.6);
    bump = grit * 0.4;
  } else if (detail < 4.5) {
    // galvanised / dirty metal
    albedo *= 0.8 + 0.3 * grit;
    rough = mix(rough, 0.55, dirt * 0.5);
    metal = max(metal, 0.55);
    bump = grit * 0.25;
  } else if (detail < 6.5) {
    // ship hull plating: large mottling, welded seams, rust streaks running down
    float mottle = texture(uNoise, duv * 0.05).r;
    albedo *= 0.82 + 0.36 * mottle;
    float seamX = smoothstep(0.485, 0.5, abs(fract(duv.x * 0.075) - 0.5));
    float seamY = smoothstep(0.49, 0.5, abs(fract(duv.y * 0.05) - 0.5));
    albedo *= 1.0 - 0.3 * clamp(seamX + seamY * 0.5, 0.0, 1.0);
    float rustRun = smoothstep(0.62, 0.95, texture(uNoise, vec2(duv.x * 0.5, duv.y * 0.03)).b * 0.7 + mottle * 0.4);
    albedo = mix(albedo, vec3(0.14, 0.055, 0.028), rustRun * 0.5);
    rough = mix(rough, 0.66, rustRun * 0.6);
    bump = mottle * 0.2;
  } else {
    // rubber / fenders / rope
    albedo *= 0.85 + 0.3 * grit;
    bump = grit * 0.8;
  }

  // Rain soaking: exposed upward faces get darker and much glossier.
  float up = clamp(N.y, 0.0, 1.0);
  float wet = uWetness * smoothstep(0.15, 0.9, up);
  albedo *= 1.0 - 0.34 * wet;
  rough = mix(rough, 0.16, wet * 0.85);
  metal = mix(metal, metal * 0.5, wet * 0.4);

  N = bumpNormal(N, vWorld, bump * uDetailStrength, 0.011);
  // Rain streaks running down vertical faces.
  float vert = 1.0 - up;
  if (uRainStreaks > 0.0 && vert > 0.4) {
    float s = texture(uNoise, vec2(duv.x * 3.5, duv.y * 0.35 - uTime * 0.35)).b;
    float streakMask = smoothstep(0.55, 0.95, s) * vert * uRainStreaks;
    albedo *= 1.0 - 0.3 * streakMask;
    rough = mix(rough, 0.18, streakMask);
    N = normalize(N + vec3(0.0, -streakMask * 0.12 * sin(duv.x * 4.0), 0.0));
  }

  vec3 lit = shadeSurface(vWorld, N, V, albedo, rough, metal, ao, 1.0 + wet * 0.8);
  vec3 emis = vEmissive * uEmissiveBoost;

  vec3 col = lit + emis;
  col = applyFog(col, vWorld);
  fragColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  name: 'world',
  vs: VS,
  fs: FS,
  chunks: { noise: NOISE, util: UTIL, globals: GLOBALS, brdf: BRDF, lights: LIGHTS, sky: SKY, atmos: ATMOS },
  uniforms: ['uModel', 'uDetailStrength', 'uRainStreaks'],
  samplers: ['uNoise', 'uNormalTex'],
};
