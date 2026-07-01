import { hexToRgb } from '../../framework/color'
import type { LogCirclesConfig } from './schema'

/** Max palette slots, matched by the `u_tints[8]` uniform in the shader. */
export const MAX_TINTS = 8

/** Wrap modulus for the accumulated phase clocks. Keeps the float32 uniforms
 *  precise over multi-hour runs; the wrap causes one imperceptible jump roughly
 *  every few hours (same trade-off as Plasma's u_time). */
const PHASE_WRAP = 1e4

/** Advance a phase clock by speed (units/sec) over dt milliseconds, wrapped. */
export function advancePhase(phase: number, speed: number, dtMs: number): number {
  return (phase + speed * (dtMs / 1000)) % PHASE_WRAP
}

/** Flatten up to MAX_TINTS hex8 colours into a length-(MAX_TINTS*3) Float32Array
 *  of 0..1 RGB (alpha dropped), zero-padding unused slots — the form a
 *  `uniform vec3 u_tints[8]` expects via gl.uniform3fv. */
export function tintsToVec3(tints: string[]): Float32Array {
  const out = new Float32Array(MAX_TINTS * 3)
  const n = Math.min(tints.length, MAX_TINTS)
  for (let i = 0; i < n; i++) {
    const [r, g, b] = hexToRgb(tints[i])
    out[i * 3] = r
    out[i * 3 + 1] = g
    out[i * 3 + 2] = b
  }
  return out
}

// Fullscreen triangle from gl_VertexID — no attribute buffers (matches Plasma).
export const VERT_SRC = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

export const FRAG_SRC = `#version 300 es
precision highp float;
uniform vec2  u_res;
uniform float u_zoom;        // zoom phase (drives zoom + colour flip)
uniform float u_rot;         // rotation phase (decoupled)
uniform float u_growth;      // ring size ratio
uniform float u_circleSize;  // disc radius as fraction of ring width
uniform int   u_circles;     // circles per ring
uniform int   u_layers;      // 1..2 interleaved copies
uniform float u_scanlines;   // 0..0.3
uniform int   u_dots;        // 0/1 center dot
uniform int   u_mode;        // 0 mono, 1 color
uniform vec3  u_bg;
uniform vec3  u_fg;
uniform vec3  u_tints[8];
uniform int   u_tintCount;
out vec4 fragColor;

#define PI 3.141592654
#define TAU (2.0*PI)
mat2 rot(float a){ return mat2(cos(a), sin(a), -sin(a), cos(a)); }

float expBy(){ return log2(u_growth); }
float fwd(float l){ return exp2(expBy()*l); }
float rev(float l){ return log2(l)/expBy(); }

float modPolar(inout vec2 p, float reps){
  float angle = TAU/reps;
  float a = atan(p.y, p.x) + angle*0.5;
  float r = length(p);
  float c = floor(a/angle);
  a = mod(a, angle) - angle*0.5;
  p = vec2(cos(a), sin(a))*r;
  if (abs(c) >= reps*0.5) c = abs(c);
  return c;
}

vec3 tintAt(float idx){
  int i = int(mod(idx, float(max(u_tintCount, 1))));
  return u_tints[i];
}

void main(){
  vec2 q = gl_FragCoord.xy / u_res;
  vec2 p = -1.0 + 2.0*q;
  p.x *= u_res.x / u_res.y;

  float aa = 4.0 / u_res.y;
  vec3 col = u_bg + vec3(u_scanlines * smoothstep(-sqrt(0.5), sqrt(0.5), sin(0.5*TAU*p.y/aa)));

  float reps = float(u_circles);
  mat2 rot0 = rot(-u_rot);
  for (int i = 0; i < 2; ++i){
    if (i >= u_layers) break;
    float fi = float(i);
    float ltm = u_zoom + 0.5*fi;                 // half zoom-step offset per layer
    mat2 rot1 = rot(fi * PI / reps);             // half-cell angular offset per layer
    float mtm = fract(ltm);
    float ntm = floor(ltm);
    float zz = fwd(mtm);

    vec2 p0 = p; p0 *= rot0; p0 *= rot1; p0 /= zz;
    float l0 = length(p0);
    float n0 = ceil(rev(l0));
    float r0 = fwd(n0);
    float r1 = fwd(n0 - 1.0);
    float r = (r0 + r1) * 0.5;
    float w = r0 - r1;
    n0 -= ntm;

    vec2 p1 = p0;
    float n1 = modPolar(p1, reps);
    p1.x -= r;

    float a = fract(0.5*ltm + n1/reps);
    float d1 = length(p1) - u_circleSize*w;
    float dotScale = (u_dots == 1) ? smoothstep(0.0, 0.45, mod(a, 0.5)) : 1.0;
    float d2 = length(p1) - u_circleSize*w*dotScale;
    d1 *= zz; d2 *= zz;

    // Duotone pair. Mono: fg vs background (faithful op-art). Color: TWO palette
    // tints, so every circle body stays a visible colour — never the background,
    // which would make the flipped half vanish into the ground.
    vec3 c0 = (u_mode == 1) ? tintAt(n0 + n1)        : u_fg;
    vec3 c1 = (u_mode == 1) ? tintAt(n0 + n1 + 1.0)  : u_bg;
    vec3 inner = (a < 0.5) ? c0 : c1;
    vec3 outer = (a < 0.5) ? c1 : c0;
    vec3 ccol = mix(outer, inner, smoothstep(0.0, -aa, d2));
    col = mix(col, ccol, smoothstep(0.0, -aa, d1));
  }
  fragColor = vec4(col, 1.0);
}`

export type LogCirclesGL = {
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
    throw new Error(`LogCircles shader compile failed: ${log}`)
  }
  return sh
}

export function initGL(gl: WebGL2RenderingContext): LogCirclesGL {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC)
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
    throw new Error(`LogCircles program link failed: ${log}`)
  }
  const vao = gl.createVertexArray()!
  const name = (n: string) => gl.getUniformLocation(program, n)
  return {
    program, vao,
    locs: {
      res: name('u_res'), zoom: name('u_zoom'), rot: name('u_rot'),
      growth: name('u_growth'), circleSize: name('u_circleSize'),
      circles: name('u_circles'), layers: name('u_layers'),
      scanlines: name('u_scanlines'), dots: name('u_dots'), mode: name('u_mode'),
      bg: name('u_bg'), fg: name('u_fg'), tints: name('u_tints'), tintCount: name('u_tintCount'),
    },
  }
}

export function render(
  gl: WebGL2RenderingContext, s: LogCirclesGL, cfg: LogCirclesConfig,
  zoomPhase: number, rotPhase: number,
): void {
  // No gl.clear(): the fullscreen triangle writes every pixel with alpha 1.0.
  gl.useProgram(s.program)
  gl.bindVertexArray(s.vao)
  gl.uniform2f(s.locs.res, gl.drawingBufferWidth, gl.drawingBufferHeight)
  gl.uniform1f(s.locs.zoom, zoomPhase)
  gl.uniform1f(s.locs.rot, rotPhase)
  gl.uniform1f(s.locs.growth, cfg.ringGrowth)
  gl.uniform1f(s.locs.circleSize, cfg.circleSize)
  gl.uniform1i(s.locs.circles, cfg.circlesPerRing)
  gl.uniform1i(s.locs.layers, cfg.layers)
  gl.uniform1f(s.locs.scanlines, cfg.color.scanlines)
  gl.uniform1i(s.locs.dots, cfg.color.centerDots ? 1 : 0)
  gl.uniform1i(s.locs.mode, cfg.color.mode === 'color' ? 1 : 0)
  const bg = hexToRgb(cfg.color.background)
  const fg = hexToRgb(cfg.color.fg)
  gl.uniform3f(s.locs.bg, bg[0], bg[1], bg[2])
  gl.uniform3f(s.locs.fg, fg[0], fg[1], fg[2])
  gl.uniform3fv(s.locs.tints, tintsToVec3(cfg.color.tints))
  gl.uniform1i(s.locs.tintCount, Math.min(cfg.color.tints.length, MAX_TINTS))
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

export function disposeGL(gl: WebGL2RenderingContext, s: LogCirclesGL): void {
  gl.deleteProgram(s.program)
  gl.deleteVertexArray(s.vao)
}
