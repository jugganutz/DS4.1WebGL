// Open water: Gerstner swell, rain-pocked surface, planar reflections, foam.
import { NOISE, UTIL, BRDF, GLOBALS, LIGHTS, SKY, ATMOS } from './lib.js';

const VS = /* glsl */ `
#version 300 es
precision highp float;
#include "globals"

layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUV;

uniform vec4 uWaves[4];

out vec3 vWorld;
out vec3 vNormal;
out float vHeight;
out float vDist;

void main() {
  vec3 p = aPos;
  float t = uTime * (0.55 + uWind * 0.9);
  vec3 n = vec3(0.0, 1.0, 0.0);
  float height = 0.0;

  for (int i = 0; i < 4; i++) {
    vec2 dir = normalize(uWaves[i].xy);
    float amp = uWaves[i].z;
    float k = 6.283185307 / uWaves[i].w;
    float c = sqrt(9.81 / k) * 0.85;
    float ph = k * dot(dir, p.xz) - c * t + float(i) * 1.7;
    float A = amp;
    float Q = 0.55;
    p.x += Q * A * dir.x * cos(ph);
    p.z += Q * A * dir.y * cos(ph);
    p.y += A * sin(ph);
    height += A * sin(ph);
    float wa = k * A;
    n.x -= dir.x * wa * cos(ph);
    n.z -= dir.y * wa * cos(ph);
    n.y -= Q * wa * sin(ph);
  }

  vec4 wp = uModel * vec4(p, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(n);
  vHeight = height;
  vDist = length(wp.xz - uCameraPos.xz);
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
in float vHeight;
in float vDist;

uniform sampler2D uNoise;
uniform sampler2D uReflection;
uniform float uReflLevels;
uniform float uReflStrength;
uniform float uSeaLevel;

out vec4 fragColor;

void main() {
  if (uClipOn > 0.5 && vWorld.y < uClipY) discard;

  vec3 P = vWorld;
  vec3 V = normalize(uCameraPos - P);
  float dist = length(uCameraPos - P);

  // Detail normal: wind-driven chop, scales with distance so it never aliases.
  vec2 flow = normalize(vec2(0.35, -1.0)) * (0.15 + uWind * 0.55);
  vec2 uv1 = P.xz * 0.045 + flow * uTime * 0.35;
  vec2 uv2 = P.xz * 0.19 - flow * uTime * 0.62;
  float h1 = texture(uNoise, uv1).g;
  float h2 = texture(uNoise, uv2).b;
  float chop = h1 * 0.65 + h2 * 0.35;

  vec3 N = normalize(vNormal);
  float far = smoothstep(30.0, 400.0, vDist);
  N = bumpNormal(N, P, chop * 1.6, 0.20 * (1.0 - far * 0.35));

  // Rain pocking the surface.
  vec2 rip = rainRipples(P.xz, uTime, 3.2, 1.0) + rainRipples(P.xz + 21.3, uTime * 1.7, 7.1, 0.5);
  rip *= uRain * (1.0 - far * 0.85);
  N = normalize(N + vec3(rip.x * 0.32, 0.0, rip.y * 0.32));

  // Water body: near-black with a cold green-teal cast.
  float facing = clamp(dot(N, V), 0.0, 1.0);
  vec3 deep = vec3(0.0055, 0.0175, 0.0190);
  vec3 shallow = vec3(0.013, 0.034, 0.032);
  vec3 albedo = mix(deep, shallow, smoothstep(0.2, 1.0, facing) * 0.6);
  float rough = mix(0.14, 0.30, far);
  rough = mix(rough, 0.42, smoothstep(0.75, 1.0, chop) * 0.4);

  // Planar reflection
  vec2 suv = gl_FragCoord.xy / uResolution;
  vec3 reflN = vec3(N.x, 0.0, N.z);
  vec2 ruv = suv + reflN.xz * (0.045 + 0.075 * (1.0 - facing)) / (1.0 + dist * 0.02);
  vec2 edge = smoothstep(0.0, 0.04, ruv) * smoothstep(1.0, 0.96, ruv);
  float lod = mix(0.35, 1.3, far) + (1.0 - chop) * 0.4 + smoothstep(150.0, 900.0, vDist) * 1.4;
  vec3 refl = textureLod(uReflection, clamp(ruv, 0.002, 0.998), lod).rgb;

  float fres = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
  float reflAmt = clamp(fres * 1.25 * uReflStrength, 0.0, 0.98) * edge.x * edge.y;

  vec3 lit = shadeSurface(P, N, V, albedo * (1.0 - reflAmt), rough, 0.0, 1.0, 0.55);
  vec3 R = reflect(-V, N);
  vec3 skyRefl = mix(uFogColor, uZenithColor, clamp(R.y, 0.0, 1.0));
  vec3 col = lit + refl * reflAmt + skyRefl * fres * 0.75;
  // a little in-scattered light so the basin never goes fully black
  col += vec3(0.006, 0.009, 0.010) * (0.4 + 0.6 * smoothstep(0.0, 40.0, vDist));

  // Foam: along the quay wall, around the fenders and on steep crests.
  float foam = 0.0;
  {
    float quayEdge = smoothstep(45.0, 39.2, P.z);
    float lap = 0.5 + 0.5 * sin(P.z * 1.4 - uTime * 1.1 + P.x * 0.35);
    foam += quayEdge * (0.30 + 0.55 * lap) * 0.55;
    // hull waterline
    float hullBand = smoothstep(43.6, 45.2, P.z) * smoothstep(50.0, 47.0, P.z);
    foam += hullBand * 0.5;
    float crest = smoothstep(0.68, 1.0, chop) * smoothstep(0.5, 1.2, vHeight) * 0.55;
    foam += crest;
    foam *= smoothstep(0.3, 0.8, texture(uNoise, P.xz * 0.3 + vec2(uTime * 0.02, 0.0)).b + 0.3);
    foam = clamp(foam, 0.0, 1.0) * smoothstep(0.0, 8.0, vDist);
  }
  vec3 foamLit = shadeSurface(P, vec3(0.0, 1.0, 0.0), V, vec3(0.26, 0.28, 0.29), 0.6, 0.0, 1.0, 1.0);
  col = mix(col, foamLit, foam * 0.7);

  col = applyFog(col, P);
  fragColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  name: 'sea',
  vs: VS,
  fs: FS,
  chunks: { noise: NOISE, util: UTIL, globals: GLOBALS, brdf: BRDF, lights: LIGHTS, sky: SKY, atmos: ATMOS },
  samplers: ['uNoise', 'uReflection'],
};
