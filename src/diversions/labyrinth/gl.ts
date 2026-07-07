import { texDimFor, initAgentsAtStart, buildLUT } from './agents'
import type { LabyrinthConfig } from './schema'

// Fullscreen-triangle vertex shader (gl_VertexID; no attribute buffers).
const TRI_VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

// MOVE: one fragment per agent; sense 3 taps, steer, advance — but reject any step
// into a wall (no torus wrap). Respawn returns agents to the START cell.
const MOVE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_agents;   // RGBA32F (x, y, heading, birthTime)
uniform sampler2D u_trail;    // R16F density, sampled in [0,1] UV
uniform sampler2D u_walls;    // R8 mask, 1.0 = wall
uniform sampler2D u_attract;  // goal gradient — 1.0 at the exit, ~0 at the start
uniform vec2  u_trailSize;
uniform vec2  u_startCell;    // start-cell fractional size (1/cols, 1/rows)
uniform float u_sensorAngle;
uniform float u_sensorDist;
uniform float u_turnSpeed;
uniform float u_step;
uniform float u_frame;
uniform float u_scoutFrac;    // fraction of agents that pioneer (negative chemotaxis)
uniform float u_gradWeight;   // gentle pull along the goal gradient (followers only)
uniform float u_time;         // emission clock 0..1 (agents are born as it rises)
uniform float u_agentDim;     // agent-texture side (to sample random sibling agents)
uniform float u_respawn;      // per-step chance a live agent recycles to the frontier
out vec4 fragColor;
// Sense trail + (optionally) the goal gradient. aw = 0 for scouts (pure exploration),
// = u_gradWeight for followers (drawn gently toward the exit).
float sense(vec2 pos, float ang, float aw) {
  vec2 dir = vec2(cos(ang), sin(ang));
  vec2 uv = pos + dir * (u_sensorDist / u_trailSize);
  return texture(u_trail, uv).r + aw * texture(u_attract, uv).r;
}
bool isWall(vec2 uv) { return texture(u_walls, uv).r > 0.5; }
// Cheap per-agent, per-step hash → [0,1). Desynchronises agents so they wander
// organically rather than marching in lockstep (Jones 2010 random turn).
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
// Pick a spawn position at the colony's FRONTIER: sample 8 random sibling agents
// and return the live one that's furthest ALONG toward the exit (highest attractant).
// So new growth buds from the leading edge instead of trekking from the start —
// agents furthest along give birth. Falls back to the start cell early on.
vec2 frontierSpawn(float salt) {
  vec2 best = vec2(hash(gl_FragCoord.xy + vec2(u_frame + salt, 3.0)) * u_startCell.x,
                   hash(gl_FragCoord.xy + vec2(5.0, u_frame + salt)) * u_startCell.y);
  float bestAtt = -1.0;
  float dim = u_agentDim;
  // Birth times are ordered by index, so the live agents are indices [0, activeCount).
  // Sample only that range → we always land on real, live frontier agents.
  float activeCount = max(1.0, u_time * dim * dim);
  for (int k = 0; k < 8; k++) {
    float h = hash(gl_FragCoord.xy + vec2(u_frame + float(k) * 3.1 + salt, 1.7));
    float idx1 = floor(h * activeCount);
    vec4 oa = texelFetch(u_agents, ivec2(int(mod(idx1, dim)), int(floor(idx1 / dim))), 0);
    if (oa.x < 0.0) continue;                       // (rare) sibling born this very step
    float att = texture(u_attract, oa.xy).r;
    if (att > bestAtt) { bestAtt = att; best = oa.xy; }
  }
  return best;
}
void main() {
  ivec2 idx = ivec2(gl_FragCoord.xy);
  vec4 a = texelFetch(u_agents, idx, 0);
  vec2 pos = a.xy; float heading = a.z; float birth = a.w;
  // EMISSION: agents are born gradually (u_time rises 0→1). An unborn agent waits
  // off-screen (pos < 0 → its deposit point is clipped, lays no trail). The instant
  // it's born it spawns in the START cell, so the colony GROWS out from the start.
  if (u_time < birth) { fragColor = vec4(-1.0, -1.0, heading, birth); return; }
  if (pos.x < 0.0) {                                 // just born → bud AT a frontier agent
    pos = frontierSpawn(17.0);                       // exact in-corridor pos (no jitter → no wall-crossing)
    heading = hash(gl_FragCoord.xy + vec2(u_frame, 29.0)) * 6.2831853;
  }
  float rnd = hash(gl_FragCoord.xy + vec2(u_frame, u_frame * 1.7));
  // A stable per-agent role (frame-independent hash): SCOUTS pioneer via negative
  // chemotaxis — they steer toward the WEAKEST trail to push into unexplored
  // corridors (ignoring the goal); FOLLOWERS steer toward the strongest trail AND
  // climb the goal gradient toward the exit. Scouts keep it exploring + finding
  // dead-ends; followers carry the network toward the goal.
  bool scout = hash(gl_FragCoord.xy * 1.7 + 11.0) < u_scoutFrac;
  float aw = scout ? 0.0 : u_gradWeight;
  float c = sense(pos, heading, aw);
  float l = sense(pos, heading + u_sensorAngle, aw);
  float r = sense(pos, heading - u_sensorAngle, aw);
  if (scout) {
    if (c < l && c < r) {                          // weakest ahead → into the unknown
    } else if (c > l && c > r) {                    // strongest ahead → veer off
      heading += (rnd < 0.5 ? -1.0 : 1.0) * u_turnSpeed;
    } else if (l < r) heading += u_turnSpeed;       // turn toward the weaker side
    else if (r < l) heading -= u_turnSpeed;
  } else {
    if (c > l && c > r) {                           // strongest ahead → continue
    } else if (c < l && c < r) {                    // ambiguous → random turn
      heading += (rnd < 0.5 ? -1.0 : 1.0) * u_turnSpeed;
    } else if (l > r) heading += u_turnSpeed;
    else if (r > l) heading -= u_turnSpeed;
  }
  vec2 dir = vec2(cos(heading), sin(heading));
  vec2 npos = pos + dir * (u_step / u_trailSize);
  // Wall-rejection: if the step would enter a wall or leave the field, DON'T
  // advance; turn by a random amount so a new heading is tried next step. This
  // keeps agents inside corridors and unsticks them from corners.
  if (npos.x < 0.0 || npos.x > 1.0 || npos.y < 0.0 || npos.y > 1.0 || isWall(npos)) {
    heading += (rnd - 0.5) * 3.1415926;
  } else {
    pos = npos;
  }
  // Continuous frontier feeding: a small per-step chance to recycle THIS agent up
  // to the leading edge, so the colony keeps budding forward instead of stalling
  // once the initial wave is spent. (Not respawn-to-start — that just refills the
  // corner; here trailing agents leapfrog to where the growth actually is.)
  float rb = hash(gl_FragCoord.xy + vec2(u_frame * 0.7, 91.0));
  if (rb < u_respawn) {
    pos = frontierSpawn(43.0);
    heading = hash(gl_FragCoord.xy + vec2(u_frame, 61.0)) * 6.2831853;
  }
  heading = mod(heading, 6.2831853);
  fragColor = vec4(pos, heading, birth);
}`

// DEPOSIT: one point per agent, positioned by texelFetch on the agent texture.
const DEPOSIT_VERT = `#version 300 es
uniform sampler2D u_agents;
uniform float u_agentDim;
void main() {
  int id = gl_VertexID;
  int dim = int(u_agentDim);
  ivec2 idx = ivec2(id % dim, id / dim);
  vec2 pos = texelFetch(u_agents, idx, 0).xy;
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = 1.0;
}`

const DEPOSIT_FRAG = `#version 300 es
precision highp float;
uniform float u_deposit;
out vec4 fragColor;
void main() { fragColor = vec4(u_deposit, 0.0, 0.0, 1.0); }`

// DIFFUSE+DECAY: wall-aware 3×3 box blur mixed by u_diffuse, then × (1 - u_decay).
// Wall texels hold no trail and never contribute to a neighbour's blur, so
// pheromone never bleeds across a wall.
const DIFFUSE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_trail;
uniform sampler2D u_walls;
uniform vec2  u_texel;
uniform float u_diffuse;
uniform float u_decay;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy * u_texel;
  if (texture(u_walls, uv).r > 0.5) { fragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float sum = 0.0; float wsum = 0.0;
  for (int dy = -1; dy <= 1; dy++)
    for (int dx = -1; dx <= 1; dx++) {
      vec2 t = uv + vec2(float(dx), float(dy)) * u_texel;
      if (texture(u_walls, t).r > 0.5) continue;
      sum += texture(u_trail, t).r; wsum += 1.0;
    }
  float blurred = wsum > 0.0 ? sum / wsum : 0.0;
  float center = texture(u_trail, uv).r;
  // High SAFETY ceiling only (not an operating-point clamp): legit corridor veins
  // sit ~6-18, so 16 rarely binds — it just caps the pathological start-cell pile
  // below the R16F ceiling. A low clamp (was 3) flattened every busy corridor to the
  // same value, zeroing the gradient agents climb to bundle into veins → uniform
  // flood. Decay (not the clamp) is now the contrast knob + start-trap drain.
  float v = min(mix(center, blurred, u_diffuse) * (1.0 - u_decay), 16.0);
  fragColor = vec4(v, 0.0, 0.0, 1.0);
}`

// DISPLAY: walls (opaque) → trail gradient in corridors → solve-gated path glow.
const DISPLAY_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_trail;
uniform sampler2D u_walls;
uniform sampler2D u_path;
uniform sampler2D u_lut;
uniform vec2  u_texel;
uniform float u_exposure;
uniform vec3  u_wallColor;
uniform vec3  u_pathColor;
uniform vec2  u_cellFrac;   // start/end cell size in UV (1/cols, 1/rows)
uniform float u_solveMix;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy * u_texel;
  if (texture(u_walls, uv).r > 0.5) { fragColor = vec4(u_wallColor, 1.0); return; }
  float d = texture(u_trail, uv).r;
  float t = 1.0 - exp(-u_exposure * d);
  vec3 col = texture(u_lut, vec2(clamp(t, 0.0, 1.0), 0.5)).rgb;
  // Light start (green) / exit (red) tints — a soft wash over the corridor of each
  // corner cell so the start and goal are always visible, even before slime arrives.
  if (uv.x < u_cellFrac.x && uv.y < u_cellFrac.y)
    col += vec3(0.40, 1.0, 0.50) * 0.13;          // start = light green
  if (uv.x > 1.0 - u_cellFrac.x && uv.y > 1.0 - u_cellFrac.y)
    col += vec3(1.0, 0.42, 0.42) * 0.13;          // exit = light red
  float pathHere = texture(u_path, uv).r;
  col += u_pathColor * pathHere * u_solveMix;     // additive glow once solved
  fragColor = vec4(col, 1.0);
}`

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src); gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh); gl.deleteShader(sh)
    throw new Error(`Labyrinth shader compile failed: ${log}`)
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
    throw new Error(`Labyrinth program link failed: ${log}`)
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

// Cap the trail/maze field's longest side to bound per-frame cost on oversized
// (4K/5K/retina) canvases — the wall-aware blur is per-texel. Common displays
// render uncapped; only oversized canvases are downscaled, stretched at display.
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

/** '#rrggbb' → [r,g,b] in 0..1. */
export function hexToVec3(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export type Vec2 = { x: number; y: number }

export type LabyrinthGL = {
  moveProg: WebGLProgram
  depositProg: WebGLProgram
  diffuseProg: WebGLProgram
  displayProg: WebGLProgram
  vao: WebGLVertexArrayObject
  agentTex: [WebGLTexture, WebGLTexture]
  agentFbo: [WebGLFramebuffer, WebGLFramebuffer]
  trailTex: [WebGLTexture, WebGLTexture]
  trailFbo: [WebGLFramebuffer, WebGLFramebuffer]
  wallTex: WebGLTexture
  pathTex: WebGLTexture
  attractTex: WebGLTexture  // goal gradient (high at exit)
  lutTex: WebGLTexture
  agentDim: number
  trailW: number
  trailH: number
  cur: { agent: number; trail: number }
  frame: number
  stepAcc: number
  emitClock: number         // counts up to EMISSION_STEPS → drives the emission clock
  solveCheckFrame: number
  startCell: Vec2
  endUV: Vec2
  locs: Record<string, Record<string, WebGLUniformLocation | null>>
  /** Reused readPixels scratch (endReached) — avoids a fresh alloc per solve check. */
  readbackBuf: Float32Array
  /** Cached wall/path colour → vec3 (hexToVec3 only re-parses on an actual colour edit). */
  wallColorHex: string
  wallColorVec: [number, number, number]
  pathColorHex: string
  pathColorVec: [number, number, number]
}

export function initGL(
  gl: WebGL2RenderingContext, cfg: LabyrinthConfig,
  trailW: number, trailH: number,
  wallData: Uint8Array, pathData: Uint8Array, attractData: Float32Array,
  startCell: Vec2, endUV: Vec2,
): LabyrinthGL {
  if (!gl.getExtension('EXT_color_buffer_float')) {
    throw new Error('Labyrinth requires float render targets (EXT_color_buffer_float)')
  }
  const moveProg = link(gl, TRI_VERT, MOVE_FRAG)
  const depositProg = link(gl, DEPOSIT_VERT, DEPOSIT_FRAG)
  const diffuseProg = link(gl, TRI_VERT, DIFFUSE_FRAG)
  const displayProg = link(gl, TRI_VERT, DISPLAY_FRAG)
  const vao = gl.createVertexArray()!

  const agentDim = texDimFor(cfg.agents)
  const seedData = initAgentsAtStart(cfg.seed, cfg.agents, startCell.x, startCell.y)
  const agentTex: [WebGLTexture, WebGLTexture] = [
    makeTex(gl, agentDim, agentDim, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST, seedData),
    makeTex(gl, agentDim, agentDim, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST, null),
  ]
  const agentFbo: [WebGLFramebuffer, WebGLFramebuffer] = [fboFor(gl, agentTex[0]), fboFor(gl, agentTex[1])]

  const trailTex: [WebGLTexture, WebGLTexture] = [
    makeTex(gl, trailW, trailH, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.LINEAR, null),
    makeTex(gl, trailW, trailH, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.LINEAR, null),
  ]
  const trailFbo: [WebGLFramebuffer, WebGLFramebuffer] = [fboFor(gl, trailTex[0]), fboFor(gl, trailTex[1])]
  for (const fb of trailFbo) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT)
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)

  // Wall mask NEAREST (crisp boundaries); path mask LINEAR (soft glow edges).
  // R8 rows are 1 byte/texel; the default UNPACK_ALIGNMENT of 4 makes texImage2D
  // expect 4-byte-padded rows and reject our tight buffer for any width not a
  // multiple of 4 (INVALID_OPERATION → blank walls). Force 1-byte row alignment.
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
  const wallTex = makeTex(gl, trailW, trailH, gl.R8, gl.RED, gl.UNSIGNED_BYTE, gl.NEAREST, wallData)
  const pathTex = makeTex(gl, trailW, trailH, gl.R8, gl.RED, gl.UNSIGNED_BYTE, gl.LINEAR, pathData)
  // Goal gradient — R16F so the exit→start falloff is smooth for the followers to climb.
  const attractTex = makeTex(gl, trailW, trailH, gl.R16F, gl.RED, gl.FLOAT, gl.LINEAR, attractData)
  const lutTex = makeTex(gl, 256, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, buildLUT(cfg.stops))

  const u = (p: WebGLProgram, names: string[]) =>
    Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)]))
  const locs = {
    move: u(moveProg, ['u_agents', 'u_trail', 'u_walls', 'u_attract', 'u_trailSize', 'u_startCell',
                       'u_sensorAngle', 'u_sensorDist', 'u_turnSpeed', 'u_step', 'u_frame',
                       'u_scoutFrac', 'u_gradWeight', 'u_time', 'u_agentDim', 'u_respawn']),
    deposit: u(depositProg, ['u_agents', 'u_agentDim', 'u_deposit']),
    diffuse: u(diffuseProg, ['u_trail', 'u_walls', 'u_texel', 'u_diffuse', 'u_decay']),
    display: u(displayProg, ['u_trail', 'u_walls', 'u_path', 'u_lut', 'u_texel',
                             'u_exposure', 'u_wallColor', 'u_pathColor', 'u_cellFrac', 'u_solveMix']),
  }
  return {
    moveProg, depositProg, diffuseProg, displayProg, vao,
    agentTex, agentFbo, trailTex, trailFbo, wallTex, pathTex, attractTex, lutTex,
    agentDim, trailW, trailH, cur: { agent: 0, trail: 0 },
    frame: 0, stepAcc: 0, emitClock: 0, solveCheckFrame: 0, startCell, endUV, locs,
    readbackBuf: new Float32Array(4),
    wallColorHex: cfg.wallColor, wallColorVec: hexToVec3(cfg.wallColor),
    pathColorHex: cfg.pathColor, pathColorVec: hexToVec3(cfg.pathColor),
  }
}

export function uploadLUT(gl: WebGL2RenderingContext, res: LabyrinthGL, stops: string[]): void {
  gl.bindTexture(gl.TEXTURE_2D, res.lutTex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, buildLUT(stops))
}

export function disposeGL(gl: WebGL2RenderingContext, res: LabyrinthGL): void {
  for (const p of [res.moveProg, res.depositProg, res.diffuseProg, res.displayProg]) gl.deleteProgram(p)
  gl.deleteVertexArray(res.vao)
  for (const t of [...res.agentTex, ...res.trailTex, res.wallTex, res.pathTex, res.attractTex, res.lutTex]) gl.deleteTexture(t)
  for (const f of [...res.agentFbo, ...res.trailFbo]) gl.deleteFramebuffer(f)
}

/** Regenerate to a fresh maze: re-upload wall/path masks + agent seed, clear the
 *  trail, reset counters. Texture dims are unchanged (same trailW/H). */
export function regenerate(
  gl: WebGL2RenderingContext, res: LabyrinthGL,
  wallData: Uint8Array, pathData: Uint8Array, attractData: Float32Array, agentData: Float32Array,
  startCell: Vec2, endUV: Vec2,
): void {
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1) // R8 masks need 1-byte row alignment (see initGL)
  gl.bindTexture(gl.TEXTURE_2D, res.wallTex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, res.trailW, res.trailH, 0, gl.RED, gl.UNSIGNED_BYTE, wallData)
  gl.bindTexture(gl.TEXTURE_2D, res.pathTex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, res.trailW, res.trailH, 0, gl.RED, gl.UNSIGNED_BYTE, pathData)
  gl.bindTexture(gl.TEXTURE_2D, res.attractTex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, res.trailW, res.trailH, 0, gl.RED, gl.FLOAT, attractData)
  gl.bindTexture(gl.TEXTURE_2D, res.agentTex[0])
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, res.agentDim, res.agentDim, 0, gl.RGBA, gl.FLOAT, agentData)
  for (const fb of res.trailFbo) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT)
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  res.cur = { agent: 0, trail: 0 }
  res.frame = 0; res.stepAcc = 0; res.emitClock = 0; res.solveCheckFrame = 0
  res.startCell = startCell; res.endUV = endUV
}

const RAD = Math.PI / 180
const EXPOSURE = 2.0 // 🎚️ display window — push veins to white, background to black (live-tuned)
const EMISSION_STEPS = 20000 // 🎚️ sim steps over which all agents are born — slow, so growth creeps
const FRONTIER_RESPAWN = 0.003 // 🎚️ per-step chance an agent leapfrogs to the frontier (continuous budding)
const SOLVE_EVERY = 30
const SOLVE_THRESHOLD = 0.5 // 🎚️ end-cell density to count as reached (lowered: deposit↓/decay↑ drop the field scale)

function fullscreen(gl: WebGL2RenderingContext, res: LabyrinthGL) {
  gl.bindVertexArray(res.vao)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

/** One simulation step: move → deposit → diffuse+decay, advancing res.cur. */
export function step(gl: WebGL2RenderingContext, res: LabyrinthGL, cfg: LabyrinthConfig): void {
  const src = res.cur.agent, dst = src ^ 1
  // 1. MOVE
  gl.disable(gl.BLEND)
  gl.bindFramebuffer(gl.FRAMEBUFFER, res.agentFbo[dst])
  gl.viewport(0, 0, res.agentDim, res.agentDim)
  gl.useProgram(res.moveProg)
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, res.agentTex[src])
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, res.trailTex[res.cur.trail])
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, res.wallTex)
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, res.attractTex)
  gl.uniform1i(res.locs.move.u_agents, 0)
  gl.uniform1i(res.locs.move.u_trail, 1)
  gl.uniform1i(res.locs.move.u_walls, 2)
  gl.uniform1i(res.locs.move.u_attract, 3)
  gl.uniform2f(res.locs.move.u_trailSize, res.trailW, res.trailH)
  gl.uniform2f(res.locs.move.u_startCell, res.startCell.x, res.startCell.y)
  gl.uniform1f(res.locs.move.u_sensorAngle, cfg.sensorAngle * RAD)
  gl.uniform1f(res.locs.move.u_sensorDist, cfg.sensorDist)
  gl.uniform1f(res.locs.move.u_turnSpeed, cfg.turnSpeed * RAD)
  gl.uniform1f(res.locs.move.u_scoutFrac, cfg.exploration)
  gl.uniform1f(res.locs.move.u_gradWeight, cfg.goalPull)
  gl.uniform1f(res.locs.move.u_agentDim, res.agentDim)
  gl.uniform1f(res.locs.move.u_respawn, FRONTIER_RESPAWN)
  // Emission clock: ramps 0→1 over EMISSION_STEPS so agents are born gradually
  // and the colony visibly grows out from the start (then holds at full strength).
  res.emitClock = Math.min(EMISSION_STEPS, res.emitClock + 1)
  gl.uniform1f(res.locs.move.u_time, res.emitClock / EMISSION_STEPS)
  gl.uniform1f(res.locs.move.u_step, 1.0)
  res.frame = (res.frame + 1) % 100000
  gl.uniform1f(res.locs.move.u_frame, res.frame)
  fullscreen(gl, res)
  res.cur.agent = dst

  // 2. DEPOSIT (additive points)
  gl.bindFramebuffer(gl.FRAMEBUFFER, res.trailFbo[res.cur.trail])
  gl.viewport(0, 0, res.trailW, res.trailH)
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE)
  gl.useProgram(res.depositProg)
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, res.agentTex[res.cur.agent])
  gl.uniform1i(res.locs.deposit.u_agents, 0)
  gl.uniform1f(res.locs.deposit.u_agentDim, res.agentDim)
  gl.uniform1f(res.locs.deposit.u_deposit, cfg.deposit)
  gl.bindVertexArray(res.vao)
  gl.drawArrays(gl.POINTS, 0, cfg.agents)
  gl.disable(gl.BLEND)

  // 3. DIFFUSE+DECAY (wall-aware)
  const ts = res.cur.trail, td = ts ^ 1
  gl.bindFramebuffer(gl.FRAMEBUFFER, res.trailFbo[td])
  gl.useProgram(res.diffuseProg)
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, res.trailTex[ts])
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, res.wallTex)
  gl.uniform1i(res.locs.diffuse.u_trail, 0)
  gl.uniform1i(res.locs.diffuse.u_walls, 1)
  gl.uniform2f(res.locs.diffuse.u_texel, 1 / res.trailW, 1 / res.trailH)
  gl.uniform1f(res.locs.diffuse.u_diffuse, cfg.diffuse)
  gl.uniform1f(res.locs.diffuse.u_decay, cfg.decay)
  fullscreen(gl, res)
  res.cur.trail = td
}

/** Throttled solve check: every SOLVE_EVERY calls, read the trail density at the
 *  end cell (1×1) and report whether it has crossed the threshold. */
export function endReached(gl: WebGL2RenderingContext, res: LabyrinthGL): boolean {
  res.solveCheckFrame++
  if (res.solveCheckFrame % SOLVE_EVERY !== 0) return false
  const px = Math.min(res.trailW - 1, Math.max(0, Math.round(res.endUV.x * res.trailW)))
  const py = Math.min(res.trailH - 1, Math.max(0, Math.round(res.endUV.y * res.trailH)))
  gl.bindFramebuffer(gl.FRAMEBUFFER, res.trailFbo[res.cur.trail])
  const out = res.readbackBuf
  gl.readPixels(px, py, 1, 1, gl.RGBA, gl.FLOAT, out)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return out[0] >= SOLVE_THRESHOLD
}

/** Advance the sim by `rate` steps-per-frame (fractional; accumulates), then run
 *  the composite display pass. `solveMix` ramps the path glow once solved. */
export function render(
  gl: WebGL2RenderingContext, res: LabyrinthGL, cfg: LabyrinthConfig,
  rate: number, solveMix: number,
): void {
  res.stepAcc += rate
  const steps = Math.floor(res.stepAcc)
  res.stepAcc -= steps
  for (let i = 0; i < steps; i++) step(gl, res, cfg)

  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
  gl.useProgram(res.displayProg)
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, res.trailTex[res.cur.trail])
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, res.wallTex)
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, res.pathTex)
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, res.lutTex)
  gl.uniform1i(res.locs.display.u_trail, 0)
  gl.uniform1i(res.locs.display.u_walls, 1)
  gl.uniform1i(res.locs.display.u_path, 2)
  gl.uniform1i(res.locs.display.u_lut, 3)
  gl.uniform2f(res.locs.display.u_texel, 1 / gl.drawingBufferWidth, 1 / gl.drawingBufferHeight)
  gl.uniform1f(res.locs.display.u_exposure, EXPOSURE)
  // wall/path colours only change on a config edit — cache the parsed vec3, keyed
  // by the hex string, instead of re-parsing (allocating two arrays + slices) every frame.
  if (res.wallColorHex !== cfg.wallColor) { res.wallColorVec = hexToVec3(cfg.wallColor); res.wallColorHex = cfg.wallColor }
  if (res.pathColorHex !== cfg.pathColor) { res.pathColorVec = hexToVec3(cfg.pathColor); res.pathColorHex = cfg.pathColor }
  const wc = res.wallColorVec, pc = res.pathColorVec
  gl.uniform3f(res.locs.display.u_wallColor, wc[0], wc[1], wc[2])
  gl.uniform3f(res.locs.display.u_pathColor, pc[0], pc[1], pc[2])
  gl.uniform2f(res.locs.display.u_cellFrac, res.startCell.x, res.startCell.y)
  gl.uniform1f(res.locs.display.u_solveMix, solveMix)
  fullscreen(gl, res)
}
