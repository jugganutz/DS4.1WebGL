// Additive billboard glows for lamps, beacons and nav lights.
import { NOISE, GLOBALS } from './lib.js';

const VS = /* glsl */ `
#version 300 es
precision highp float;
#include "globals"

layout(location = 0) in vec3 aCorner;   // -1..1 quad
layout(location = 6) in vec4 iPosSize;  // xyz, size
layout(location = 7) in vec4 iColor;    // rgb, intensity
layout(location = 8) in vec4 iShape;    // x: vertical stretch, y: flare, z: phase, w: unused

out vec2 vUV;
out vec3 vColor;
out float vIntensity;

void main() {
  vec3 c = uCameraPos;
  vec3 toCam = normalize(c - iPosSize.xyz);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  vec3 up = cross(toCam, right);

  float size = iPosSize.w;
  vec3 wp = iPosSize.xyz + right * (aCorner.x * size) + up * (aCorner.y * size * iShape.x);

  float dist = length(c - iPosSize.xyz);
  vIntensity = iColor.w / (1.0 + dist * 0.035);
  vColor = iColor.rgb;
  vUV = aCorner.xy;
  gl_Position = uViewProj * vec4(wp, 1.0);
}
`;

const FS = /* glsl */ `
#version 300 es
precision highp float;

in vec2 vUV;
in vec3 vColor;
in float vIntensity;

uniform float uGlowGain;
uniform float uTime;

out vec4 fragColor;

void main() {
  vec2 p = vUV;
  float r = length(p);
  float halo = pow(max(0.0, 1.0 - r), 3.8);
  float core = exp(-r * r * 42.0);
  float aniso = 1.0 + 0.35 * exp(-abs(p.x) * 7.0) * (1.0 - smoothstep(0.0, 0.45, abs(p.y)));
  float a = (halo * 0.38 + core * 1.45) * aniso;
  a *= 0.85 + 0.15 * sin(uTime * 9.0 + vUV.x * 3.0);
  fragColor = vec4(vColor * a * vIntensity * uGlowGain, a);
}
`;

export default {
  name: 'glow',
  vs: VS,
  fs: FS,
  chunks: { noise: NOISE, globals: GLOBALS },
};
