import { mulberry32 } from '../../framework/rng'
import { nextBlob } from './inject'
import type { GpuFluidConfig } from './schema'

// ─── Stable Fluids (Jos Stam) on the GPU ────────────────────────────────────
// Every step is a fragment pass over sim-resolution RGBA32F ping-pong textures:
//   advect velocity → curl → vorticity confinement → divergence →
//   clear pressure → Jacobi pressure solve → subtract pressure gradient →
//   advect dye. Injection (colored blob + directional impulse) is splatted in
//   between frames to keep the field alive with no user input. The display pass
//   samples the dye field in normalized UV and fills the screen, so resize()
//   is a no-op (no reallocation / reseed) — same trick as Gray-Scott.

// Internal tuning constants (🎚️ Chrome-verify — these set the headline look).
const DT = 1.0            // solver timestep per sub-step (dimensionless grid units)
const VEL_DECAY = 0.99    // velocity dissipation per sub-step — bleeds energy so the
                         // field reaches a bounded, coherent-vortex equilibrium
                         // instead of a runaway high-speed field that smears dye to haze
const DYE_CEIL = 12.0     // clamp dye so a zero-fade field can't blow up to white
const FORCE = 3.0        // velocity impulse per blob, in texels/step — kept small so
                         // per-step dye advection is a few texels (coherent swirls),
                         // not a screen-crossing smear
const DYE_AMOUNT = 1.0    // peak dye deposited per injected blob
const SPLAT_RADIUS_VEL = 0.006  // gaussian falloff denom (uv²) for the impulse
const SPLAT_RADIUS_DYE = 0.005  // dye blob is a touch tighter than its impulse
const EXPOSURE = 1.0      // display tonemap exposure (higher = brighter/whiter)
// A 60Hz frame's worth of sub-steps = simSpeed; render() scales by real dt so the
// motion + fade rate are identical on 60Hz and 120Hz+ displays (was per-frame →
// twice as fast, and dye faded twice as hard, on a 120Hz panel).
const REF_FRAME_MS = 1000 / 60
const MAX_STEPS_PER_FRAME = 8 // cap catch-up after a stall so we never spiral

// Resolution presets → longest sim-grid side. Cost is O(texels × iters × speed).
const MAX_SIDE = { low: 256, medium: 384, high: 512 } as const

export function simDims(
  w: number, h: number, resolution: GpuFluidConfig['resolution'],
): { sw: number; sh: number } {
  const cap = MAX_SIDE[resolution]
  const longest = Math.max(w, h)
  const s = longest > cap ? cap / longest : 1
  return { sw: Math.max(1, Math.round(w * s)), sh: Math.max(1, Math.round(h * s)) }
}

const TRI_VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

// Semi-Lagrangian advection: trace the velocity backward, resample the source.
// Shared by the velocity self-advection and the dye advection (u_source swaps).
const ADVECT_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_velocity;
uniform sampler2D u_source;
uniform vec2  u_texel;
uniform float u_dt;
uniform float u_decay;
uniform float u_ceil;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy * u_texel;
  vec2 vel = texture(u_velocity, uv).xy;
  vec2 coord = uv - u_dt * vel * u_texel;
  vec4 src = texture(u_source, coord);
  fragColor = min(u_decay * src, vec4(u_ceil));
}`

// curl = ∂Vy/∂x − ∂Vx/∂y, stored in .x.
const CURL_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_velocity;
uniform vec2 u_texel;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy * u_texel;
  float L = texture(u_velocity, uv - vec2(u_texel.x, 0.0)).y;
  float R = texture(u_velocity, uv + vec2(u_texel.x, 0.0)).y;
  float B = texture(u_velocity, uv - vec2(0.0, u_texel.y)).x;
  float T = texture(u_velocity, uv + vec2(0.0, u_texel.y)).x;
  float curl = 0.5 * ((R - L) - (T - B));
  fragColor = vec4(curl, 0.0, 0.0, 1.0);
}`

// Vorticity confinement: push velocity toward the ∇|curl| direction, scaled by
// local curl and the user's curl strength — restores the fine swirls advection
// smears out (the filament look).
const VORTICITY_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_velocity;
uniform sampler2D u_curlTex;
uniform vec2  u_texel;
uniform float u_curl;
uniform float u_dt;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy * u_texel;
  float L = texture(u_curlTex, uv - vec2(u_texel.x, 0.0)).x;
  float R = texture(u_curlTex, uv + vec2(u_texel.x, 0.0)).x;
  float B = texture(u_curlTex, uv - vec2(0.0, u_texel.y)).x;
  float T = texture(u_curlTex, uv + vec2(0.0, u_texel.y)).x;
  float C = texture(u_curlTex, uv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 1e-4;
  // Internal scale: u_curl is a friendly 0..50 dial, but the raw confinement force
  // (unit dir × curl magnitude × strength) is huge and self-amplifies velocity →
  // curl → more force. Scale it down hard so curl=30 is a gentle filament nudge,
  // not a runaway (the velocity clamp in the gradient pass is the hard backstop).
  force *= u_curl * C * 0.02;
  force.y *= -1.0;
  vec2 vel = texture(u_velocity, uv).xy;
  fragColor = vec4(vel + force * u_dt, 0.0, 1.0);
}`

// divergence of the velocity field, stored in .x.
const DIVERGENCE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_velocity;
uniform vec2 u_texel;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy * u_texel;
  float L = texture(u_velocity, uv - vec2(u_texel.x, 0.0)).x;
  float R = texture(u_velocity, uv + vec2(u_texel.x, 0.0)).x;
  float B = texture(u_velocity, uv - vec2(0.0, u_texel.y)).y;
  float T = texture(u_velocity, uv + vec2(0.0, u_texel.y)).y;
  float div = 0.5 * ((R - L) + (T - B));
  fragColor = vec4(div, 0.0, 0.0, 1.0);
}`

// One Jacobi iteration of the pressure Poisson equation.
const PRESSURE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_pressure;
uniform sampler2D u_divergence;
uniform vec2 u_texel;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy * u_texel;
  float L = texture(u_pressure, uv - vec2(u_texel.x, 0.0)).x;
  float R = texture(u_pressure, uv + vec2(u_texel.x, 0.0)).x;
  float B = texture(u_pressure, uv - vec2(0.0, u_texel.y)).x;
  float T = texture(u_pressure, uv + vec2(0.0, u_texel.y)).x;
  float div = texture(u_divergence, uv).x;
  float p = (L + R + B + T - div) * 0.25;
  fragColor = vec4(p, 0.0, 0.0, 1.0);
}`

// Subtract the pressure gradient → makes velocity divergence-free.
const GRADIENT_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_pressure;
uniform sampler2D u_velocity;
uniform vec2 u_texel;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy * u_texel;
  float L = texture(u_pressure, uv - vec2(u_texel.x, 0.0)).x;
  float R = texture(u_pressure, uv + vec2(u_texel.x, 0.0)).x;
  float B = texture(u_pressure, uv - vec2(0.0, u_texel.y)).x;
  float T = texture(u_pressure, uv + vec2(0.0, u_texel.y)).x;
  vec2 vel = texture(u_velocity, uv).xy;
  vel -= vec2(R - L, T - B);
  // CFL-style speed clamp: cap per-step advection displacement to a few texels so
  // the field can never run away (the #1 cause of a smeared-to-haze / dead field).
  float sp = length(vel);
  if (sp > 4.0) vel *= 4.0 / sp;
  fragColor = vec4(vel, 0.0, 1.0);
}`

// Additive gaussian splat: read the target, add a blob at u_point. Used for both
// the velocity impulse (u_value.xy) and the dye deposit (u_value.rgb).
const SPLAT_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_target;
uniform vec2  u_texel;
uniform vec2  u_point;
uniform vec3  u_value;
uniform float u_radius;
uniform float u_aspect;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy * u_texel;
  vec2 p = uv - u_point;
  p.x *= u_aspect;
  float g = exp(-dot(p, p) / u_radius);
  vec3 base = texture(u_target, uv).xyz;
  fragColor = vec4(base + g * u_value, 1.0);
}`

// Display: dye → screen. Exposure tonemap keeps a zero-fade field from clipping
// hard, black stays black (max contrast), slight gamma lifts the mid smoke.
const DISPLAY_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_dye;
uniform vec2  u_texel;
uniform float u_exposure;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy * u_texel;
  vec3 c = texture(u_dye, uv).rgb;
  c = vec3(1.0) - exp(-c * u_exposure);
  c = pow(clamp(c, 0.0, 1.0), vec3(0.9));
  fragColor = vec4(c, 1.0);
}`

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src); gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh); gl.deleteShader(sh)
    throw new Error(`gpu-fluid shader compile failed: ${log}`)
  }
  return sh
}

function link(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc)
  let fs: WebGLShader
  try { fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc) }
  catch (e) { gl.deleteShader(vs); throw e }
  const prog = gl.createProgram()!
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog)
  gl.deleteShader(vs); gl.deleteShader(fs)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog); gl.deleteProgram(prog)
    throw new Error(`gpu-fluid program link failed: ${log}`)
  }
  return prog
}

function makeTex(
  gl: WebGL2RenderingContext, w: number, h: number, filter: number,
): WebGLTexture {
  const t = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, t)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return t
}

function fboFor(gl: WebGL2RenderingContext, tex: WebGLTexture): WebGLFramebuffer {
  const fb = gl.createFramebuffer()!
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  return fb
}

type Pair = { tex: [WebGLTexture, WebGLTexture]; fbo: [WebGLFramebuffer, WebGLFramebuffer]; cur: number }

function makePair(gl: WebGL2RenderingContext, w: number, h: number, filter: number): Pair {
  const t0 = makeTex(gl, w, h, filter), t1 = makeTex(gl, w, h, filter)
  return { tex: [t0, t1], fbo: [fboFor(gl, t0), fboFor(gl, t1)], cur: 0 }
}

type Locs = Record<string, WebGLUniformLocation | null>

export type FluidGL = {
  prog: {
    advect: WebGLProgram; curl: WebGLProgram; vorticity: WebGLProgram
    divergence: WebGLProgram; pressure: WebGLProgram; gradient: WebGLProgram
    splat: WebGLProgram; display: WebGLProgram
  }
  loc: {
    advect: Locs; curl: Locs; vorticity: Locs; divergence: Locs
    pressure: Locs; gradient: Locs; splat: Locs; display: Locs
  }
  vao: WebGLVertexArrayObject
  vel: Pair
  dye: Pair
  prs: Pair
  div: { tex: WebGLTexture; fbo: WebGLFramebuffer }
  crl: { tex: WebGLTexture; fbo: WebGLFramebuffer }
  simW: number
  simH: number
  texel: [number, number] // cached [1/simW, 1/simH] — constant for the resource's lifetime
                          // (a resolution edit re-setups the whole GL state, never resizes in place)
  stepAcc: number // fractional sub-steps-per-frame carry
  rng: () => number // injection stream (seeded)
}

export function initGL(gl: WebGL2RenderingContext, cfg: GpuFluidConfig, w: number, h: number): FluidGL {
  if (!gl.getExtension('EXT_color_buffer_float')) {
    throw new Error('gpu-fluid requires float render targets (EXT_color_buffer_float)')
  }
  // RGBA32F is LINEAR-filterable only with this extension; without it a LINEAR
  // float texture is texture-incomplete and every sample reads 0 (dead field).
  // Fall back to NEAREST (functional, blockier stretch) where it's absent.
  const filter = gl.getExtension('OES_texture_float_linear') ? gl.LINEAR : gl.NEAREST

  const prog = {
    advect: link(gl, TRI_VERT, ADVECT_FRAG),
    curl: link(gl, TRI_VERT, CURL_FRAG),
    vorticity: link(gl, TRI_VERT, VORTICITY_FRAG),
    divergence: link(gl, TRI_VERT, DIVERGENCE_FRAG),
    pressure: link(gl, TRI_VERT, PRESSURE_FRAG),
    gradient: link(gl, TRI_VERT, GRADIENT_FRAG),
    splat: link(gl, TRI_VERT, SPLAT_FRAG),
    display: link(gl, TRI_VERT, DISPLAY_FRAG),
  }
  const u = (p: WebGLProgram, names: string[]): Locs =>
    Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)]))
  const loc = {
    advect: u(prog.advect, ['u_velocity', 'u_source', 'u_texel', 'u_dt', 'u_decay', 'u_ceil']),
    curl: u(prog.curl, ['u_velocity', 'u_texel']),
    vorticity: u(prog.vorticity, ['u_velocity', 'u_curlTex', 'u_texel', 'u_curl', 'u_dt']),
    divergence: u(prog.divergence, ['u_velocity', 'u_texel']),
    pressure: u(prog.pressure, ['u_pressure', 'u_divergence', 'u_texel']),
    gradient: u(prog.gradient, ['u_pressure', 'u_velocity', 'u_texel']),
    splat: u(prog.splat, ['u_target', 'u_texel', 'u_point', 'u_value', 'u_radius', 'u_aspect']),
    display: u(prog.display, ['u_dye', 'u_texel', 'u_exposure']),
  }

  const { sw: simW, sh: simH } = simDims(w, h, cfg.resolution)
  const vel = makePair(gl, simW, simH, filter)
  const dye = makePair(gl, simW, simH, filter)
  const prs = makePair(gl, simW, simH, filter)
  const divTex = makeTex(gl, simW, simH, filter)
  const crlTex = makeTex(gl, simW, simH, filter)
  const div = { tex: divTex, fbo: fboFor(gl, divTex) }
  const crl = { tex: crlTex, fbo: fboFor(gl, crlTex) }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)

  const vao = gl.createVertexArray()!

  const res: FluidGL = {
    prog, loc, vao, vel, dye, prs, div, crl, simW, simH,
    texel: [1 / simW, 1 / simH], stepAcc: 0,
    rng: mulberry32(cfg.seed),
  }
  // Clear velocity/dye/pressure to 0 (float textures created with null data are
  // zero-initialized by the spec, but be explicit so the first frame is clean).
  for (const fbo of [vel.fbo[0], vel.fbo[1], dye.fbo[0], dye.fbo[1], prs.fbo[0], prs.fbo[1]]) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.viewport(0, 0, simW, simH)
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT)
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)

  // Seed a handful of blobs so the very first frame is already alive, not black.
  for (let i = 0; i < 7; i++) injectBlob(gl, res, cfg)
  return res
}

export function disposeGL(gl: WebGL2RenderingContext, res: FluidGL): void {
  for (const p of Object.values(res.prog)) gl.deleteProgram(p)
  gl.deleteVertexArray(res.vao)
  for (const pair of [res.vel, res.dye, res.prs]) {
    for (const t of pair.tex) gl.deleteTexture(t)
    for (const f of pair.fbo) gl.deleteFramebuffer(f)
  }
  for (const s of [res.div, res.crl]) { gl.deleteTexture(s.tex); gl.deleteFramebuffer(s.fbo) }
}

/** Bind res.vao and draw the fullscreen triangle into the currently-bound FBO. */
function draw(gl: WebGL2RenderingContext, res: FluidGL) {
  gl.bindVertexArray(res.vao)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

function bindTex(gl: WebGL2RenderingContext, unit: number, tex: WebGLTexture, loc: WebGLUniformLocation | null) {
  gl.activeTexture(gl.TEXTURE0 + unit)
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.uniform1i(loc, unit)
}

function target(gl: WebGL2RenderingContext, res: FluidGL, fbo: WebGLFramebuffer) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.viewport(0, 0, res.simW, res.simH)
}

/** Additive splat into a ping-pong pair (reads cur, writes cur^1, flips). */
function splat(
  gl: WebGL2RenderingContext, res: FluidGL, pair: Pair,
  nx: number, ny: number, vx: number, vy: number, vz: number, radius: number,
) {
  const src = pair.cur, dst = src ^ 1
  target(gl, res, pair.fbo[dst])
  gl.useProgram(res.prog.splat)
  bindTex(gl, 0, pair.tex[src], res.loc.splat.u_target)
  gl.uniform2f(res.loc.splat.u_texel, 1 / res.simW, 1 / res.simH)
  gl.uniform2f(res.loc.splat.u_point, nx, ny)
  gl.uniform3f(res.loc.splat.u_value, vx, vy, vz)
  gl.uniform1f(res.loc.splat.u_radius, radius)
  gl.uniform1f(res.loc.splat.u_aspect, res.simW / res.simH)
  draw(gl, res)
  pair.cur = dst
}

/** Spill one seeded blob: a directional velocity impulse + a colored dye deposit. */
export function injectBlob(gl: WebGL2RenderingContext, res: FluidGL, cfg: GpuFluidConfig) {
  const b = nextBlob(res.rng, cfg.stops)
  gl.disable(gl.BLEND)
  splat(gl, res, res.vel, b.nx, b.ny, Math.cos(b.angle) * FORCE, Math.sin(b.angle) * FORCE, 0, SPLAT_RADIUS_VEL)
  splat(gl, res, res.dye, b.nx, b.ny, b.r * DYE_AMOUNT, b.g * DYE_AMOUNT, b.b * DYE_AMOUNT, SPLAT_RADIUS_DYE)
}

/** One full solver sub-step: advect → curl → vorticity → project → advect dye. */
function step(gl: WebGL2RenderingContext, res: FluidGL, cfg: GpuFluidConfig) {
  const texel = res.texel
  gl.disable(gl.BLEND)

  // 1. Advect velocity through itself.
  {
    const src = res.vel.cur, dst = src ^ 1
    target(gl, res, res.vel.fbo[dst])
    gl.useProgram(res.prog.advect)
    bindTex(gl, 0, res.vel.tex[src], res.loc.advect.u_velocity)
    bindTex(gl, 1, res.vel.tex[src], res.loc.advect.u_source)
    gl.uniform2f(res.loc.advect.u_texel, texel[0], texel[1])
    gl.uniform1f(res.loc.advect.u_dt, DT)
    gl.uniform1f(res.loc.advect.u_decay, VEL_DECAY)
    gl.uniform1f(res.loc.advect.u_ceil, 1e4)
    draw(gl, res)
    res.vel.cur = dst
  }

  // 2. Curl of the velocity field.
  target(gl, res, res.crl.fbo)
  gl.useProgram(res.prog.curl)
  bindTex(gl, 0, res.vel.tex[res.vel.cur], res.loc.curl.u_velocity)
  gl.uniform2f(res.loc.curl.u_texel, texel[0], texel[1])
  draw(gl, res)

  // 3. Vorticity confinement (the filament knob).
  {
    const src = res.vel.cur, dst = src ^ 1
    target(gl, res, res.vel.fbo[dst])
    gl.useProgram(res.prog.vorticity)
    bindTex(gl, 0, res.vel.tex[src], res.loc.vorticity.u_velocity)
    bindTex(gl, 1, res.crl.tex, res.loc.vorticity.u_curlTex)
    gl.uniform2f(res.loc.vorticity.u_texel, texel[0], texel[1])
    gl.uniform1f(res.loc.vorticity.u_curl, cfg.curl)
    gl.uniform1f(res.loc.vorticity.u_dt, DT)
    draw(gl, res)
    res.vel.cur = dst
  }

  // 4. Divergence.
  target(gl, res, res.div.fbo)
  gl.useProgram(res.prog.divergence)
  bindTex(gl, 0, res.vel.tex[res.vel.cur], res.loc.divergence.u_velocity)
  gl.uniform2f(res.loc.divergence.u_texel, texel[0], texel[1])
  draw(gl, res)

  // 5. Clear pressure to 0, then Jacobi-solve.
  target(gl, res, res.prs.fbo[res.prs.cur])
  gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT)
  gl.useProgram(res.prog.pressure)
  gl.uniform2f(res.loc.pressure.u_texel, texel[0], texel[1])
  for (let i = 0; i < cfg.pressureIters; i++) {
    const src = res.prs.cur, dst = src ^ 1
    target(gl, res, res.prs.fbo[dst])
    bindTex(gl, 0, res.prs.tex[src], res.loc.pressure.u_pressure)
    bindTex(gl, 1, res.div.tex, res.loc.pressure.u_divergence)
    draw(gl, res)
    res.prs.cur = dst
  }

  // 6. Subtract pressure gradient → divergence-free velocity.
  {
    const src = res.vel.cur, dst = src ^ 1
    target(gl, res, res.vel.fbo[dst])
    gl.useProgram(res.prog.gradient)
    bindTex(gl, 0, res.prs.tex[res.prs.cur], res.loc.gradient.u_pressure)
    bindTex(gl, 1, res.vel.tex[src], res.loc.gradient.u_velocity)
    gl.uniform2f(res.loc.gradient.u_texel, texel[0], texel[1])
    draw(gl, res)
    res.vel.cur = dst
  }

  // 7. Advect dye through the (now divergence-free) velocity, with fade.
  {
    const src = res.dye.cur, dst = src ^ 1
    target(gl, res, res.dye.fbo[dst])
    gl.useProgram(res.prog.advect)
    bindTex(gl, 0, res.vel.tex[res.vel.cur], res.loc.advect.u_velocity)
    bindTex(gl, 1, res.dye.tex[src], res.loc.advect.u_source)
    gl.uniform2f(res.loc.advect.u_texel, texel[0], texel[1])
    gl.uniform1f(res.loc.advect.u_dt, DT)
    gl.uniform1f(res.loc.advect.u_decay, 1 - cfg.dissipation)
    gl.uniform1f(res.loc.advect.u_ceil, DYE_CEIL)
    draw(gl, res)
    res.dye.cur = dst
  }
}

/** Advance the solver, then display the dye. `dt` (ms) scales the sub-step count so
 *  simSpeed is "sub-steps per 60Hz frame" — identical motion + fade on any refresh
 *  rate. Capped so a stall can't dump a huge catch-up burst in one frame. */
export function render(gl: WebGL2RenderingContext, res: FluidGL, cfg: GpuFluidConfig, dt: number) {
  const dtScale = dt > 0 ? Math.min(dt / REF_FRAME_MS, MAX_STEPS_PER_FRAME) : 1
  res.stepAcc += cfg.simSpeed * dtScale
  const steps = Math.min(Math.floor(res.stepAcc), MAX_STEPS_PER_FRAME)
  res.stepAcc -= steps
  for (let i = 0; i < steps; i++) step(gl, res, cfg)

  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
  gl.disable(gl.BLEND)
  gl.useProgram(res.prog.display)
  bindTex(gl, 0, res.dye.tex[res.dye.cur], res.loc.display.u_dye)
  gl.uniform2f(res.loc.display.u_texel, 1 / gl.drawingBufferWidth, 1 / gl.drawingBufferHeight)
  gl.uniform1f(res.loc.display.u_exposure, EXPOSURE)
  draw(gl, res)
}
