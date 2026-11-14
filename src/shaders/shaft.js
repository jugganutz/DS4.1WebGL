// Faked volumetric light cones under the lamps (additive, depth-tested).
import { NOISE, GLOBALS } from './lib.js';

const VS = /* glsl */ `
#version 300 es
precision highp float;
#include "globals"

layout(location = 0) in vec3 aPos;      // cone: apex origin, base at y=-1, radius 1
layout(location = 1) in vec3 aNormal;
layout(location = 6) in vec4 iM0;
layout(location = 7) in vec4 iM1;
layout(location = 8) in vec4 iM2;
layout(location = 9) in vec4 iM3;
layout(location = 10) in vec4 iColor;   // rgb, intensity
layout(location = 11) in vec4 iParams;  // height t, radius, softness, phase

out vec3 vWorld;
out vec3 vNormal;
out vec3 vColor;
out float vT;

void main() {
  mat4 M = mat4(iM0, iM1, iM2, iM3);
  vec4 wp = M * vec4(aPos, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(M) * aNormal);
  vColor = iColor.rgb * iColor.w;
  vT = -aPos.y;
  gl_Position = uViewProj * wp;
}
`;

const FS = /* glsl */ `
#version 300 es
precision highp float;
#include "globals"

in vec3 vWorld;
in vec3 vNormal;
in vec3 vColor;
in float vT;

uniform float uGain;
uniform sampler2D uNoise;

out vec4 fragColor;

void main() {
  vec3 V = normalize(uCameraPos - vWorld);
  float facing = abs(dot(normalize(vNormal), V));
  // Longest chord through the cone is near the silhouette centre.
  float vol = pow(facing, 1.6);

  // Fade out at the apex and near the floor, plus a slow drift.
  float vert = smoothstep(0.0, 0.14, vT) * smoothstep(1.0, 0.55, vT);
  float rainNoise = texture(uNoise, vWorld.xz * 0.09 + vec2(uTime * 0.02, uTime * 0.11)).b;
  float shimmer = 0.72 + 0.5 * rainNoise;

  float a = vol * vert * shimmer * uGain;
  fragColor = vec4(vColor * a, a);
}
`;

export default {
  name: 'shaft',
  vs: VS,
  fs: FS,
  chunks: { noise: NOISE, globals: GLOBALS },
};
