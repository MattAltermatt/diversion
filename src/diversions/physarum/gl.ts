import { texDimFor, initAgents, buildLUT } from './agents'
import type { PhysarumConfig } from './schema'

// Fullscreen-triangle vertex shader (gl_VertexID; no attribute buffers).
const TRI_VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

// MOVE: one fragment per agent; sense 3 taps, steer, advance, wrap on a torus.
const MOVE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_agents;   // RGBA32F (x,y,heading,_)
uniform sampler2D u_trail;    // R16F density, sampled in [0,1] UV
uniform vec2  u_trailSize;
uniform float u_sensorAngle;  // radians
uniform float u_sensorDist;   // texels
uniform float u_turnSpeed;    // radians/step
uniform float u_step;         // texels/step
uniform float u_frame;        // per-step counter, seeds the stochastic turn
uniform float u_respawn;      // per-step respawn-progress increment (1/lifetime-in-steps)
out vec4 fragColor;
float sense(vec2 pos, float ang) {
  vec2 dir = vec2(cos(ang), sin(ang));
  vec2 uv = pos + dir * (u_sensorDist / u_trailSize);
  return texture(u_trail, uv).r;
}
// Cheap per-agent, per-step hash → [0,1). Without this the agents march in
// lockstep across unexplored regions and deposit parallel "comb" artifacts;
// the random turn when the trail ahead is ambiguous (Jones 2010) desynchronises
// them into organic, slime-like wandering.
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
void main() {
  ivec2 idx = ivec2(gl_FragCoord.xy);
  vec4 a = texelFetch(u_agents, idx, 0);
  vec2 pos = a.xy; float heading = a.z;
  float c = sense(pos, heading);
  float l = sense(pos, heading + u_sensorAngle);
  float r = sense(pos, heading - u_sensorAngle);
  float rnd = hash(gl_FragCoord.xy + vec2(u_frame, u_frame * 1.7));
  if (c > l && c > r) {                            // strongest ahead → continue
  } else if (c < l && c < r) {                     // trapped → random turn
    heading += (rnd < 0.5 ? -1.0 : 1.0) * u_turnSpeed;
  } else if (l > r) heading += u_turnSpeed;        // turn toward left sensor
  else if (r > l) heading -= u_turnSpeed;          // turn toward right sensor
  vec2 dir = vec2(cos(heading), sin(heading));
  pos += dir * (u_step / u_trailSize);
  pos = fract(pos + 1.0);                          // wrap torus
  // Respawn lifecycle (Sage Jenson): advance a per-agent progress phase and,
  // on wrap, teleport to a fresh random position. Staggered initial phases mean
  // a steady trickle respawns each step — this keeps exploring agents seeding new
  // structure so the network never settles into a static, over-clumped state.
  float prog = fract(a.w + u_respawn);
  if (prog < u_respawn) {
    pos = vec2(hash(gl_FragCoord.xy + vec2(u_frame, 31.0)),
               hash(gl_FragCoord.xy + vec2(u_frame, 53.0)));
  }
  // Wrap heading to [0, 2π): it only ever feeds cos/sin (periodic), but an
  // unbounded accumulator coarsens float32 steering resolution over multi-day
  // unattended runs — same reason u_frame is wrapped.
  heading = mod(heading, 6.2831853);
  fragColor = vec4(pos, heading, prog);
}`

// DEPOSIT: one point per agent, positioned by texelFetch on the agent texture.
const DEPOSIT_VERT = `#version 300 es
uniform sampler2D u_agents;
uniform float u_agentDim;
void main() {
  int id = gl_VertexID;
  int dim = int(u_agentDim);
  ivec2 idx = ivec2(id % dim, id / dim);
  vec2 pos = texelFetch(u_agents, idx, 0).xy;    // [0,1)
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = 1.0;
}`

// DEPOSIT: flat additive dab (blend ONE,ONE set by caller).
const DEPOSIT_FRAG = `#version 300 es
precision highp float;
uniform float u_deposit;
out vec4 fragColor;
void main() { fragColor = vec4(u_deposit, 0.0, 0.0, 1.0); }`

// DIFFUSE+DECAY: 3×3 box blur mixed by u_diffuse, then × (1 - u_decay).
const DIFFUSE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_trail;
uniform vec2  u_texel;   // 1/trailSize
uniform float u_diffuse;
uniform float u_decay;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy * u_texel;
  float sum = 0.0;
  for (int dy = -1; dy <= 1; dy++)
    for (int dx = -1; dx <= 1; dx++)
      sum += texture(u_trail, uv + vec2(float(dx), float(dy)) * u_texel).r;
  float blurred = sum / 9.0;
  float center = texture(u_trail, uv).r;
  float v = mix(center, blurred, u_diffuse) * (1.0 - u_decay);
  fragColor = vec4(v, 0.0, 0.0, 1.0);
}`

// DISPLAY: tonemap density, index the gradient LUT, opaque to screen.
const DISPLAY_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_trail;
uniform sampler2D u_lut;
uniform vec2  u_texel;
uniform float u_exposure;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy * u_texel;
  float d = texture(u_trail, uv).r;
  float t = 1.0 - exp(-u_exposure * d);          // log-ish compression
  vec3 col = texture(u_lut, vec2(clamp(t, 0.0, 1.0), 0.5)).rgb;
  fragColor = vec4(col, 1.0);
}`

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src); gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh); gl.deleteShader(sh)
    throw new Error(`Physarum shader compile failed: ${log}`)
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
    throw new Error(`Physarum program link failed: ${log}`)
  }
  return prog
}

function makeTex(
  gl: WebGL2RenderingContext, w: number, h: number,
  internal: number, format: number, type: number,
  filter: number, data: ArrayBufferView | null,
): WebGLTexture {
  const t = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, t)
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return t
}

// Cap the trail field's longest side to bound per-frame cost on very large
// (4K/5K/retina-6K) canvases — the 3×3 blur is per-texel, so an uncapped 4K
// field would cost ~4× a 1080p one. The fine filament detail lives at native
// texel scale, so the cap is set high enough that common displays (1080p, 1440p,
// 1600p, 2560-wide) render UNCAPPED at full detail; only oversized canvases are
// downscaled. The display pass samples normalized UV, so a capped field stretches
// to fill the screen with LINEAR smoothing.
const TRAIL_MAX_SIDE = 2560

export function trailDims(w: number, h: number): { tw: number; th: number } {
  const longest = Math.max(w, h)
  const s = longest > TRAIL_MAX_SIDE ? TRAIL_MAX_SIDE / longest : 1
  return { tw: Math.max(1, Math.round(w * s)), th: Math.max(1, Math.round(h * s)) }
}

function fboFor(gl: WebGL2RenderingContext, tex: WebGLTexture): WebGLFramebuffer {
  const fb = gl.createFramebuffer()!
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  return fb
}

export type PhysarumGL = {
  moveProg: WebGLProgram
  depositProg: WebGLProgram
  diffuseProg: WebGLProgram
  displayProg: WebGLProgram
  vao: WebGLVertexArrayObject            // empty VAO for fullscreen-triangle passes
  agentTex: [WebGLTexture, WebGLTexture]  // ping-pong
  agentFbo: [WebGLFramebuffer, WebGLFramebuffer]
  trailTex: [WebGLTexture, WebGLTexture]
  trailFbo: [WebGLFramebuffer, WebGLFramebuffer]
  lutTex: WebGLTexture
  agentDim: number
  trailW: number
  trailH: number
  cur: { agent: number; trail: number }  // which ping-pong index is current
  frame: number                          // monotonic step counter (stochastic-turn seed)
  stepAcc: number                        // fractional steps-per-frame accumulator (speed < 1)
  locs: Record<string, Record<string, WebGLUniformLocation | null>>
}

export function initGL(
  gl: WebGL2RenderingContext, cfg: PhysarumConfig, w: number, h: number,
): PhysarumGL {
  if (!gl.getExtension('EXT_color_buffer_float')) {
    throw new Error('Physarum requires float render targets (EXT_color_buffer_float)')
  }
  const moveProg = link(gl, TRI_VERT, MOVE_FRAG)
  const depositProg = link(gl, DEPOSIT_VERT, DEPOSIT_FRAG)
  const diffuseProg = link(gl, TRI_VERT, DIFFUSE_FRAG)
  const displayProg = link(gl, TRI_VERT, DISPLAY_FRAG)
  const vao = gl.createVertexArray()!

  const agentDim = texDimFor(cfg.agents)
  const seedData = initAgents(cfg.seed, cfg.agents)
  const agentTex: [WebGLTexture, WebGLTexture] = [
    makeTex(gl, agentDim, agentDim, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST, seedData),
    makeTex(gl, agentDim, agentDim, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST, null),
  ]
  const agentFbo: [WebGLFramebuffer, WebGLFramebuffer] = [fboFor(gl, agentTex[0]), fboFor(gl, agentTex[1])]

  const { tw: trailW, th: trailH } = trailDims(w, h)
  const trailTex: [WebGLTexture, WebGLTexture] = [
    makeTex(gl, trailW, trailH, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.LINEAR, null),
    makeTex(gl, trailW, trailH, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.LINEAR, null),
  ]
  const trailFbo: [WebGLFramebuffer, WebGLFramebuffer] = [fboFor(gl, trailTex[0]), fboFor(gl, trailTex[1])]
  for (const fb of trailFbo) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT)
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)

  const lutData = buildLUT(cfg.stops)
  const lutTex = makeTex(gl, 256, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, lutData)

  const u = (p: WebGLProgram, names: string[]) =>
    Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)]))
  const locs = {
    move: u(moveProg, ['u_agents', 'u_trail', 'u_trailSize', 'u_sensorAngle', 'u_sensorDist', 'u_turnSpeed', 'u_step', 'u_frame', 'u_respawn']),
    deposit: u(depositProg, ['u_agents', 'u_agentDim', 'u_deposit']),
    diffuse: u(diffuseProg, ['u_trail', 'u_texel', 'u_diffuse', 'u_decay']),
    display: u(displayProg, ['u_trail', 'u_lut', 'u_texel', 'u_exposure']),
  }
  return {
    moveProg, depositProg, diffuseProg, displayProg, vao,
    agentTex, agentFbo, trailTex, trailFbo, lutTex,
    agentDim, trailW, trailH, cur: { agent: 0, trail: 0 }, frame: 0, stepAcc: 0, locs,
  }
}

export function uploadLUT(gl: WebGL2RenderingContext, res: PhysarumGL, stops: string[]): void {
  gl.bindTexture(gl.TEXTURE_2D, res.lutTex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, buildLUT(stops))
}

export function disposeGL(gl: WebGL2RenderingContext, res: PhysarumGL): void {
  for (const p of [res.moveProg, res.depositProg, res.diffuseProg, res.displayProg]) gl.deleteProgram(p)
  gl.deleteVertexArray(res.vao)
  for (const t of [...res.agentTex, ...res.trailTex, res.lutTex]) gl.deleteTexture(t)
  for (const f of [...res.agentFbo, ...res.trailFbo]) gl.deleteFramebuffer(f)
}

const RAD = Math.PI / 180

function fullscreen(gl: WebGL2RenderingContext, res: PhysarumGL) {
  gl.bindVertexArray(res.vao)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

/** One simulation step: move → deposit → diffuse+decay, advancing res.cur. */
export function step(gl: WebGL2RenderingContext, res: PhysarumGL, cfg: PhysarumConfig): void {
  const src = res.cur.agent, dst = src ^ 1
  // 1. MOVE: render over agent texture (dst), reading agents(src) + current trail.
  gl.disable(gl.BLEND)
  gl.bindFramebuffer(gl.FRAMEBUFFER, res.agentFbo[dst])
  gl.viewport(0, 0, res.agentDim, res.agentDim)
  gl.useProgram(res.moveProg)
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, res.agentTex[src])
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, res.trailTex[res.cur.trail])
  gl.uniform1i(res.locs.move.u_agents, 0)
  gl.uniform1i(res.locs.move.u_trail, 1)
  gl.uniform2f(res.locs.move.u_trailSize, res.trailW, res.trailH)
  gl.uniform1f(res.locs.move.u_sensorAngle, cfg.sensorAngle * RAD)
  gl.uniform1f(res.locs.move.u_sensorDist, cfg.sensorDist)
  gl.uniform1f(res.locs.move.u_turnSpeed, cfg.turnSpeed * RAD)
  gl.uniform1f(res.locs.move.u_step, 1.0)
  // Wrap the frame seed well within float32's exact-integer range so the hash
  // stays well-distributed over multi-hour unattended runs.
  res.frame = (res.frame + 1) % 100000
  gl.uniform1f(res.locs.move.u_frame, res.frame)
  // Respawn ~every 1/u_respawn steps (Sage Jenson's reinitSegment); keeps a
  // steady trickle of fresh explorers so the network stays alive.
  gl.uniform1f(res.locs.move.u_respawn, 0.002)
  fullscreen(gl, res)
  res.cur.agent = dst

  // 2. DEPOSIT: additive points into the current trail.
  gl.bindFramebuffer(gl.FRAMEBUFFER, res.trailFbo[res.cur.trail])
  gl.viewport(0, 0, res.trailW, res.trailH)
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE)
  gl.useProgram(res.depositProg)
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, res.agentTex[res.cur.agent])
  gl.uniform1i(res.locs.deposit.u_agents, 0)
  gl.uniform1f(res.locs.deposit.u_agentDim, res.agentDim)
  gl.uniform1f(res.locs.deposit.u_deposit, cfg.depositAmount)
  gl.bindVertexArray(res.vao)
  // Draw exactly cfg.agents points, not the full agentDim² texel capacity: the
  // deposit vertex shader maps gl_VertexID 0..N-1 onto the first N agent texels,
  // so this makes the Agents slider drive the real agent count continuously
  // (capacity is the next pow²≥count, so cfg.agents ≤ agentDim² always). Surplus
  // texels still move in the MOVE pass but, never deposited, have no field effect.
  gl.drawArrays(gl.POINTS, 0, cfg.agents)
  gl.disable(gl.BLEND)

  // 3. DIFFUSE+DECAY: blur the trail into the other buffer.
  const ts = res.cur.trail, td = ts ^ 1
  gl.bindFramebuffer(gl.FRAMEBUFFER, res.trailFbo[td])
  gl.useProgram(res.diffuseProg)
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, res.trailTex[ts])
  gl.uniform1i(res.locs.diffuse.u_trail, 0)
  gl.uniform2f(res.locs.diffuse.u_texel, 1 / res.trailW, 1 / res.trailH)
  gl.uniform1f(res.locs.diffuse.u_diffuse, cfg.diffuse)
  gl.uniform1f(res.locs.diffuse.u_decay, cfg.decay)
  fullscreen(gl, res)
  res.cur.trail = td
}

/** Advance the sim by `rate` steps-per-frame, then run the display pass. The
 *  caller has set the viewport. `rate` may be fractional: it accumulates so a
 *  rate below 1 runs a step only every few frames (calm, slow evolution) while
 *  a rate above 1 runs several steps per frame. The remainder carries forward,
 *  so the long-run step rate is exact regardless of frame timing. */
export function render(
  gl: WebGL2RenderingContext, res: PhysarumGL, cfg: PhysarumConfig, rate: number,
): void {
  res.stepAcc += rate
  const steps = Math.floor(res.stepAcc)
  res.stepAcc -= steps
  for (let i = 0; i < steps; i++) step(gl, res, cfg)
  // DISPLAY to the default framebuffer. The sim steps left the viewport at the
  // agent/trail size, so restore it to the full screen before the screen blit.
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
  gl.useProgram(res.displayProg)
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, res.trailTex[res.cur.trail])
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, res.lutTex)
  gl.uniform1i(res.locs.display.u_trail, 0)
  gl.uniform1i(res.locs.display.u_lut, 1)
  // Map gl_FragCoord over the SCREEN viewport (not the trail texel size, which
  // may be capped smaller) so UV spans [0,1] across the full canvas and the
  // trail field stretches to fill it.
  gl.uniform2f(res.locs.display.u_texel, 1 / gl.drawingBufferWidth, 1 / gl.drawingBufferHeight)
  gl.uniform1f(res.locs.display.u_exposure, 1.5)
  fullscreen(gl, res)
}
