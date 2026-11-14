// Overcast sky with light pollution, drawn as a fullscreen triangle.
import { NOISE, GLOBALS, SKY } from './lib.js';

const VS = /* glsl */ `
#version 300 es
precision highp float;
out vec2 vUV;
void main() {
  vUV = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(vUV * 2.0 - 1.0, 1.0, 1.0);
}
`;

const FS = /* glsl */ `
#version 300 es
precision highp float;
#include "noise"
#include "globals"
#include "sky"

uniform mat4 uInvViewProj;
in vec2 vUV;
out vec4 fragColor;

void main() {
  vec2 ndc = vUV * 2.0 - 1.0;
  vec4 p = uInvViewProj * vec4(ndc, 1.0, 1.0);
  vec3 dir = normalize(p.xyz / p.w - uCameraPos);
  vec3 col = skyColor(dir);
  fragColor = vec4(col, 1.0);
}
`;

export default {
  name: 'sky',
  vs: VS,
  fs: FS,
  chunks: { noise: NOISE, globals: GLOBALS, sky: SKY },
};
