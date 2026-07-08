import { hexToRgb, hslToRgb } from '../../framework/color'
import { mulberry32 } from '../../framework/rng'
import type { RaymarcherConfig } from './schema'

export { hexToRgb }

// Fixed uniform-array bounds. `cfg.primitives`/`cfg.palette.length` only change how
// many of these the shader LOOPS over (u_primCount / u_stopCount) — the arrays
// themselves are always fully sized, so growing a count never reshuffles the
// primitives/stops already on screen (mirrors aurora's MAX_STOPS pattern).
export const MAX_PRIMS = 5
export const MAX_STOPS = 6

// Fullscreen triangle from gl_VertexID — no attribute buffers needed.
export const VERT_SRC = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

// A slowly rotating cluster of SDF primitives (spheres / rounded boxes / tori),
// sphere-traced and smooth-min blended into one continuous metaball-like sculpture,
// lit by a single key light + step-count ambient occlusion, over a soft gradient sky.
export const FRAG_SRC = `#version 300 es
precision highp float;

#define MAX_PRIMS ${MAX_PRIMS}
#define MAX_STOPS ${MAX_STOPS}
#define STEPS 80
#define MAX_DIST 14.0
#define SURF_EPS 0.0008

uniform vec2  u_res;
uniform float u_time;                 // accumulated shape-morph phase (seconds · morphSpeed)
uniform vec3  u_camPos;
uniform vec3  u_camTarget;
uniform float u_blend;
uniform int   u_primCount;
uniform float u_primOrbitR[MAX_PRIMS];
uniform float u_primPhase[MAX_PRIMS];
uniform float u_primSpeed[MAX_PRIMS];
uniform float u_primTiltX[MAX_PRIMS];
uniform float u_primTiltZ[MAX_PRIMS];
uniform float u_primSize[MAX_PRIMS];
uniform float u_primType[MAX_PRIMS];  // 0 sphere · 1 rounded box · 2 torus
uniform vec3  u_lightColor;
uniform vec3  u_stops[MAX_STOPS];
uniform int   u_stopCount;
uniform vec3  u_skyHorizon;
uniform vec3  u_skyZenith;
out vec4 fragColor;

float sdSphere(vec3 p, float r) { return length(p) - r; }

float sdRoundBox(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

float sdTorus(vec3 p, vec2 t) {
  vec2 q = vec2(length(p.xz) - t.x, p.y);
  return length(q) - t.y;
}

// Polynomial smooth-min (iq) — this is the metaball fusion: two primitives closer
// than ~k blend into one continuous surface instead of a hard union edge.
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// map(): the whole scene as one signed distance field — a smooth-union of
// u_primCount orbiting primitives. The raymarch loop below samples this every
// step, so it is the single source of truth for the sculpture's shape.
float map(vec3 p) {
  float d = 1e5;
  for (int i = 0; i < MAX_PRIMS; i++) {
    if (i >= u_primCount) break;
    float ang = u_time * u_primSpeed[i] + u_primPhase[i];
    float r = u_primOrbitR[i];
    // Orbit in a plane, then tilt that plane around Z by a per-primitive amount so
    // primitives don't all sweep the same flat disc (reads as a genuine 3D cluster).
    vec3 c = vec3(cos(ang) * r, sin(ang * 0.8 + u_primTiltX[i]) * r * 0.55, sin(ang) * r);
    float ct = u_primTiltZ[i];
    float cs = cos(ct), sn = sin(ct);
    vec3 center = vec3(c.x * cs - c.y * sn, c.x * sn + c.y * cs, c.z);
    vec3 q = p - center;
    float sz = u_primSize[i];
    int typ = int(u_primType[i]);
    float dd;
    if (typ == 0) dd = sdSphere(q, sz);
    else if (typ == 1) dd = sdRoundBox(q, vec3(sz * 0.62), sz * 0.28);
    else dd = sdTorus(q, vec2(sz * 0.85, sz * 0.34));
    d = smin(d, dd, u_blend);
  }
  return d;
}

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(1.0, -1.0) * 0.0009;
  return normalize(
    e.xyy * map(p + e.xyy) +
    e.yyx * map(p + e.yyx) +
    e.yxy * map(p + e.yxy) +
    e.xxx * map(p + e.xxx));
}

// Sphere-traces the SDF; returns the hit distance (-1.0 on a miss past MAX_DIST) and
// writes the iteration count, which the caller turns into a cheap step-count ambient
// occlusion term (more steps to converge ≈ a tighter, more occluded crevice).
float raymarch(vec3 ro, vec3 rd, out float steps) {
  float t = 0.0;
  for (int i = 0; i < STEPS; i++) {
    float d = map(ro + rd * t);
    if (d < SURF_EPS) { steps = float(i); return t; }
    t += d;
    if (t > MAX_DIST) break;
  }
  steps = float(STEPS);
  return -1.0;
}

vec3 palette(float f) {
  f = clamp(f, 0.0, 1.0);
  float x = f * float(u_stopCount - 1);
  int i = int(floor(x));
  if (i >= u_stopCount - 1) return u_stops[u_stopCount - 1];
  return mix(u_stops[i], u_stops[i + 1], x - float(i));
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_res) / min(u_res.x, u_res.y);

  vec3 ro = u_camPos;
  vec3 fwd = normalize(u_camTarget - ro);
  vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, fwd);
  vec3 rd = normalize(uv.x * right + uv.y * up + fwd * 1.6);

  float skyMix = clamp(rd.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 sky = mix(u_skyHorizon, u_skyZenith, pow(skyMix, 0.8));

  float steps;
  float t = raymarch(ro, rd, steps);

  vec3 col;
  if (t > 0.0) {
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);
    float ao = clamp(1.0 - steps / float(STEPS) * 1.6, 0.15, 1.0);

    // Palette lookup drifts slowly across the surface (position + normal + time), so
    // color itself seems to flow over the morphing form rather than sitting static.
    float cf = fract(p.y * 0.16 + n.x * 0.12 + u_time * 0.015);
    vec3 base = palette(cf);

    vec3 lightDir = normalize(vec3(0.55, 0.75, 0.35));
    float diff = max(dot(n, lightDir), 0.0);
    float rim = pow(1.0 - max(dot(n, -rd), 0.0), 2.5);

    vec3 lit = base * (0.2 * ao + diff * ao * 0.9) * u_lightColor + rim * 0.3 * u_lightColor;

    float fog = 1.0 - exp(-t * t * 0.014);
    col = mix(lit, sky, clamp(fog, 0.0, 1.0));
  } else {
    col = sky + vec3(0.05, 0.04, 0.08) * pow(1.0 - abs(rd.y), 4.0);
  }

  col = col / (1.0 + col * 0.22); // gentle filmic roll-off — keeps hue at high exposure
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`

export interface PrimitiveParams {
  orbitR: Float32Array
  phase: Float32Array
  speedMul: Float32Array
  tiltX: Float32Array
  tiltZ: Float32Array
  size: Float32Array
  type: Float32Array
}

/** Deterministic per-primitive placement/phase/size from `seed` (framework mulberry32).
 *  Always derives MAX_PRIMS entries — `cfg.primitives` only changes how many the shader
 *  loops over (a live uniform), so raising the count never reshuffles the primitives
 *  already visible; it just reveals the next one in seed order. */
export function derivePrimitives(seed: number): PrimitiveParams {
  const r = mulberry32((seed >>> 0) || 1)
  const orbitR = new Float32Array(MAX_PRIMS)
  const phase = new Float32Array(MAX_PRIMS)
  const speedMul = new Float32Array(MAX_PRIMS)
  const tiltX = new Float32Array(MAX_PRIMS)
  const tiltZ = new Float32Array(MAX_PRIMS)
  const size = new Float32Array(MAX_PRIMS)
  const type = new Float32Array(MAX_PRIMS)
  for (let i = 0; i < MAX_PRIMS; i++) {
    orbitR[i] = 0.5 + r() * 1.1
    phase[i] = r() * Math.PI * 2
    speedMul[i] = 0.6 + r() * 0.9 // incommensurate-ish per-primitive rates avoid a clean sync loop
    tiltX[i] = (r() - 0.5) * 1.6
    tiltZ[i] = (r() - 0.5) * 1.6
    size[i] = 0.55 + r() * 0.35
    type[i] = Math.floor(r() * 3) // 0 sphere · 1 rounded box · 2 torus
  }
  return { orbitR, phase, speedMul, tiltX, tiltZ, size, type }
}

/** Key-light tint from a hue (0..360): warm amber through cool blue-white, as 0..1
 *  floats ready for the `u_lightColor` uniform. */
export function lightColorFromHue(hue: number): [number, number, number] {
  const { r, g, b } = hslToRgb(hue, 55, 68)
  return [r / 255, g / 255, b / 255]
}

export interface Camera {
  pos: [number, number, number]
  target: [number, number, number]
}

const CAM_RADIUS = 5.2
const CAM_HEIGHT_BASE = 1.1
const CAM_HEIGHT_AMP = 0.5

/** Deterministic camera orbit position from an accumulated phase (seconds ·
 *  cameraSpeed) — a pure function of phase alone, so changing Camera Speed only
 *  changes how fast phase accumulates and never jumps the shot. */
export function orbitCamera(phase: number): Camera {
  const ang = phase * 0.6
  const height = CAM_HEIGHT_BASE + Math.sin(phase * 0.31) * CAM_HEIGHT_AMP
  return {
    pos: [Math.cos(ang) * CAM_RADIUS, height, Math.sin(ang) * CAM_RADIUS],
    target: [0, 0.15, 0],
  }
}

/** Flat length-`MAX_STOPS*3` palette (0..1 floats), zero-padded, + active stop count. */
export function buildPalette(cfg: RaymarcherConfig): { stops: Float32Array; count: number } {
  const stops = new Float32Array(MAX_STOPS * 3)
  const n = Math.min(MAX_STOPS, cfg.palette.length)
  for (let i = 0; i < n; i++) {
    const [r, g, b] = hexToRgb(cfg.palette[i])
    stops[i * 3] = r
    stops[i * 3 + 1] = g
    stops[i * 3 + 2] = b
  }
  return { stops, count: Math.max(2, n) }
}

/** Cached sky colours (frame-invariant) — recomputed in setup + update alongside the palette. */
export function buildSky(cfg: RaymarcherConfig): { zenith: [number, number, number]; horizon: [number, number, number] } {
  return { zenith: hexToRgb(cfg.skyZenith), horizon: hexToRgb(cfg.skyHorizon) }
}

export type RaymarcherGL = {
  program: WebGLProgram
  vao: WebGLVertexArrayObject
  locs: Record<string, WebGLUniformLocation | null>
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error(`Raymarcher shader compile failed: ${log}`)
  }
  return sh
}

export function initGL(gl: WebGL2RenderingContext): RaymarcherGL {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC)
  // Delete-before-throw on every error path so no GL object leaks (mirrors plasma/aurora).
  let fs: WebGLShader
  try {
    fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC)
  } catch (e) {
    gl.deleteShader(vs)
    throw e
  }
  const program = gl.createProgram()!
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program)
    gl.deleteProgram(program)
    throw new Error(`Raymarcher program link failed: ${log}`)
  }
  const vao = gl.createVertexArray()!
  const name = (n: string) => gl.getUniformLocation(program, n)
  return {
    program,
    vao,
    locs: {
      res: name('u_res'), time: name('u_time'),
      camPos: name('u_camPos'), camTarget: name('u_camTarget'),
      blend: name('u_blend'), primCount: name('u_primCount'),
      primOrbitR: name('u_primOrbitR'), primPhase: name('u_primPhase'),
      primSpeed: name('u_primSpeed'), primTiltX: name('u_primTiltX'),
      primTiltZ: name('u_primTiltZ'), primSize: name('u_primSize'), primType: name('u_primType'),
      lightColor: name('u_lightColor'),
      stops: name('u_stops'), stopCount: name('u_stopCount'),
      skyHorizon: name('u_skyHorizon'), skyZenith: name('u_skyZenith'),
    },
  }
}

export function render(
  gl: WebGL2RenderingContext, s: RaymarcherGL, cfg: RaymarcherConfig,
  prims: PrimitiveParams, palette: { stops: Float32Array; count: number },
  sky: { zenith: [number, number, number]; horizon: [number, number, number] },
  camera: Camera, lightColor: [number, number, number], phase: number,
): void {
  // No gl.clear(): the fullscreen triangle covers every pixel opaquely each frame
  // (miss rays paint the sky gradient), mirroring plasma/aurora.
  gl.useProgram(s.program)
  gl.bindVertexArray(s.vao)
  gl.uniform2f(s.locs.res, gl.drawingBufferWidth, gl.drawingBufferHeight)
  gl.uniform1f(s.locs.time, phase)
  gl.uniform3f(s.locs.camPos, camera.pos[0], camera.pos[1], camera.pos[2])
  gl.uniform3f(s.locs.camTarget, camera.target[0], camera.target[1], camera.target[2])
  gl.uniform1f(s.locs.blend, cfg.blend)
  gl.uniform1i(s.locs.primCount, cfg.primitives)
  gl.uniform1fv(s.locs.primOrbitR, prims.orbitR)
  gl.uniform1fv(s.locs.primPhase, prims.phase)
  gl.uniform1fv(s.locs.primSpeed, prims.speedMul)
  gl.uniform1fv(s.locs.primTiltX, prims.tiltX)
  gl.uniform1fv(s.locs.primTiltZ, prims.tiltZ)
  gl.uniform1fv(s.locs.primSize, prims.size)
  gl.uniform1fv(s.locs.primType, prims.type)
  gl.uniform3f(s.locs.lightColor, lightColor[0], lightColor[1], lightColor[2])
  gl.uniform3fv(s.locs.stops, palette.stops)
  gl.uniform1i(s.locs.stopCount, palette.count)
  gl.uniform3f(s.locs.skyHorizon, sky.horizon[0], sky.horizon[1], sky.horizon[2])
  gl.uniform3f(s.locs.skyZenith, sky.zenith[0], sky.zenith[1], sky.zenith[2])
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

export function disposeGL(gl: WebGL2RenderingContext, s: RaymarcherGL): void {
  gl.deleteProgram(s.program)
  gl.deleteVertexArray(s.vao)
}
