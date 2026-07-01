// gpu.ts — the WebGPU compute + render for Particle Life. WGSL sources live here as
// template strings (this repo's convention, cf. grayscott/gl.ts, neural-ca/gl.ts).
//
// COMPUTE: two passes per step — `forces` (read a position snapshot for every
// neighbour, write each particle's OWN new velocity) then `integrate` (advance each
// particle's OWN position, toroidal wrap). Because each pass writes only invocation
// i's own slot of the buffer it mutates — and the forces pass never writes the
// positions it reads — the two in-place storage buffers have NO cross-invocation
// hazard, exactly mirroring the CPU sim's order-independent two-pass structure. No
// ping-pong needed. The pass boundary (end one compute pass before the next) is the
// spec-guaranteed sync point between "everyone's velocity is updated" and "now move".
// This is the all-pairs O(n²) MVP; grid-binning for ≥100K is a tracked follow-up (#192).
//
// RENDER: particles are instanced vertex-pulled quads (no vertex buffers — corners
// come from @builtin(vertex_index), centre/colour from the compute storage buffers
// via @builtin(instance_index)), drawn into a PERSISTENT accumulation texture so
// trails work: a webgpu canvas rotates 2-3 swapchain textures, so loadOp:'load'
// against getCurrentTexture() is NOT reliably last frame's pixels — we own the
// accumulation surface and copyTextureToTexture() it to the swapchain each frame.
// Two-layer glow (additive halos under opaque cores) carries over the CPU look so
// hue survives density (gotcha-additive-glow-blowout-two-layer).
import { parseHex6 } from '../../framework/color'
import {
  seedWorld, packColors, packParams, packView, worldDims, DEFAULT_CAMERA, resolveMatrix,
  PARAMS_SIZE, VIEW_SIZE, type SeededWorld, type Camera,
} from './pack'
import type { ParticleLifeGpuConfig } from './schema'
import type { Symmetry } from '../particle-life/matrix'
import type { PaletteName } from '../particle-life/palette'

const WORKGROUP = 64

// WebGPU usage-flag bit values are frozen by the W3C spec (changing them would break
// the web). The bundled TS lib.dom ships the WebGPU *interfaces* but not these value
// namespaces, so we spell the bits out locally instead of adding an @webgpu/types
// dependency that would duplicate the lib's interface declarations.
const BUF = { UNIFORM: 0x40, STORAGE: 0x80, COPY_DST: 0x08 } as const
const TEX = { COPY_SRC: 0x01, COPY_DST: 0x02, RENDER_ATTACHMENT: 0x10 } as const
const STAGE = { VERTEX: 0x1, FRAGMENT: 0x2, COMPUTE: 0x4 } as const

const COMPUTE_WGSL = /* wgsl */ `
struct Params {
  n: u32, nColors: u32,
  rMax: f32, beta: f32, forceMul: f32, frictionFactor: f32, dt: f32,
  worldW: f32, worldH: f32,
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> species: array<u32>;
@group(0) @binding(2) var<storage, read> matrix: array<f32>;
@group(0) @binding(3) var<storage, read_write> positions: array<vec2f>;
@group(0) @binding(4) var<storage, read_write> velocities: array<vec2f>;

fn wrapDelta(d: f32, size: f32) -> f32 {
  let half = size * 0.5;
  if (d > half) { return d - size; }
  if (d < -half) { return d + size; }
  return d;
}
// exact port of force.ts
fn force(q: f32, a: f32, beta: f32) -> f32 {
  if (q < beta) { return q / beta - 1.0; }
  if (q < 1.0) { return a * (1.0 - abs(2.0 * q - 1.0 - beta) / (1.0 - beta)); }
  return 0.0;
}

@compute @workgroup_size(${WORKGROUP})
fn forces(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= params.n) { return; }
  let pi = positions[i];
  let ti = species[i];
  let r2 = params.rMax * params.rMax;
  var fx = 0.0;
  var fy = 0.0;
  for (var j: u32 = 0u; j < params.n; j = j + 1u) {
    if (j == i) { continue; }
    let dx = wrapDelta(positions[j].x - pi.x, params.worldW);
    let dy = wrapDelta(positions[j].y - pi.y, params.worldH);
    let d2 = dx * dx + dy * dy;
    if (d2 <= 0.0 || d2 > r2) { continue; }
    let dist = sqrt(d2);
    let a = matrix[ti * params.nColors + species[j]];
    let inv = force(dist / params.rMax, a, params.beta) / dist;
    fx = fx + dx * inv;
    fy = fy + dy * inv;
  }
  let v = velocities[i];
  velocities[i] = vec2f(
    v.x * params.frictionFactor + fx * params.forceMul * params.dt,
    v.y * params.frictionFactor + fy * params.forceMul * params.dt,
  );
}

@compute @workgroup_size(${WORKGROUP})
fn integrate(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= params.n) { return; }
  var p = positions[i] + velocities[i] * params.dt;
  p.x = p.x - floor(p.x / params.worldW) * params.worldW;
  p.y = p.y - floor(p.y / params.worldH) * params.worldH;
  positions[i] = p;
}
`

const RENDER_WGSL = /* wgsl */ `
struct View {
  scale: f32, viewCx: f32, viewCy: f32, worldW: f32, worldH: f32,
  viewW: f32, viewH: f32, coreR: f32, haloR: f32,
}
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<storage, read> positions: array<vec2f>;
@group(0) @binding(2) var<storage, read> species: array<u32>;
@group(0) @binding(3) var<storage, read> colors: array<vec4f>;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) color: vec4f,
}

const CORNERS = array<vec2f, 6>(
  vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
  vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
);

fn buildVertex(vi: u32, ii: u32, radius: f32) -> VSOut {
  let corner = CORNERS[vi];
  let wp = positions[ii];
  // true positions relative to the view centre — the arena has HARD borders. The
  // camera is clamped to the world bounds (zoom >= cover-fit, pan inside the arena),
  // so nothing outside the world is ever shown and no wrap bleeds across an edge.
  let dx = wp.x - view.viewCx;
  let dy = wp.y - view.viewCy;
  let sx = view.viewW * 0.5 + dx * view.scale + corner.x * radius;
  let sy = view.viewH * 0.5 + dy * view.scale + corner.y * radius;
  var out: VSOut;
  out.pos = vec4f(sx / view.viewW * 2.0 - 1.0, 1.0 - sy / view.viewH * 2.0, 0.0, 1.0);
  out.uv = corner;
  out.color = colors[species[ii]];
  return out;
}
@vertex fn vs_core(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VSOut {
  return buildVertex(vi, ii, view.coreR);
}
@vertex fn vs_halo(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VSOut {
  return buildVertex(vi, ii, view.haloR);
}

// opaque-ish core: solid to ~0.8 of the quad, soft antialiased edge
@fragment fn fs_core(in: VSOut) -> @location(0) vec4f {
  let d = length(in.uv);
  let a = 1.0 - smoothstep(0.72, 1.0, d);
  if (a <= 0.001) { discard; }
  return vec4f(in.color.rgb, a);
}
// additive halo: gentle radial falloff (low peak so overlaps bloom, don't clip white)
@fragment fn fs_halo(in: VSOut) -> @location(0) vec4f {
  let d = clamp(length(in.uv), 0.0, 1.0);
  let a = 0.5 * pow(1.0 - d, 2.2);
  return vec4f(in.color.rgb * a, a);
}

// fullscreen trail-fade: paint bg at alpha (1-trailFade) over the accumulation tex
struct Fade { r: f32, g: f32, b: f32, a: f32 }
@group(0) @binding(0) var<uniform> fade: Fade;
const FS = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
@vertex fn vs_fullscreen(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  return vec4f(FS[vi], 0.0, 1.0);
}
@fragment fn fs_fade() -> @location(0) vec4f {
  return vec4f(fade.r, fade.g, fade.b, fade.a);
}
`

export interface GpuResources {
  device: GPUDevice
  ctx: GPUCanvasContext
  format: GPUTextureFormat
  count: number
  colors: number
  dpr: number
  worldW: number
  worldH: number
  // buffers
  paramsBuf: GPUBuffer
  viewBuf: GPUBuffer
  fadeBuf: GPUBuffer
  speciesBuf: GPUBuffer
  matrixBuf: GPUBuffer
  posBuf: GPUBuffer
  velBuf: GPUBuffer
  colorBuf: GPUBuffer
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
  cfg: ParticleLifeGpuConfig,
  size: { width: number; height: number },
  dpr: number,
): GpuResources {
  ctx.configure({ device, format, alphaMode: 'opaque', usage: TEX.RENDER_ATTACHMENT | TEX.COPY_DST })

  const count = cfg.count
  const colors = cfg.colors
  const { w: worldW, h: worldH } = worldDims(cfg.worldSize)
  const world: SeededWorld = seedWorld(count, colors, cfg.seed, worldW, worldH)
  const matrix = resolveMatrix({ ...cfg, symmetry: cfg.symmetry as Symmetry })
  const colorData = packColors(cfg.palette as PaletteName, colors)

  const mk = (bytes: number, usage: number) => device.createBuffer({ size: bytes, usage })
  const S = BUF.STORAGE | BUF.COPY_DST
  const U = BUF.UNIFORM | BUF.COPY_DST

  const posBuf = mk(count * 2 * 4, S)
  const velBuf = mk(count * 2 * 4, S)
  const speciesBuf = mk(count * 4, S)
  const matrixBuf = mk(Math.max(1, colors * colors) * 4, S)
  const colorBuf = mk(Math.max(1, colors) * 4 * 4, S)
  const paramsBuf = mk(PARAMS_SIZE, U)
  const viewBuf = mk(VIEW_SIZE, U)
  const fadeBuf = mk(16, U)

  device.queue.writeBuffer(posBuf, 0, world.pos)
  device.queue.writeBuffer(velBuf, 0, world.vel)
  device.queue.writeBuffer(speciesBuf, 0, world.types)
  device.queue.writeBuffer(matrixBuf, 0, matrix)
  device.queue.writeBuffer(colorBuf, 0, colorData)
  device.queue.writeBuffer(paramsBuf, 0, packParams(cfg, worldW, worldH))
  device.queue.writeBuffer(viewBuf, 0, packView(cfg, size, dpr, DEFAULT_CAMERA, worldW, worldH))

  // Explicit shared layouts: `forces` and `integrate` touch different subsets of the
  // bindings, so `layout:'auto'` would give each pipeline an incompatible auto-layout
  // and one shared bind group can't drive both. Same for the halo/core render pair.
  const computeBGL = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: STAGE.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: STAGE.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: STAGE.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: STAGE.COMPUTE, buffer: { type: 'storage' } },
      { binding: 4, visibility: STAGE.COMPUTE, buffer: { type: 'storage' } },
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
      { binding: 1, resource: { buffer: speciesBuf } },
      { binding: 2, resource: { buffer: matrixBuf } },
      { binding: 3, resource: { buffer: posBuf } },
      { binding: 4, resource: { buffer: velBuf } },
    ],
  })

  const renderMod = device.createShaderModule({ code: RENDER_WGSL })
  const target = (blend: GPUBlendState) => ({ targets: [{ format, blend }] })
  // particle render bind group (view + the compute storage buffers), all read in the
  // vertex stage.
  const renderBGL = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: STAGE.VERTEX, buffer: { type: 'uniform' } },
      { binding: 1, visibility: STAGE.VERTEX, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: STAGE.VERTEX, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: STAGE.VERTEX, buffer: { type: 'read-only-storage' } },
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
      { binding: 2, resource: { buffer: speciesBuf } },
      { binding: 3, resource: { buffer: colorBuf } },
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
    device, ctx, format, count, colors, dpr, worldW, worldH,
    paramsBuf, viewBuf, fadeBuf, speciesBuf, matrixBuf, posBuf, velBuf, colorBuf,
    forcesPipe, integratePipe, computeBind, haloPipe, corePipe, fadePipe, renderBind, fadeBind,
    accum, accumView: accum.createView(), texW, texH, needsClear: true,
    bg: { r: 0, g: 0, b: 0 },
  }
  writeFade(res, cfg)
  return res
}

/** bg + trail-fade alpha into the fade uniform, and cache bg for the clear value. */
export function writeFade(res: GpuResources, cfg: ParticleLifeGpuConfig): void {
  const { r, g, b } = parseHex6(cfg.background)
  res.bg = { r: r / 255, g: g / 255, b: b / 255 }
  const alpha = cfg.trailFade > 0 ? 1 - cfg.trailFade : 1
  res.device.queue.writeBuffer(res.fadeBuf, 0, new Float32Array([res.bg.r, res.bg.g, res.bg.b, alpha]))
}

/** Live-apply the cheap uniforms (forces/look) without reallocating buffers. */
export function writeParams(res: GpuResources, cfg: ParticleLifeGpuConfig): void {
  res.device.queue.writeBuffer(res.paramsBuf, 0, packParams(cfg, res.worldW, res.worldH))
}
export function writeColors(res: GpuResources, cfg: ParticleLifeGpuConfig): void {
  res.device.queue.writeBuffer(res.colorBuf, 0, packColors(cfg.palette as PaletteName, cfg.colors))
}
export function writeMatrix(res: GpuResources, cfg: ParticleLifeGpuConfig): void {
  // seed + colors are structural (re-setup), so a live symmetry/bias/matrix edit
  // repacks the same-size matrix in place — a Custom override wins over the seed.
  res.device.queue.writeBuffer(res.matrixBuf, 0, resolveMatrix({ ...cfg, symmetry: cfg.symmetry as Symmetry }))
}
export function writeView(
  res: GpuResources, cfg: ParticleLifeGpuConfig, size: { width: number; height: number }, cam: Camera,
): void {
  res.device.queue.writeBuffer(res.viewBuf, 0, packView(cfg, size, res.dpr, cam, res.worldW, res.worldH))
}

/** Resize: repack the view mapping and recreate the accumulation texture to match
 *  the new swapchain size (copyTextureToTexture needs identical dimensions). */
export function resizeGPU(
  res: GpuResources, cfg: ParticleLifeGpuConfig, size: { width: number; height: number }, cam: Camera,
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

/** Advance `steps` sim steps then composite one frame. One command encoder, one
 *  submit. `steps` may be 0 (a paused repaint still re-composites the accum tex). */
export function runFrame(res: GpuResources, cfg: ParticleLifeGpuConfig, steps: number): void {
  const enc = res.device.createCommandEncoder()
  const groups = Math.ceil(res.count / WORKGROUP)
  for (let s = 0; s < steps; s++) {
    const fp = enc.beginComputePass()
    fp.setPipeline(res.forcesPipe); fp.setBindGroup(0, res.computeBind); fp.dispatchWorkgroups(groups); fp.end()
    const ip = enc.beginComputePass()
    ip.setPipeline(res.integratePipe); ip.setBindGroup(0, res.computeBind); ip.dispatchWorkgroups(groups); ip.end()
  }

  // composite into the persistent accumulation texture
  const pass = enc.beginRenderPass({
    colorAttachments: [{
      view: res.accumView,
      loadOp: res.needsClear ? 'clear' : 'load',
      clearValue: { r: res.bg.r, g: res.bg.g, b: res.bg.b, a: 1 },
      storeOp: 'store',
    }],
  })
  if (!res.needsClear) {
    // fade the previous frame toward bg (trail persistence)
    pass.setPipeline(res.fadePipe); pass.setBindGroup(0, res.fadeBind); pass.draw(3)
  }
  res.needsClear = false
  if (cfg.glow) { pass.setPipeline(res.haloPipe); pass.setBindGroup(0, res.renderBind); pass.draw(6, res.count) }
  pass.setPipeline(res.corePipe); pass.setBindGroup(0, res.renderBind); pass.draw(6, res.count)
  pass.end()

  // blit accumulation → swapchain (getCurrentTexture is fresh every frame)
  const swap = res.ctx.getCurrentTexture()
  enc.copyTextureToTexture({ texture: res.accum }, { texture: swap }, [res.texW, res.texH])
  res.device.queue.submit([enc.finish()])
}

export function disposeGPU(res: GpuResources): void {
  // NB: never res.device.destroy() — the device is the shared framework singleton.
  for (const b of [res.paramsBuf, res.viewBuf, res.fadeBuf, res.speciesBuf, res.matrixBuf, res.posBuf, res.velBuf, res.colorBuf]) {
    b.destroy()
  }
  res.accum.destroy()
}
