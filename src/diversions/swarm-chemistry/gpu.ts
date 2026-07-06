// gpu.ts — WebGPU compute + render for EVOLUTIONARY Swarm Chemistry. WGSL lives here as
// template strings (repo convention). Every particle owns its own 8-param genome; on
// collision, recipes transmit + mutate, so the broth never settles.
//
// COMPUTE — three passes per sim step (one shared bind group; pass boundaries sync):
//   1. forcesStats: the O(N²) neighbour loop → boids forces (→newVel[i]) AND the
//      evolutionary stats (nearest collider within collisionR, same-type neighbour count
//      via a per-particle genome fingerprint fp[], local density, speed).
//   2. transmission: each i looks at its collider j; a competition function (majority /
//      denser / faster / slower) decides if j wins → genomeOut[i] = mutate(genomeIn[j]);
//      else genomeOut[i] = genomeIn[i]. Writes only its own slot → no hazard.
//   3. integrate: vel=newVel, pos+=vel (clamp), and commit genomeOut→genomeIn while
//      recomputing fp[i] — so next step's fingerprint is consistent with the new genome.
// genomeIn is read_write (integrate writes it); reading a read_write storage in the other
// passes is allowed. No genome ping-pong buffer needed.
//
// RENDER: instanced vertex-pulled quads into a persistent accumulation texture (trails),
// two-layer glow, optional bloom. Position is interpolated prev→cur by view.alpha so slow
// playback glides. Colour is per-particle FROM the genome (c1→R, c2→G, c3→B) so it flows
// and shifts as recipes evolve.
import {
  seedWorld, packParams, packView, arenaDims, parseBg, GENOME,
  DEFAULT_CAMERA, PARAMS_SIZE, VIEW_SIZE, type Camera,
} from './pack'
import { PARAM_MAX } from './recipes'
import type { SwarmChemistryConfig } from './schema'

const WORKGROUP = 64

const BUF = { UNIFORM: 0x40, STORAGE: 0x80, COPY_DST: 0x08, COPY_SRC: 0x04 } as const
const TEX = { COPY_SRC: 0x01, COPY_DST: 0x02, TEXTURE_BINDING: 0x04, RENDER_ATTACHMENT: 0x10 } as const
const STAGE = { VERTEX: 0x1, FRAGMENT: 0x2, COMPUTE: 0x4 } as const

const COMPUTE_WGSL = /* wgsl */ `
struct Params {
  n: u32, arenaW: f32, arenaH: f32, repDist: f32, step: u32, seed: u32,
  collisionR2: f32, mutationRate: f32, simThr: f32, competition: u32, evolve: u32,
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> genomeIn:  array<f32>;   // n*8, physics reads; integrate writes
@group(0) @binding(2) var<storage, read_write> genomeOut: array<f32>;   // n*8, transmission writes
@group(0) @binding(3) var<storage, read_write> positions: array<vec2f>;
@group(0) @binding(4) var<storage, read_write> velocities: array<vec2f>;
@group(0) @binding(5) var<storage, read_write> newVel:    array<vec2f>;
@group(0) @binding(6) var<storage, read_write> fp:        array<f32>;   // genome fingerprint (maintained by integrate)
@group(0) @binding(7) var<storage, read_write> collider:  array<u32>;   // nearest collider index (0xffffffff = none)
@group(0) @binding(8) var<storage, read_write> metric:    array<vec4f>; // (sameType, density, speed, _)

const PMAX = array<f32, 8>(300.0, 20.0, 40.0, 1.0, 1.0, 100.0, 0.5, 1.0);
const NO_COLLIDER: u32 = 0xffffffffu;

fn pcg(v: u32) -> u32 {
  var state = v * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}
fn rndf(v: u32) -> f32 { return f32(pcg(v)) / 4294967296.0; }
fn gin(i: u32, k: u32) -> f32 { return genomeIn[i * 8u + k]; }

@compute @workgroup_size(${WORKGROUP})
fn forcesStats(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= params.n) { return; }
  let R = gin(i, 0u); let Vn = gin(i, 1u); let Vm = gin(i, 2u);
  let c1 = gin(i, 3u); let c2 = gin(i, 4u); let c3 = gin(i, 5u);
  let c4 = gin(i, 6u); let c5 = gin(i, 7u);
  let pi = positions[i];
  let vi = velocities[i];
  let R2 = R * R;
  let fpi = fp[i];

  var center = vec2f(0.0, 0.0);
  var avgVel = vec2f(0.0, 0.0);
  var sep = vec2f(0.0, 0.0);
  var cnt = 0.0;
  var sameType = 0.0;
  var colIdx = NO_COLLIDER;
  var colDist2 = params.collisionR2;
  for (var j: u32 = 0u; j < params.n; j = j + 1u) {
    if (j == i) { continue; }
    let d = positions[j] - pi;
    let dist2 = dot(d, d);
    // collision (evolution) — independent of perception R, so tiny-R genes still collide
    if (dist2 > 0.0 && dist2 < colDist2) { colDist2 = dist2; colIdx = j; }
    if (dist2 >= R2) { continue; }
    center = center + positions[j];
    avgVel = avgVel + velocities[j];
    sep = sep + (pi - positions[j]) / max(dist2, 0.001) * c3;
    cnt = cnt + 1.0;
    if (abs(fp[j] - fpi) < params.simThr) { sameType = sameType + 1.0; }
  }

  let maxVel = Vm * Vm;
  let dxb = min(pi.x, params.arenaW - pi.x) / params.repDist;
  let repX = select(0.0, pow(max(0.0, 1.0 - dxb), 10.0) * maxVel, dxb <= 1.0);
  let dirX = select(-1.0, 1.0, pi.x < params.arenaW - pi.x);
  let dyb = min(pi.y, params.arenaH - pi.y) / params.repDist;
  let repY = select(0.0, pow(max(0.0, 1.0 - dyb), 10.0) * maxVel, dyb <= 1.0);
  let dirY = select(-1.0, 1.0, pi.y < params.arenaH - pi.y);
  let repulsive = vec2f(repX * dirX, repY * dirY);

  let rs = pcg(i ^ pcg(params.step ^ params.seed));
  var accel: vec2f;
  if (cnt < 0.5) {
    accel = vec2f(rndf(rs) - 0.5, rndf(rs + 1u) - 0.5) + repulsive;
  } else {
    center = center / cnt;
    avgVel = avgVel / cnt;
    var steering = vec2f(0.0, 0.0);
    if (rndf(rs + 2u) < c4) { steering = vec2f(rndf(rs + 3u) * 9.0 - 4.5, rndf(rs + 4u) * 9.0 - 4.5); }
    accel = (center - pi) * c1 + (avgVel - vi) * c2 + sep + steering + repulsive;
  }

  var nv = vi + accel;
  let sz2 = dot(nv, nv);
  if (sz2 > maxVel) { nv = nv * (Vm / sqrt(sz2)); }
  let sz = max(sqrt(dot(nv, nv)), 0.001);
  nv = nv + nv * (Vn - sz) / sz * c5;
  let sz3 = dot(nv, nv);
  if (sz3 > maxVel) { nv = nv * (Vm / sqrt(sz3)); }
  newVel[i] = nv;

  collider[i] = colIdx;
  metric[i] = vec4f(sameType, cnt, length(vi), 0.0);
}

@compute @workgroup_size(${WORKGROUP})
fn transmission(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= params.n) { return; }
  let b = i * 8u;
  // frozen (evolve off) or no collision → genome passes through unchanged
  if (params.evolve == 0u) { for (var k = 0u; k < 8u; k = k + 1u) { genomeOut[b + k] = genomeIn[b + k]; } return; }
  let j = collider[i];
  if (j == 0xffffffffu) { for (var k = 0u; k < 8u; k = k + 1u) { genomeOut[b + k] = genomeIn[b + k]; } return; }

  let mi = metric[i];
  let mj = metric[j];
  var wi = mi.x; var wj = mj.x;                       // 0 = Majority (same-type count)
  if (params.competition == 1u) { wi = mi.y; wj = mj.y; }        // Denser (local density)
  else if (params.competition == 2u) { wi = mi.z; wj = mj.z; }   // Faster (speed)
  else if (params.competition == 3u) { wi = -mi.z; wj = -mj.z; } // Slower (−speed)
  let jWins = wj > wi;

  if (jWins) {
    let jb = j * 8u;
    let rs = pcg(i ^ pcg(params.step ^ params.seed) ^ 0x9e3779b9u);
    for (var k = 0u; k < 8u; k = k + 1u) {
      var v = genomeIn[jb + k];
      if (rndf(rs + k * 7u) < params.mutationRate) {
        v = v + (rndf(rs + 101u + k) * 2.0 - 1.0) * PMAX[k] * 0.15;
        v = clamp(v, 0.0, PMAX[k]);
      }
      genomeOut[b + k] = v;
    }
  } else {
    for (var k = 0u; k < 8u; k = k + 1u) { genomeOut[b + k] = genomeIn[b + k]; }
  }
}

@compute @workgroup_size(${WORKGROUP})
fn integrate(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= params.n) { return; }
  let v = newVel[i];
  velocities[i] = v;
  var p = positions[i] + v;
  p.x = clamp(p.x, 0.0, params.arenaW);
  p.y = clamp(p.y, 0.0, params.arenaH);
  positions[i] = p;
  // commit the (possibly transmitted) genome and refresh its fingerprint
  let b = i * 8u;
  var s = 0.0;
  for (var k = 0u; k < 8u; k = k + 1u) {
    let g = genomeOut[b + k];
    genomeIn[b + k] = g;
    s = s + g / PMAX[k];
  }
  fp[i] = s / 8.0;
}
`

const RENDER_WGSL = /* wgsl */ `
struct View { scale: f32, viewCx: f32, viewCy: f32, viewW: f32, viewH: f32, coreR: f32, haloR: f32, alpha: f32, colorBoost: f32 }
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<storage, read> positions: array<vec2f>;
@group(0) @binding(2) var<storage, read> prevPos:   array<vec2f>;
@group(0) @binding(3) var<storage, read> genome:    array<f32>;
@group(0) @binding(4) var<storage, read> prevGenome: array<f32>;

struct VSOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) color: vec4f }

const CORNERS = array<vec2f, 6>(
  vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
  vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
);

fn buildVertex(vi: u32, ii: u32, radius: f32) -> VSOut {
  let corner = CORNERS[vi];
  let wp = mix(prevPos[ii], positions[ii], view.alpha);
  let sx = view.viewW * 0.5 + (wp.x - view.viewCx) * view.scale + corner.x * radius;
  let sy = view.viewH * 0.5 + (wp.y - view.viewCy) * view.scale + corner.y * radius;
  var out: VSOut;
  out.pos = vec4f(sx / view.viewW * 2.0 - 1.0, 1.0 - sy / view.viewH * 2.0, 0.0, 1.0);
  out.uv = corner;
  // colour FROM the genome (Sayama's c1→R, c2→G, c3→B), INTERPOLATED prev→cur by the same
  // alpha as position — so a recipe transmission eases the colour across the inter-step
  // frames instead of popping (the evolutionary colour strobe). Lifted + boosted for vivid.
  let b = ii * 8u;
  let cur = vec3f(genome[b + 3u], genome[b + 4u], genome[b + 5u] / 100.0);
  let prv = vec3f(prevGenome[b + 3u], prevGenome[b + 4u], prevGenome[b + 5u] / 100.0);
  var g3 = mix(prv, cur, view.alpha);
  g3 = pow(clamp(g3, vec3f(0.0), vec3f(1.0)), vec3f(0.6));
  g3 = clamp(g3 * view.colorBoost, vec3f(0.0), vec3f(1.4));
  out.color = vec4f(max(g3, vec3f(0.12)), 1.0);
  return out;
}
@vertex fn vs_core(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VSOut { return buildVertex(vi, ii, view.coreR); }
@vertex fn vs_halo(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VSOut { return buildVertex(vi, ii, view.haloR); }

@fragment fn fs_core(in: VSOut) -> @location(0) vec4f {
  let d = length(in.uv);
  let a = 1.0 - smoothstep(0.72, 1.0, d);
  if (a <= 0.001) { discard; }
  return vec4f(in.color.rgb, a);
}
@fragment fn fs_halo(in: VSOut) -> @location(0) vec4f {
  let d = clamp(length(in.uv), 0.0, 1.0);
  let a = 0.5 * pow(1.0 - d, 2.2);
  return vec4f(in.color.rgb * a, a);
}

struct Fade { r: f32, g: f32, b: f32, a: f32 }
@group(0) @binding(0) var<uniform> fade: Fade;
const FS = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
@vertex fn vs_fullscreen(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f { return vec4f(FS[vi], 0.0, 1.0); }
@fragment fn fs_fade() -> @location(0) vec4f { return vec4f(fade.r, fade.g, fade.b, fade.a); }

// ---- bloom post ----
@group(0) @binding(0) var bsamp: sampler;
@group(0) @binding(1) var bsrc: texture_2d<f32>;
struct BloomU { threshold: f32, intensity: f32, dstTexelX: f32, dstTexelY: f32, dirX: f32, dirY: f32 }
@group(0) @binding(2) var<uniform> bu: BloomU;
@fragment fn fs_bright(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let uv = pos.xy * vec2f(bu.dstTexelX, bu.dstTexelY);
  let c = textureSampleLevel(bsrc, bsamp, uv, 0.0).rgb;
  let luma = dot(c, vec3f(0.2126, 0.7152, 0.0722));
  let k = max(0.0, luma - bu.threshold) / max(0.0001, 1.0 - bu.threshold);
  return vec4f(c * k, 1.0);
}
const BW = array<f32, 5>(0.227027, 0.194594, 0.121622, 0.054054, 0.016216);
@fragment fn fs_blur(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let uv = pos.xy * vec2f(bu.dstTexelX, bu.dstTexelY);
  let dir = vec2f(bu.dirX, bu.dirY);
  var sum = textureSampleLevel(bsrc, bsamp, uv, 0.0).rgb * BW[0];
  for (var i = 1; i < 5; i = i + 1) {
    let o = dir * f32(i);
    sum = sum + textureSampleLevel(bsrc, bsamp, uv + o, 0.0).rgb * BW[i];
    sum = sum + textureSampleLevel(bsrc, bsamp, uv - o, 0.0).rgb * BW[i];
  }
  return vec4f(sum, 1.0);
}
@group(0) @binding(0) var csamp: sampler;
@group(0) @binding(1) var cbase: texture_2d<f32>;
@group(0) @binding(2) var cbloom: texture_2d<f32>;
struct CompU { intensity: f32, dstTexelX: f32, dstTexelY: f32, pad: f32 }
@group(0) @binding(3) var<uniform> cu: CompU;
@fragment fn fs_composite(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let uv = pos.xy * vec2f(cu.dstTexelX, cu.dstTexelY);
  let base = textureSampleLevel(cbase, csamp, uv, 0.0).rgb;
  let bloom = textureSampleLevel(cbloom, csamp, uv, 0.0).rgb;
  return vec4f(base + bloom * cu.intensity, 1.0);
}
`

export interface GpuResources {
  device: GPUDevice
  ctx: GPUCanvasContext
  format: GPUTextureFormat
  count: number
  dpr: number
  arenaW: number
  arenaH: number
  worldMin: number
  // buffers
  paramsBuf: GPUBuffer
  viewBuf: GPUBuffer
  fadeBuf: GPUBuffer
  genomeInBuf: GPUBuffer
  genomeOutBuf: GPUBuffer
  prevGenomeBuf: GPUBuffer
  posBuf: GPUBuffer
  prevPosBuf: GPUBuffer
  velBuf: GPUBuffer
  newVelBuf: GPUBuffer
  fpBuf: GPUBuffer
  colliderBuf: GPUBuffer
  metricBuf: GPUBuffer
  // pipelines + bind groups
  forcesPipe: GPUComputePipeline
  transmitPipe: GPUComputePipeline
  integratePipe: GPUComputePipeline
  computeBind: GPUBindGroup
  haloPipe: GPURenderPipeline
  corePipe: GPURenderPipeline
  fadePipe: GPURenderPipeline
  renderBind: GPUBindGroup
  fadeBind: GPUBindGroup
  // accumulation surface
  accum: GPUTexture
  accumView: GPUTextureView
  texW: number
  texH: number
  needsClear: boolean
  bg: { r: number; g: number; b: number }
  step: number
  stepScratch: Uint32Array
  alphaScratch: Float32Array
  // bloom
  bloomSampler: GPUSampler
  bloomBGL: GPUBindGroupLayout
  compBGL: GPUBindGroupLayout
  brightPipe: GPURenderPipeline
  blurPipe: GPURenderPipeline
  compositePipe: GPURenderPipeline
  brightBuf: GPUBuffer
  blurHBuf: GPUBuffer
  blurVBuf: GPUBuffer
  compBuf: GPUBuffer
  bloomA: GPUTexture
  bloomB: GPUTexture
  bloomAView: GPUTextureView
  bloomBView: GPUTextureView
  brightBind: GPUBindGroup
  blurHBind: GPUBindGroup
  blurVBind: GPUBindGroup
  compBind: GPUBindGroup
  bloomW: number
  bloomH: number
}

const ALPHA_BLEND: GPUBlendState = {
  color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
}
const ADDITIVE_BLEND: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
}

function makeAccum(device: GPUDevice, format: GPUTextureFormat, w: number, h: number): GPUTexture {
  return device.createTexture({ size: [Math.max(1, w), Math.max(1, h)], format, usage: TEX.RENDER_ATTACHMENT | TEX.COPY_SRC | TEX.TEXTURE_BINDING })
}
function makeBloomTex(device: GPUDevice, format: GPUTextureFormat, w: number, h: number): GPUTexture {
  return device.createTexture({ size: [Math.max(1, w), Math.max(1, h)], format, usage: TEX.RENDER_ATTACHMENT | TEX.TEXTURE_BINDING })
}
const bloomDims = (w: number, h: number) => ({ bw: Math.max(1, Math.ceil(w / 2)), bh: Math.max(1, Math.ceil(h / 2)) })

export function writeBloom(res: GpuResources): void {
  const q = res.device.queue
  const dtx = 1 / res.bloomW, dty = 1 / res.bloomH
  const th = 0.55, inten = 0.9
  q.writeBuffer(res.brightBuf, 0, new Float32Array([th, inten, dtx, dty, 0, 0]))
  q.writeBuffer(res.blurHBuf, 0, new Float32Array([th, inten, dtx, dty, dtx, 0]))
  q.writeBuffer(res.blurVBuf, 0, new Float32Array([th, inten, dtx, dty, 0, dty]))
  q.writeBuffer(res.compBuf, 0, new Float32Array([inten, 1 / res.texW, 1 / res.texH, 0]))
}

function buildBloomBinds(res: GpuResources): void {
  const { device, bloomBGL, compBGL, bloomSampler } = res
  const u = (b: GPUBuffer) => ({ buffer: b })
  res.brightBind = device.createBindGroup({ layout: bloomBGL, entries: [
    { binding: 0, resource: bloomSampler }, { binding: 1, resource: res.accumView }, { binding: 2, resource: u(res.brightBuf) },
  ] })
  res.blurHBind = device.createBindGroup({ layout: bloomBGL, entries: [
    { binding: 0, resource: bloomSampler }, { binding: 1, resource: res.bloomAView }, { binding: 2, resource: u(res.blurHBuf) },
  ] })
  res.blurVBind = device.createBindGroup({ layout: bloomBGL, entries: [
    { binding: 0, resource: bloomSampler }, { binding: 1, resource: res.bloomBView }, { binding: 2, resource: u(res.blurVBuf) },
  ] })
  res.compBind = device.createBindGroup({ layout: compBGL, entries: [
    { binding: 0, resource: bloomSampler }, { binding: 1, resource: res.accumView }, { binding: 2, resource: res.bloomAView }, { binding: 3, resource: u(res.compBuf) },
  ] })
}

/** Fingerprint of a genome (must match the WGSL integrate pass): mean of normalized params. */
function fingerprint(genome: Float32Array, i: number): number {
  let s = 0
  for (let k = 0; k < GENOME; k++) s += genome[i * GENOME + k] / PARAM_MAX[k]
  return s / GENOME
}

export function initGPU(
  device: GPUDevice,
  ctx: GPUCanvasContext,
  format: GPUTextureFormat,
  cfg: SwarmChemistryConfig,
  size: { width: number; height: number },
  dpr: number,
): GpuResources {
  ctx.configure({ device, format, alphaMode: 'opaque', usage: TEX.RENDER_ATTACHMENT | TEX.COPY_DST })

  const count = cfg.count
  const { w: arenaW, h: arenaH } = arenaDims(cfg.worldMin, size)
  const world = seedWorld(cfg.recipe, count, cfg.seed, arenaW, arenaH)
  const fp0 = new Float32Array(count)
  for (let i = 0; i < count; i++) fp0[i] = fingerprint(world.genome, i)

  const mk = (bytes: number, usage: number) => device.createBuffer({ size: bytes, usage })
  const S = BUF.STORAGE | BUF.COPY_DST
  const U = BUF.UNIFORM | BUF.COPY_DST

  const genomeInBuf = mk(count * GENOME * 4, S | BUF.COPY_SRC) // COPY_SRC → snapshot into prevGenome
  const genomeOutBuf = mk(count * GENOME * 4, S)
  const prevGenomeBuf = mk(count * GENOME * 4, S)
  const posBuf = mk(count * 2 * 4, S | BUF.COPY_SRC)
  const prevPosBuf = mk(count * 2 * 4, S)
  const velBuf = mk(count * 2 * 4, S)
  const newVelBuf = mk(count * 2 * 4, S)
  const fpBuf = mk(count * 4, S)
  const colliderBuf = mk(count * 4, S)
  const metricBuf = mk(count * 4 * 4, S)
  const paramsBuf = mk(PARAMS_SIZE, U)
  const viewBuf = mk(VIEW_SIZE, U)
  const fadeBuf = mk(16, U)

  device.queue.writeBuffer(genomeInBuf, 0, world.genome)
  device.queue.writeBuffer(genomeOutBuf, 0, world.genome)
  device.queue.writeBuffer(prevGenomeBuf, 0, world.genome)
  device.queue.writeBuffer(posBuf, 0, world.pos)
  device.queue.writeBuffer(prevPosBuf, 0, world.pos)
  device.queue.writeBuffer(velBuf, 0, world.vel)
  device.queue.writeBuffer(newVelBuf, 0, world.vel)
  device.queue.writeBuffer(fpBuf, 0, fp0)
  device.queue.writeBuffer(paramsBuf, 0, packParams(cfg, arenaW, arenaH, 0))
  device.queue.writeBuffer(viewBuf, 0, packView(cfg, size, dpr, DEFAULT_CAMERA, arenaW, arenaH))

  const computeBGL = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: STAGE.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: STAGE.COMPUTE, buffer: { type: 'storage' } },
      { binding: 2, visibility: STAGE.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: STAGE.COMPUTE, buffer: { type: 'storage' } },
      { binding: 4, visibility: STAGE.COMPUTE, buffer: { type: 'storage' } },
      { binding: 5, visibility: STAGE.COMPUTE, buffer: { type: 'storage' } },
      { binding: 6, visibility: STAGE.COMPUTE, buffer: { type: 'storage' } },
      { binding: 7, visibility: STAGE.COMPUTE, buffer: { type: 'storage' } },
      { binding: 8, visibility: STAGE.COMPUTE, buffer: { type: 'storage' } },
    ],
  })
  const computeLayout = device.createPipelineLayout({ bindGroupLayouts: [computeBGL] })
  const computeMod = device.createShaderModule({ code: COMPUTE_WGSL })
  const cpipe = (entryPoint: string) => device.createComputePipeline({ layout: computeLayout, compute: { module: computeMod, entryPoint } })
  const forcesPipe = cpipe('forcesStats')
  const transmitPipe = cpipe('transmission')
  const integratePipe = cpipe('integrate')
  const computeBind = device.createBindGroup({
    layout: computeBGL,
    entries: [
      { binding: 0, resource: { buffer: paramsBuf } },
      { binding: 1, resource: { buffer: genomeInBuf } },
      { binding: 2, resource: { buffer: genomeOutBuf } },
      { binding: 3, resource: { buffer: posBuf } },
      { binding: 4, resource: { buffer: velBuf } },
      { binding: 5, resource: { buffer: newVelBuf } },
      { binding: 6, resource: { buffer: fpBuf } },
      { binding: 7, resource: { buffer: colliderBuf } },
      { binding: 8, resource: { buffer: metricBuf } },
    ],
  })

  const renderMod = device.createShaderModule({ code: RENDER_WGSL })
  const target = (blend: GPUBlendState) => ({ targets: [{ format, blend }] })
  const renderBGL = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: STAGE.VERTEX, buffer: { type: 'uniform' } },
      { binding: 1, visibility: STAGE.VERTEX, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: STAGE.VERTEX, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: STAGE.VERTEX, buffer: { type: 'read-only-storage' } },
      { binding: 4, visibility: STAGE.VERTEX, buffer: { type: 'read-only-storage' } }, // prevGenome (colour interp)
    ],
  })
  const renderLayout = device.createPipelineLayout({ bindGroupLayouts: [renderBGL] })
  const fadeBGL = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: STAGE.FRAGMENT, buffer: { type: 'uniform' } }] })
  const fadeLayout = device.createPipelineLayout({ bindGroupLayouts: [fadeBGL] })
  const haloPipe = device.createRenderPipeline({
    layout: renderLayout, vertex: { module: renderMod, entryPoint: 'vs_halo' },
    fragment: { module: renderMod, entryPoint: 'fs_halo', ...target(ADDITIVE_BLEND) }, primitive: { topology: 'triangle-list' },
  })
  const corePipe = device.createRenderPipeline({
    layout: renderLayout, vertex: { module: renderMod, entryPoint: 'vs_core' },
    fragment: { module: renderMod, entryPoint: 'fs_core', ...target(ALPHA_BLEND) }, primitive: { topology: 'triangle-list' },
  })
  const fadePipe = device.createRenderPipeline({
    layout: fadeLayout, vertex: { module: renderMod, entryPoint: 'vs_fullscreen' },
    fragment: { module: renderMod, entryPoint: 'fs_fade', ...target(ALPHA_BLEND) }, primitive: { topology: 'triangle-list' },
  })
  const renderBind = device.createBindGroup({
    layout: renderBGL,
    entries: [
      { binding: 0, resource: { buffer: viewBuf } },
      { binding: 1, resource: { buffer: posBuf } },
      { binding: 2, resource: { buffer: prevPosBuf } },
      { binding: 3, resource: { buffer: genomeInBuf } },
      { binding: 4, resource: { buffer: prevGenomeBuf } },
    ],
  })
  const fadeBind = device.createBindGroup({ layout: fadeBGL, entries: [{ binding: 0, resource: { buffer: fadeBuf } }] })

  const texW = Math.max(1, size.width)
  const texH = Math.max(1, size.height)
  const accum = makeAccum(device, format, texW, texH)

  const bloomSampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' })
  const bloomBGL = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: STAGE.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 1, visibility: STAGE.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 2, visibility: STAGE.FRAGMENT, buffer: { type: 'uniform' } },
    ],
  })
  const compBGL = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: STAGE.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 1, visibility: STAGE.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 2, visibility: STAGE.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 3, visibility: STAGE.FRAGMENT, buffer: { type: 'uniform' } },
    ],
  })
  const bloomLayout = device.createPipelineLayout({ bindGroupLayouts: [bloomBGL] })
  const compLayout = device.createPipelineLayout({ bindGroupLayouts: [compBGL] })
  const fs = (entryPoint: string, layout: GPUPipelineLayout) => device.createRenderPipeline({
    layout, vertex: { module: renderMod, entryPoint: 'vs_fullscreen' },
    fragment: { module: renderMod, entryPoint, targets: [{ format }] }, primitive: { topology: 'triangle-list' },
  })
  const brightPipe = fs('fs_bright', bloomLayout)
  const blurPipe = fs('fs_blur', bloomLayout)
  const compositePipe = fs('fs_composite', compLayout)
  const brightBuf = mk(32, U), blurHBuf = mk(32, U), blurVBuf = mk(32, U), compBuf = mk(16, U)
  const { bw, bh } = bloomDims(texW, texH)
  const bloomA = makeBloomTex(device, format, bw, bh)
  const bloomB = makeBloomTex(device, format, bw, bh)

  const res: GpuResources = {
    device, ctx, format, count, dpr, arenaW, arenaH, worldMin: cfg.worldMin,
    paramsBuf, viewBuf, fadeBuf, genomeInBuf, genomeOutBuf, prevGenomeBuf, posBuf, prevPosBuf, velBuf, newVelBuf, fpBuf, colliderBuf, metricBuf,
    forcesPipe, transmitPipe, integratePipe, computeBind, haloPipe, corePipe, fadePipe, renderBind, fadeBind,
    accum, accumView: accum.createView(), texW, texH, needsClear: true, bg: { r: 0, g: 0, b: 0 }, step: 0,
    stepScratch: new Uint32Array(1), alphaScratch: new Float32Array(1),
    bloomSampler, bloomBGL, compBGL, brightPipe, blurPipe, compositePipe,
    brightBuf, blurHBuf, blurVBuf, compBuf,
    bloomA, bloomB, bloomAView: bloomA.createView(), bloomBView: bloomB.createView(),
    brightBind: null as unknown as GPUBindGroup, blurHBind: null as unknown as GPUBindGroup,
    blurVBind: null as unknown as GPUBindGroup, compBind: null as unknown as GPUBindGroup,
    bloomW: bw, bloomH: bh,
  }
  buildBloomBinds(res)
  writeBloom(res)
  writeFade(res, cfg)
  return res
}

export function writeFade(res: GpuResources, cfg: SwarmChemistryConfig): void {
  res.bg = parseBg(cfg.background)
  const alpha = cfg.trailFade > 0 ? 1 - cfg.trailFade : 1
  res.device.queue.writeBuffer(res.fadeBuf, 0, new Float32Array([res.bg.r, res.bg.g, res.bg.b, alpha]))
}

/** Live-apply the cheap evolution/physics params (collision/mutation/competition/evolve). */
export function writeParams(res: GpuResources, cfg: SwarmChemistryConfig): void {
  res.device.queue.writeBuffer(res.paramsBuf, 0, packParams(cfg, res.arenaW, res.arenaH, res.step))
}
export function writeView(
  res: GpuResources, cfg: SwarmChemistryConfig, size: { width: number; height: number }, cam: Camera,
): void {
  res.device.queue.writeBuffer(res.viewBuf, 0, packView(cfg, size, res.dpr, cam, res.arenaW, res.arenaH))
}

export function resizeGPU(
  res: GpuResources, cfg: SwarmChemistryConfig, size: { width: number; height: number }, cam: Camera,
): void {
  const { w, h } = arenaDims(res.worldMin, size)
  res.arenaW = w; res.arenaH = h
  res.device.queue.writeBuffer(res.paramsBuf, 0, packParams(cfg, w, h, res.step))
  writeView(res, cfg, size, cam)
  const pw = Math.max(1, size.width), ph = Math.max(1, size.height)
  if (pw === res.texW && ph === res.texH) return
  res.accum.destroy()
  res.accum = makeAccum(res.device, res.format, pw, ph)
  res.accumView = res.accum.createView()
  res.texW = pw; res.texH = ph
  res.needsClear = true
  const { bw, bh } = bloomDims(pw, ph)
  res.bloomA.destroy(); res.bloomB.destroy()
  res.bloomA = makeBloomTex(res.device, res.format, bw, bh)
  res.bloomB = makeBloomTex(res.device, res.format, bw, bh)
  res.bloomAView = res.bloomA.createView()
  res.bloomBView = res.bloomB.createView()
  res.bloomW = bw; res.bloomH = bh
  writeBloom(res)
  buildBloomBinds(res)
}

/** Advance `steps` sim steps then composite one frame. `alpha` = fractional progress
 *  toward the next step (render interpolation → smooth slow playback). */
export function runFrame(res: GpuResources, cfg: SwarmChemistryConfig, steps: number, alpha: number): void {
  if (steps > 0) {
    res.step = (res.step + 1) >>> 0
    res.stepScratch[0] = res.step
    res.device.queue.writeBuffer(res.paramsBuf, 16, res.stepScratch)
  }
  res.alphaScratch[0] = Math.max(0, Math.min(1, alpha))
  res.device.queue.writeBuffer(res.viewBuf, 28, res.alphaScratch)

  const enc = res.device.createCommandEncoder()
  const groups = Math.ceil(res.count / WORKGROUP)
  const posBytes = res.count * 2 * 4
  const genomeBytes = res.count * GENOME * 4
  const pass = (pipe: GPUComputePipeline) => {
    const p = enc.beginComputePass()
    p.setPipeline(pipe); p.setBindGroup(0, res.computeBind); p.dispatchWorkgroups(groups); p.end()
  }
  for (let s = 0; s < steps; s++) {
    // snapshot pre-step position + genome so the render interpolates BOTH (motion + colour)
    enc.copyBufferToBuffer(res.posBuf, 0, res.prevPosBuf, 0, posBytes)
    enc.copyBufferToBuffer(res.genomeInBuf, 0, res.prevGenomeBuf, 0, genomeBytes)
    pass(res.forcesPipe)
    pass(res.transmitPipe)
    pass(res.integratePipe)
  }

  const rp = enc.beginRenderPass({
    colorAttachments: [{
      view: res.accumView,
      loadOp: res.needsClear ? 'clear' : 'load',
      clearValue: { r: res.bg.r, g: res.bg.g, b: res.bg.b, a: 1 },
      storeOp: 'store',
    }],
  })
  if (!res.needsClear) { rp.setPipeline(res.fadePipe); rp.setBindGroup(0, res.fadeBind); rp.draw(3) }
  res.needsClear = false
  if (cfg.glow) { rp.setPipeline(res.haloPipe); rp.setBindGroup(0, res.renderBind); rp.draw(6, res.count) }
  rp.setPipeline(res.corePipe); rp.setBindGroup(0, res.renderBind); rp.draw(6, res.count)
  rp.end()

  const swap = res.ctx.getCurrentTexture()
  if (cfg.bloom) {
    const fsPass = (view: GPUTextureView, pipe: GPURenderPipeline, bind: GPUBindGroup) => {
      const p = enc.beginRenderPass({ colorAttachments: [{ view, loadOp: 'clear', clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: 'store' }] })
      p.setPipeline(pipe); p.setBindGroup(0, bind); p.draw(3); p.end()
    }
    fsPass(res.bloomAView, res.brightPipe, res.brightBind)
    fsPass(res.bloomBView, res.blurPipe, res.blurHBind)
    fsPass(res.bloomAView, res.blurPipe, res.blurVBind)
    fsPass(swap.createView(), res.compositePipe, res.compBind)
  } else {
    enc.copyTextureToTexture({ texture: res.accum }, { texture: swap }, [res.texW, res.texH])
  }
  res.device.queue.submit([enc.finish()])
}

export function disposeGPU(res: GpuResources): void {
  // NB: never res.device.destroy() — the device is the shared framework singleton.
  for (const b of [res.paramsBuf, res.viewBuf, res.fadeBuf, res.genomeInBuf, res.genomeOutBuf, res.prevGenomeBuf, res.posBuf, res.prevPosBuf,
    res.velBuf, res.newVelBuf, res.fpBuf, res.colliderBuf, res.metricBuf,
    res.brightBuf, res.blurHBuf, res.blurVBuf, res.compBuf]) {
    b.destroy()
  }
  res.accum.destroy()
  res.bloomA.destroy()
  res.bloomB.destroy()
}
