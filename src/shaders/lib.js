// Shared GLSL chunks. Assembled with #include by src/engine/shader.js.

export const NOISE = /* glsl */ `
#define PI 3.141592653589793
#define TAU 6.283185307179586

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p, int oct) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    s += a * vnoise(p);
    n += a;
    p = p * 2.02 + vec2(11.3, 7.7);
    a *= 0.5;
  }
  return s / n;
}

float vnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}

float fbm3(vec3 p, int oct) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= oct) break;
    s += a * vnoise3(p);
    n += a;
    p = p * 2.03 + vec3(5.1, 3.7, 9.3);
    a *= 0.5;
  }
  return s / n;
}

// Expanding rain rings on a wet surface -> tangential normal offset.
vec2 rainRipples(vec2 p, float t, float density, float strength) {
  vec2 acc = vec2(0.0);
  vec2 gp = p * density;
  vec2 ip = floor(gp);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 rnd = hash22(ip + o);
      float phase = fract(t * (0.55 + rnd.y * 0.75) + rnd.x);
      vec2 c = o + 0.15 + 0.7 * hash22(ip + o + 7.13) - fract(gp);
      float d = length(c);
      float radius = phase * 0.78;
      float ring = exp(-90.0 * (d - radius) * (d - radius));
      float amp = (1.0 - phase) * (1.0 - phase);
      acc += normalize(c + 1e-4) * ring * amp * sin((d - radius) * 42.0);
    }
  }
  return acc * strength;
}
`;

export const BRDF = /* glsl */ `
float D_GGX(float NoH, float a) {
  float a2 = a * a;
  float d = NoH * NoH * (a2 - 1.0) + 1.0;
  return a2 / max(PI * d * d, 1e-7);
}

float V_SmithGGX(float NoV, float NoL, float a) {
  float a2 = a * a;
  float gv = NoL * sqrt(NoV * NoV * (1.0 - a2) + a2);
  float gl = NoV * sqrt(NoL * NoL * (1.0 - a2) + a2);
  return 0.5 / max(gv + gl, 1e-5);
}

vec3 F_Schlick(vec3 f0, float u) {
  float f = pow(1.0 - u, 5.0);
  return f0 + (vec3(1.0) - f0) * f;
}

// Standard microfacet BRDF, returns outgoing radiance for a unit-radiance light.
vec3 brdfEval(vec3 N, vec3 V, vec3 L, vec3 albedo, float rough, float metal) {
  float NoV = max(dot(N, V), 1e-4);
  float NoL = max(dot(N, L), 0.0);
  if (NoL <= 0.0) return vec3(0.0);
  vec3 H = normalize(V + L);
  float NoH = max(dot(N, H), 0.0);
  float VoH = max(dot(V, H), 0.0);
  float a = max(rough * rough, 0.0016);
  float D = D_GGX(NoH, a);
  float Vis = V_SmithGGX(NoV, NoL, a);
  vec3 f0 = mix(vec3(0.04), albedo, metal);
  vec3 F = F_Schlick(f0, VoH);
  vec3 spec = D * Vis * F;
  vec3 kd = (1.0 - F) * (1.0 - metal);
  return (kd * albedo / PI + spec) * NoL;
}
`;

export const GLOBALS = /* glsl */ `
uniform mat4 uViewProj;
uniform mat4 uModel;
uniform vec3 uCameraPos;
uniform float uTime;
uniform vec2 uResolution;
uniform float uClipY;
uniform float uClipOn;
uniform float uEmissiveBoost;
uniform vec3 uSkyAmbient;
uniform vec3 uBounceAmbient;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform vec3 uFogColor;
uniform vec3 uZenithColor;
uniform float uFogDensity;
uniform float uFogFalloff;
uniform float uFogMax;
uniform float uRain;
uniform float uWind;
uniform float uWetness;
uniform float uExposure;
uniform float uCloudCover;
uniform float uFlash;
`;

export const LIGHTS = /* glsl */ `
// Lights are passed as three parallel vec4 arrays (pos+radius, colour+cosOuter,
// direction+cosInner). Parallel arrays keep the upload path simple and portable.
uniform vec4 uLightA[NL];
uniform vec4 uLightB[NL];
uniform vec4 uLightC[NL];
uniform int uNumLights;

float lightAttenuation(float dist, float dist2, float radius) {
  float inv = 1.0 / max(dist2, 0.02);
  float r = dist / radius;
  float win = clamp(1.0 - r * r * r * r, 0.0, 1.0);
  return inv * win * win;
}

vec3 shadeSurface(vec3 P, vec3 N, vec3 V, vec3 albedo, float rough, float metal, float ao, float specMul) {
  vec3 col = vec3(0.0);

  for (int i = 0; i < NL; i++) {
    if (i >= uNumLights) break;
    vec4 pr = uLightA[i];
    vec3 Lv = pr.xyz - P;
    float dist2 = dot(Lv, Lv);
    float r2 = pr.w * pr.w;
    if (dist2 > r2) continue;
    float dist = sqrt(dist2);
    vec3 L = Lv / max(dist, 1e-4);
    float atten = lightAttenuation(dist, dist2, pr.w);
    float cosOuter = uLightB[i].w;
    if (cosOuter > -1.5) {
      float cd = dot(-L, uLightC[i].xyz);
      float spot = smoothstep(cosOuter, uLightC[i].w, cd);
      if (spot <= 0.001) continue;
      atten *= spot;
    }
    vec3 radiance = uLightB[i].rgb * atten;
    vec3 b = brdfEval(N, V, L, albedo, rough, metal);
    // specular multiplier lets wet surfaces push highlights without changing the lobe shape
    col += b * radiance * vec3(1.0, 1.0, specMul);
  }

  // Hemisphere ambient + a touch of wet bounce from the deck.
  float hemi = N.y * 0.5 + 0.5;
  vec3 amb = mix(uBounceAmbient, uSkyAmbient, hemi);
  amb += vec3(0.30, 0.35, 0.48) * uFlash * 0.075;
  vec3 f0 = mix(vec3(0.04), albedo, metal);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  col += albedo * amb * ao * (1.0 - metal * 0.6);
  col += amb * f0 * (0.35 + 0.65 * fres) * (1.0 - rough) * ao * specMul;

  // Dim overcast moonlight (directional, no shadow).
  float ndl = max(dot(N, uMoonDir), 0.0);
  if (ndl > 0.0) {
    col += brdfEval(N, V, uMoonDir, albedo, rough, metal) * uMoonColor;
  }
  return col;
}
`;

export const UTIL = /* glsl */ `
// Stable planar UV for axis-aligned geometry (no tangents needed).
vec2 planUV(vec3 P, vec3 N) {
  vec3 a = abs(N);
  if (a.y > max(a.x, a.z)) return P.xz;
  if (a.x > a.z) return vec2(P.z, P.y);
  return vec2(P.x, P.y);
}

// Bump mapping without tangents (Mikkelsen).
vec3 bumpNormal(vec3 N, vec3 P, float h, float strength) {
  vec3 dpdx = dFdx(P);
  vec3 dpdy = dFdy(P);
  float dhdx = dFdx(h);
  float dhdy = dFdy(h);
  vec3 r1 = cross(dpdy, N);
  vec3 r2 = cross(N, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det) * (dhdx * r1 + dhdy * r2);
  return normalize(abs(det) * N - strength * grad);
}
`;

export const SKY = /* glsl */ `
vec3 skyColor(vec3 d) {
  float h = clamp(d.y, -1.0, 1.0);
  float up = pow(clamp(h, 0.0, 1.0), 0.55);
  vec3 col = mix(uFogColor, uZenithColor, up);

  // Sodium/LED light pollution bleeding up from the terminal, strongest toward -z.
  float land = 0.5 + 0.5 * (-d.z * 0.75 - d.x * 0.15);
  float band = exp(-max(h, 0.0) * 7.0);
  col += vec3(0.070, 0.036, 0.014) * band * land * 0.9;
  col += vec3(0.012, 0.030, 0.038) * exp(-max(h, 0.0) * 3.0) * (1.0 - land) * 0.7;

  // Low overcast: fbm projected on a cloud plane, scrolled by wind.
  float y = max(abs(d.y), 0.055);
  vec2 cuv = d.xz / y * 0.16;
  float t = uTime * 0.0035 * (0.4 + uWind);
  vec2 drift = vec2(t * 1.4, t * 0.55);
  float n1 = fbm(cuv * 1.1 + drift, 5);
  float n2 = fbm(cuv * 3.7 + drift * 2.3 + 13.0, 4);
  float n3 = fbm(cuv * 0.35 + drift * 0.5 - 4.0, 3);
  float dens = n1 * 0.55 + n2 * 0.3 + n3 * 0.3;
  float cov = smoothstep(0.36, 0.72, dens);
  cov *= uCloudCover;

  // Cloud underside is lit by the terminal and by the moon above.
  float moonAmt = pow(max(dot(d, uMoonDir), 0.0), 6.0);
  vec3 cloudDark = vec3(0.0100, 0.0128, 0.0170);
  vec3 cloudLit = vec3(0.040, 0.038, 0.037) + uMoonColor * moonAmt * 0.55;
  vec3 cloud = mix(cloudDark, cloudLit, smoothstep(0.3, 0.9, dens) + moonAmt * 0.35);
  cloud += vec3(0.030, 0.016, 0.008) * band * land * smoothstep(0.25, 0.7, dens) * 1.2;
  col = mix(col, cloud, cov * 0.92);

  // Moon disc smeared by cloud; only a soft glow survives the overcast.
  float m = max(dot(d, uMoonDir), 0.0);
  col += uMoonColor * (pow(m, 900.0) * 1.6 + pow(m, 40.0) * 0.12 + pow(m, 6.0) * 0.03) * (1.0 - cov * 0.75);

  // Horizon haze band
  col = mix(col, uFogColor * 1.06, exp(-max(h, 0.0) * 26.0) * 0.55);
  // lightning lights the cloud deck from inside
  col += vec3(0.45, 0.52, 0.68) * uFlash * (0.25 + 0.9 * cov) * 0.075;
  return max(col, vec3(0.0));
}
`;

export const ATMOS = /* glsl */ `
// Exponential height fog, analytically integrated along the view ray.
vec3 applyFog(vec3 color, vec3 P) {
  vec3 rv = P - uCameraPos;
  float dist = length(rv);
  vec3 rd = rv / max(dist, 1e-4);
  float b = uFogFalloff;
  float dy = rd.y * dist;
  float f = abs(dy) > 0.02 ? (1.0 - exp(-b * dy)) / (b * dy) : 1.0;
  float optical = uFogDensity * exp(-b * max(uCameraPos.y, -8.0)) * dist * max(f, 0.0);
  float amt = 1.0 - exp(-max(optical, 0.0));
  amt = min(amt, uFogMax);
  vec3 fcol = mix(uFogColor, uZenithColor, smoothstep(0.0, 0.5, rd.y));
  return mix(color, fcol, amt);}

// Additive scattering halo around point lights in the rain (screen-space sprite
// shaders handle the big glows; this handles the local "wet air" bloom).
vec3 scatterGlow(vec3 color, vec3 P, float power) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < NL; i++) {
    if (i >= uNumLights) break;
    float dist = length(uLightA[i].xyz - P);
    float g = exp(-dist * 0.09) * power;
    acc += uLightB[i].rgb * g;
  }
  return color + acc;
}
`;
