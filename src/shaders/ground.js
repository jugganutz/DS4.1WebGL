// Wet quay surface: puddles, planar reflections, rain rings, painted markings.
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

out vec3 vWorld;
out vec2 vUV;

void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorld = wp.xyz;
  vUV = aUV;
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
in vec2 vUV;

uniform sampler2D uNoise;
uniform sampler2D uNormalTex;
uniform sampler2D uReflection;
uniform float uReflLevels;
uniform float uReflStrength;
uniform vec2 uReflTexel;

out vec4 fragColor;

vec3 sampleReflection(vec2 uv, float lod, float smear) {
  vec3 a = textureLod(uReflection, uv, lod).rgb;
  vec3 b = textureLod(uReflection, uv + vec2(0.0, smear), lod + 0.7).rgb;
  vec3 c = textureLod(uReflection, uv - vec2(0.0, smear), lod + 0.7).rgb;
  return a * 0.5 + (b + c) * 0.25;
}

void main() {
  vec3 P = vWorld;
  vec3 V = normalize(uCameraPos - P);
  float dist = length(uCameraPos - P);

  vec4 nA = texture(uNoise, P.xz * 0.055);
  vec4 nB = texture(uNoise, P.xz * 0.9);
  vec4 nC = texture(uNoise, P.xz * 6.0);

  /* ---------------------------------------------------------- albedo */
  vec3 albedo = vec3(0.035, 0.036, 0.038);       // wet asphalt
  float slab = 1.0;                              // concrete slab joints
  {
    vec2 sp = P.xz / 6.0;
    vec2 sf = abs(fract(sp) - 0.5);
    slab = smoothstep(0.475, 0.499, max(sf.x, sf.y));
  }
  albedo *= 1.0 - 0.45 * slab;
  albedo *= 0.78 + 0.5 * nB.g;
  albedo *= 0.85 + 0.3 * nA.r;

  // Long-run grime and oil patches
  float oil = smoothstep(0.62, 0.85, nA.r * 0.8 + nB.r * 0.4);
  albedo *= 1.0 - 0.35 * oil;

  /* --------------------------------------------------------- markings */
  float paint = 0.0;
  vec3 paintCol = vec3(0.20, 0.175, 0.09);        // faded traffic yellow
  // two dashed lane lines running along the quay
  for (int i = 0; i < 2; i++) {
    float zc = i == 0 ? -6.0 : 14.0;
    float band = smoothstep(0.16, 0.10, abs(P.z - zc));
    float dash = step(0.35, fract(P.x * 0.11));
    paint = max(paint, band * dash);
  }
  // safety hatching near the quay edge
  {
    float edgeZone = smoothstep(30.0, 30.4, P.z) * smoothstep(39.6, 39.2, P.z);
    float hatch = step(0.5, fract((P.x + P.z) * 0.55));
    float wear = smoothstep(0.35, 0.75, fbm(P.xz * 1.6, 3));
    float line = smoothstep(0.06, 0.0, abs(P.z - 30.2)) + smoothstep(0.06, 0.0, abs(P.z - 39.4));
    paint = max(paint, edgeZone * clamp(hatch * 0.45 * wear + line * 0.5, 0.0, 1.0));
    paintCol = mix(paintCol, vec3(0.24, 0.24, 0.23), step(0.5, edgeZone));
  }
  // faded container slot numbers / box grid behind the crane rails
  {
    float grid = smoothstep(0.03, 0.0, abs(fract(P.x / 12.0 + 0.5) - 0.5) - 0.47);
    grid *= smoothstep(-38.0, -34.0, P.z) * smoothstep(4.0, 0.0, P.z);
    paint = max(paint, grid * 0.45);
  }
  albedo = mix(albedo, paintCol * (0.55 + 0.45 * nB.g), paint * 0.85);

  /* ---------------------------------------------------------- puddles */
  float puddleMask = fbm(P.xz * 0.075, 4) * 0.8 + fbm(P.xz * 0.38 + 7.0, 3) * 0.4;
  float pud = smoothstep(0.56, 0.70, puddleMask);
  pud = max(pud, smoothstep(0.62, 0.78, fbm(P.xz * 0.9 + 31.0, 2)) * 0.8);
  pud *= smoothstep(-0.2, 2.0, dist * 0.02 + 0.6);
  float wet = uWetness * (0.55 + 0.45 * pud);
  /* ------------------------------------------------------------ normal */
  vec3 N = vec3(0.0, 1.0, 0.0);
  // micro texture
  float hfine = nC.g * 0.55 + nB.g * 0.9;
  N = bumpNormal(N, P, hfine, 0.012);
  // puddle meniscus
  N = normalize(N + vec3((nA.b - 0.5) * 0.03, 0.0, (nB.b - 0.5) * 0.03) * (1.0 - pud));

  // rain rings, strongest on open water film
  float rippleAmt = uRain * (0.35 + 0.65 * pud);
  vec2 rip = rainRipples(P.xz, uTime, 1.6, 1.0) + rainRipples(P.xz + 13.7, uTime * 1.31, 4.3, 0.6);
  rip *= rippleAmt * 0.5;
  N = normalize(N + vec3(rip.x, 0.0, rip.y));

  /* -------------------------------------------------------- reflection */
  vec2 suv = gl_FragCoord.xy / uResolution;
  vec3 reflN = vec3(N.x, 0.0, N.z);
  float distort = (0.035 + 0.09 * pud) / (1.0 + dist * 0.025);
  vec2 ruv = suv + reflN.xz * distort;
  ruv += rip * 0.02;
  vec2 edge = smoothstep(0.0, 0.045, ruv) * smoothstep(1.0, 0.955, ruv);
  float lod = mix(2.4, 0.15, pud) + smoothstep(20.0, 140.0, dist) * 1.2;
  float smear = (0.006 + 0.02 * (1.0 - pud)) / (1.0 + dist * 0.02);
  vec3 refl = sampleReflection(clamp(ruv, 0.001, 0.999), lod, smear);
  float reflFade = edge.x * edge.y;

  float cosT = clamp(dot(N, V), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
  float reflAmt = clamp((fres * 0.9 + 0.22 * wet * (0.35 + 0.65 * pud)) * (0.35 + 0.65 * wet) * (0.45 + 0.55 * pud) * uReflStrength, 0.0, 0.94);
  reflAmt *= reflFade;
  // water film darkens and kills diffuse
  albedo *= 1.0 - 0.55 * wet;
  float rough = mix(0.66, 0.105, wet * (0.5 + 0.5 * pud));
  float metal = 0.0;
  float ao = 1.0 - 0.35 * slab;

  vec3 lit = shadeSurface(P, N, V, albedo * (1.0 - reflAmt * 0.7), rough, metal, ao, 1.0 + wet * 1.1);
  vec3 col = lit + refl * reflAmt;

  // wet rim highlight at the puddle edge
  col = applyFog(col, P);
  fragColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  name: 'ground',
  vs: VS,
  fs: FS,
  chunks: { noise: NOISE, util: UTIL, globals: GLOBALS, brdf: BRDF, lights: LIGHTS, sky: SKY, atmos: ATMOS },
  samplers: ['uNoise', 'uNormalTex', 'uReflection'],
};
