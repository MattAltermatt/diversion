// gpu.ts — the WebGPU compute + render for Swarmalators. WGSL sources live here as
// template strings (repo convention, cf. particle-life-gpu/gpu.ts, grayscott/gl.ts).
//
// COMPUTE: two passes per step — `forces` (read a position+phase snapshot for every OTHER
// particle, write each one's OWN new velocity + phase-velocity) then `integrate` (advance
// each particle's OWN position + phase). Each pass writes only invocation i's own slot and
// `forces` never writes the pos/phase it reads, so the in-place storage buffers have NO
// cross-invocation hazard — no ping-pong. The pass boundary is the sync point. This is the
// canonical O'Keeffe–Hong–Strogatz model: FREE SPACE (no wrap), FIRST-ORDER (velocity IS
// the force sum), softened 1/r & 1/r² denominators so fixed-step Euler never NaNs.
//
// RENDER: instanced vertex-pulled quads (no vertex buffers) into a PERSISTENT accumulation
// texture so trails work (the swapchain rotates textures, so loadOp:'load' on
// getCurrentTexture() is not reliably last frame — we own the accum surface and
// copyTextureToTexture it to the swapchain). Colour is per-particle FROM PHASE via a cyclic
// colormap in the fragment shader (no per-species palette buffer). Two-layer glow (additive
// halo under opaque core) carries the gallery look (gotcha-additive-glow-blowout-two-layer).
import {
  seedWorld, packParams, packView, parseBg, DEFAULT_CAMERA,
  PARAMS_SIZE, VIEW_SIZE, type Camera,
} from './pack'
import type { SwarmalatorsConfig } from './schema'

const WORKGROUP = 64

// WebGPU usage-flag bit values are frozen by the W3C spec; the bundled TS lib.dom ships the
// interfaces but not these value namespaces, so we spell the bits out locally (same as
// particle-life-gpu — avoids an @webgpu/types dependency that duplicates lib.dom).
const BUF = { UNIFORM: 0x40, STORAGE: 0x80, COPY_DST: 0x08 } as const
const TEX = { COPY_SRC: 0x01, COPY_DST: 0x02, RENDER_ATTACHMENT: 0x10 } as const
const STAGE = { VERTEX: 0x1, FRAGMENT: 0x2, COMPUTE: 0x4 } as const

const COMPUTE_WGSL = /* wgsl */ `
struct Params { n: u32, invN: f32, jj: f32, kk: f32, dt: f32, eps: f32, omegaSpread: f32 }
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read>       omega:     array<f32>;
@group(0) @binding(2) var<storage, read_write> positions: array<vec2f>;
@group(0) @binding(3) var<storage, read_write> phases:    array<f32>;
@group(0) @binding(4) var<storage, read_write> vel:       array<vec2f>;
@group(0) @binding(5) var<storage, read_write> phaseVel:  array<f32>;

const PI  = 3.14159265359;
const TAU = 6.28318530718;

@compute @workgroup_size(${WORKGROUP})
fn forces(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= params.n) { return; }
  let pi = positions[i];
  let thi = phases[i];
  var f = vec2f(0.0, 0.0);
  var fth = 0.0;
  for (var j: u32 = 0u; j < params.n; j = j + 1u) {
    if (j == i) { continue; }
    let d = positions[j] - pi;
    let r = max(length(d), params.eps);                          // softened → no NaN at r→0
    let dth = phases[j] - thi;
    let a = (1.0 + params.jj * cos(dth)) / r - 1.0 / (r * r);    // 1/r attract, 1/r² repel
    f = f + d * a;
    fth = fth + sin(dth) / r;
  }
  vel[i] = f * params.invN;
  phaseVel[i] = omega[i] * params.omegaSpread + params.kk * params.invN * fth;
}

@compute @workgroup_size(${WORKGROUP})
fn integrate(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= params.n) { return; }
  positions[i] = positions[i] + vel[i] * params.dt;              // NO wrap — free space
  let th = phases[i] + phaseVel[i] * params.dt;
  phases[i] = th - TAU * floor((th + PI) / TAU);                 // wrap phase to [-PI,PI)
}
`

const RENDER_WGSL = /* wgsl */ `
struct View { scale: f32, cx: f32, cy: f32, viewW: f32, viewH: f32, coreR: f32, haloR: f32, colorMap: u32 }
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<storage, read> positions: array<vec2f>;
@group(0) @binding(2) var<storage, read> phases:    array<f32>;

const PI  = 3.14159265359;
const TAU = 6.28318530718;
const CORNERS = array<vec2f, 6>(
  vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
  vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
);

struct VSOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) @interpolate(flat) hue: f32 }

fn buildVertex(vi: u32, ii: u32, radius: f32) -> VSOut {
  let corner = CORNERS[vi];
  let wp = positions[ii];
  // origin-centred world → screen (y down); the swarm is centred so a fixed fit shows all.
  let sx = view.viewW * 0.5 + (wp.x - view.cx) * view.scale + corner.x * radius;
  let sy = view.viewH * 0.5 - (wp.y - view.cy) * view.scale + corner.y * radius;
  var out: VSOut;
  out.pos = vec4f(sx / view.viewW * 2.0 - 1.0, 1.0 - sy / view.viewH * 2.0, 0.0, 1.0);
  out.uv = corner;
  out.hue = phases[ii];
  return out;
}
@vertex fn vs_core(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VSOut { return buildVertex(vi, ii, view.coreR); }
@vertex fn vs_halo(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VSOut { return buildVertex(vi, ii, view.haloR); }

// --- phase → rgb (cyclic; 0 and 2π map identically so there is no seam) ---
fn oklchToRgb(L: f32, C: f32, h: f32) -> vec3f {
  let a = C * cos(h); let b = C * sin(h);
  let l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  let m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  let s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  let l = l_ * l_ * l_; let m = m_ * m_ * m_; let s = s_ * s_ * s_;
  var rgb = vec3f(
     4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
  rgb = clamp(rgb, vec3f(0.0), vec3f(1.0));
  return select(1.055 * pow(rgb, vec3f(1.0 / 2.4)) - vec3f(0.055), rgb * 12.92, rgb <= vec3f(0.0031308)); // linear→sRGB
}
fn sinebow(t: f32) -> vec3f {
  let x = t + 0.5;
  return vec3f(pow(sin(PI * x), 2.0), pow(sin(PI * (x + 1.0 / 3.0)), 2.0), pow(sin(PI * (x + 2.0 / 3.0)), 2.0));
}
fn phaseColor(theta: f32, map: u32) -> vec3f {
  let h = theta + PI;           // [-PI,PI) → [0,TAU)
  let t = h / TAU;              // [0,1)
  if (map == 1u) { return sinebow(t); }
  if (map == 2u) { return oklchToRgb(0.85, 0.07, h); }  // Pastel: light, low chroma
  return oklchToRgb(0.72, 0.13, h);                     // Spectrum (default)
}

// opaque-ish core: solid to ~0.72 of the quad, soft antialiased edge
@fragment fn fs_core(in: VSOut) -> @location(0) vec4f {
  let d = length(in.uv);
  let a = 1.0 - smoothstep(0.72, 1.0, d);
  if (a <= 0.001) { discard; }
  return vec4f(phaseColor(in.hue, view.colorMap), a);
}
// additive halo: gentle radial falloff (low peak so overlaps bloom, don't clip white)
@fragment fn fs_halo(in: VSOut) -> @location(0) vec4f {
  let d = clamp(length(in.uv), 0.0, 1.0);
  let a = 0.5 * pow(1.0 - d, 2.2);
  return vec4f(phaseColor(in.hue, view.colorMap) * a, a);
}

// fullscreen trail-fade: paint bg at alpha (1-trailFade) over the accumulation tex
struct Fade { r: f32, g: f32, b: f32, a: f32 }
@group(0) @binding(0) var<uniform> fade: Fade;
const FS = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
@vertex fn vs_fullscreen(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f { return vec4f(FS[vi], 0.0, 1.0); }
@fragment fn fs_fade() -> @location(0) vec4f { return vec4f(fade.r, fade.g, fade.b, fade.a); }
`

export interface GpuResources {
  device: GPUDevice
  ctx: GPUCanvasContext
  format: GPUTextureFormat
  count: number
  dpr: number
  // buffers
  paramsBuf: GPUBuffer
  viewBuf: GPUBuffer
  fadeBuf: GPUBuffer
  omegaBuf: GPUBuffer
  posBuf: GPUBuffer
  phaseBuf: GPUBuffer
  velBuf: GPUBuffer
  phaseVelBuf: GPUBuffer
  // pipelines + bind groups
  forcesPipe: GPUComputePipeline
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
  return device.createTexture({
    size: [Math.max(1, w), Math.max(1, h)],
    format,
    usage: TEX.RENDER_ATTACHMENT | TEX.COPY_SRC,
  })
}

export function initGPU(
  device: GPUDevice,
  ctx: GPUCanvasContext,
  format: GPUTextureFormat,
  cfg: SwarmalatorsConfig,
  size: { width: number; height: number },
  dpr: number,
): GpuResources {
  ctx.configure({ device, format, alphaMode: 'opaque', usage: TEX.RENDER_ATTACHMENT | TEX.COPY_DST })

  const count = cfg.count
  const world = seedWorld(count, cfg.seed)

  const mk = (bytes: number, usage: number) => device.createBuffer({ size: bytes, usage })
  const S = BUF.STORAGE | BUF.COPY_DST
  const U = BUF.UNIFORM | BUF.COPY_DST

  const posBuf = mk(count * 2 * 4, S)
  const phaseBuf = mk(count * 4, S)
  const velBuf = mk(count * 2 * 4, S)
  const phaseVelBuf = mk(count * 4, S)
  const omegaBuf = mk(count * 4, S)
  const paramsBuf = mk(PARAMS_SIZE, U)
  const viewBuf = mk(VIEW_SIZE, U)
  const fadeBuf = mk(16, U)

  device.queue.writeBuffer(posBuf, 0, world.pos)
  device.queue.writeBuffer(phaseBuf, 0, world.phase)
  device.queue.writeBuffer(velBuf, 0, world.vel)
  device.queue.writeBuffer(phaseVelBuf, 0, world.phaseVel)
  device.queue.writeBuffer(omegaBuf, 0, world.omega)
  device.queue.writeBuffer(paramsBuf, 0, packParams(cfg))
  device.queue.writeBuffer(viewBuf, 0, packView(cfg, size, dpr, DEFAULT_CAMERA))

  // Explicit shared layouts: `forces`/`integrate` touch different subsets of the bindings,
  // so `layout:'auto'` would give each an incompatible auto-layout and one bind group can't
  // drive both (the particle-life-gpu gotcha). Same for the halo/core render pair.
  const computeBGL = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: STAGE.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: STAGE.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: STAGE.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: STAGE.COMPUTE, buffer: { type: 'storage' } },
      { binding: 4, visibility: STAGE.COMPUTE, buffer: { type: 'storage' } },
      { binding: 5, visibility: STAGE.COMPUTE, buffer: { type: 'storage' } },
    ],
  })
  const computeLayout = device.createPipelineLayout({ bindGroupLayouts: [computeBGL] })
  const computeMod = device.createShaderModule({ code: COMPUTE_WGSL })
  const forcesPipe = device.createComputePipeline({ layout: computeLayout, compute: { module: computeMod, entryPoint: 'forces' } })
  const integratePipe = device.createComputePipeline({ layout: computeLayout, compute: { module: computeMod, entryPoint: 'integrate' } })
  const computeBind = device.createBindGroup({
    layout: computeBGL,
    entries: [
      { binding: 0, resource: { buffer: paramsBuf } },
      { binding: 1, resource: { buffer: omegaBuf } },
      { binding: 2, resource: { buffer: posBuf } },
      { binding: 3, resource: { buffer: phaseBuf } },
      { binding: 4, resource: { buffer: velBuf } },
      { binding: 5, resource: { buffer: phaseVelBuf } },
    ],
  })

  const renderMod = device.createShaderModule({ code: RENDER_WGSL })
  const target = (blend: GPUBlendState) => ({ targets: [{ format, blend }] })
  const renderBGL = device.createBindGroupLayout({
    entries: [
      // binding 0 (view) is read in BOTH stages: vertex places the quad, fragment reads
      // view.colorMap to pick the phase→colour wheel. (Particle Life's fragments never
      // touch `view`, so its layout is vertex-only — ours must add FRAGMENT.)
      { binding: 0, visibility: STAGE.VERTEX | STAGE.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: STAGE.VERTEX, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: STAGE.VERTEX, buffer: { type: 'read-only-storage' } },
    ],
  })
  const renderLayout = device.createPipelineLayout({ bindGroupLayouts: [renderBGL] })
  const fadeBGL = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: STAGE.FRAGMENT, buffer: { type: 'uniform' } }],
  })
  const fadeLayout = device.createPipelineLayout({ bindGroupLayouts: [fadeBGL] })
  const haloPipe = device.createRenderPipeline({
    layout: renderLayout,
    vertex: { module: renderMod, entryPoint: 'vs_halo' },
    fragment: { module: renderMod, entryPoint: 'fs_halo', ...target(ADDITIVE_BLEND) },
    primitive: { topology: 'triangle-list' },
  })
  const corePipe = device.createRenderPipeline({
    layout: renderLayout,
    vertex: { module: renderMod, entryPoint: 'vs_core' },
    fragment: { module: renderMod, entryPoint: 'fs_core', ...target(ALPHA_BLEND) },
    primitive: { topology: 'triangle-list' },
  })
  const fadePipe = device.createRenderPipeline({
    layout: fadeLayout,
    vertex: { module: renderMod, entryPoint: 'vs_fullscreen' },
    fragment: { module: renderMod, entryPoint: 'fs_fade', ...target(ALPHA_BLEND) },
    primitive: { topology: 'triangle-list' },
  })
  const renderBind = device.createBindGroup({
    layout: renderBGL,
    entries: [
      { binding: 0, resource: { buffer: viewBuf } },
      { binding: 1, resource: { buffer: posBuf } },
      { binding: 2, resource: { buffer: phaseBuf } },
    ],
  })
  const fadeBind = device.createBindGroup({
    layout: fadeBGL,
    entries: [{ binding: 0, resource: { buffer: fadeBuf } }],
  })

  const texW = Math.max(1, size.width)
  const texH = Math.max(1, size.height)
  const accum = makeAccum(device, format, texW, texH)

  const res: GpuResources = {
    device, ctx, format, count, dpr,
    paramsBuf, viewBuf, fadeBuf, omegaBuf, posBuf, phaseBuf, velBuf, phaseVelBuf,
    forcesPipe, integratePipe, computeBind, haloPipe, corePipe, fadePipe, renderBind, fadeBind,
    accum, accumView: accum.createView(), texW, texH, needsClear: true,
    bg: { r: 0, g: 0, b: 0 },
  }
  writeFade(res, cfg)
  return res
}

/** bg + trail-fade alpha into the fade uniform, and cache bg for the clear value. */
export function writeFade(res: GpuResources, cfg: SwarmalatorsConfig): void {
  res.bg = parseBg(cfg.background)
  const alpha = cfg.trailFade > 0 ? 1 - cfg.trailFade : 1
  res.device.queue.writeBuffer(res.fadeBuf, 0, new Float32Array([res.bg.r, res.bg.g, res.bg.b, alpha]))
}

/** Live-apply the cheap uniforms without reallocating buffers. */
export function writeParams(res: GpuResources, cfg: SwarmalatorsConfig): void {
  res.device.queue.writeBuffer(res.paramsBuf, 0, packParams(cfg))
}
export function writeView(
  res: GpuResources, cfg: SwarmalatorsConfig, size: { width: number; height: number }, cam: Camera,
): void {
  res.device.queue.writeBuffer(res.viewBuf, 0, packView(cfg, size, res.dpr, cam))
}

/** Resize: repack the view mapping and recreate the accumulation texture to match the new
 *  swapchain size (copyTextureToTexture needs identical dimensions). */
export function resizeGPU(
  res: GpuResources, cfg: SwarmalatorsConfig, size: { width: number; height: number }, cam: Camera,
): void {
  writeView(res, cfg, size, cam)
  const w = Math.max(1, size.width), h = Math.max(1, size.height)
  if (w === res.texW && h === res.texH) return
  res.accum.destroy()
  res.accum = makeAccum(res.device, res.format, w, h)
  res.accumView = res.accum.createView()
  res.texW = w
  res.texH = h
  res.needsClear = true
}

/** Advance `steps` sim steps then composite one frame. One command encoder, one submit.
 *  `steps` may be 0 (a paused repaint still re-composites the accum tex). */
export function runFrame(res: GpuResources, cfg: SwarmalatorsConfig, steps: number): void {
  const enc = res.device.createCommandEncoder()
  const groups = Math.ceil(res.count / WORKGROUP)
  for (let s = 0; s < steps; s++) {
    const fp = enc.beginComputePass()
    fp.setPipeline(res.forcesPipe); fp.setBindGroup(0, res.computeBind); fp.dispatchWorkgroups(groups); fp.end()
    const ip = enc.beginComputePass()
    ip.setPipeline(res.integratePipe); ip.setBindGroup(0, res.computeBind); ip.dispatchWorkgroups(groups); ip.end()
  }

  const pass = enc.beginRenderPass({
    colorAttachments: [{
      view: res.accumView,
      loadOp: res.needsClear ? 'clear' : 'load',
      clearValue: { r: res.bg.r, g: res.bg.g, b: res.bg.b, a: 1 },
      storeOp: 'store',
    }],
  })
  if (!res.needsClear) {
    pass.setPipeline(res.fadePipe); pass.setBindGroup(0, res.fadeBind); pass.draw(3)
  }
  res.needsClear = false
  if (cfg.glow) { pass.setPipeline(res.haloPipe); pass.setBindGroup(0, res.renderBind); pass.draw(6, res.count) }
  pass.setPipeline(res.corePipe); pass.setBindGroup(0, res.renderBind); pass.draw(6, res.count)
  pass.end()

  const swap = res.ctx.getCurrentTexture()
  enc.copyTextureToTexture({ texture: res.accum }, { texture: swap }, [res.texW, res.texH])
  res.device.queue.submit([enc.finish()])
}

export function disposeGPU(res: GpuResources): void {
  // NB: never res.device.destroy() — the device is the shared framework singleton.
  for (const b of [res.paramsBuf, res.viewBuf, res.fadeBuf, res.omegaBuf, res.posBuf, res.phaseBuf, res.velBuf, res.phaseVelBuf]) {
    b.destroy()
  }
  res.accum.destroy()
}
