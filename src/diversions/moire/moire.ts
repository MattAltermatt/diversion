import { mulberry32 } from '../../framework/rng'
import type { MoireConfig } from './schema'

export interface Center {
  x: number
  y: number
  vx: number // drift velocity, px/s
  vy: number
  tint: number // index into cfg.color.tints (glow mode)
  phase: number // total px the leading ring edge has travelled
}

export interface MoireState {
  centers: Center[]
  cfg: MoireConfig
  w: number
  h: number
  maxR: number // screen diagonal — rings retire past this
  t: number // sim clock, ms (drives breathing + hue cycle)
}

function makeCenters(cfg: MoireConfig, w: number, h: number): Center[] {
  const rng = mulberry32(cfg.seed >>> 0)
  const centers: Center[] = []
  for (let i = 0; i < cfg.centers; i++) {
    const angle = rng() * Math.PI * 2
    centers.push({
      x: rng() * w,
      y: rng() * h,
      vx: Math.cos(angle) * cfg.driftSpeed,
      vy: Math.sin(angle) * cfg.driftSpeed,
      tint: i,
      phase: rng() * cfg.ringSpacing, // stagger so centers don't pulse in lockstep
    })
  }
  return centers
}

export function createMoireState(cfg: MoireConfig, w: number, h: number): MoireState {
  return { centers: makeCenters(cfg, w, h), cfg, w, h, maxR: Math.hypot(w, h), t: 0 }
}

/** Live ring radii for one center: phase - k*spacing for k>=0, kept in (0, maxR].
 *  Descending (outermost first). Pure — no state. */
export function ringRadii(phase: number, spacing: number, maxR: number): number[] {
  const radii: number[] = []
  // Start at the outermost still-visible ring so per-frame work stays bounded by
  // maxR/spacing — not by phase, which climbs without limit over uptime.
  let r = phase
  if (r > maxR) r -= Math.ceil((r - maxR) / spacing) * spacing
  for (; r > 0; r -= spacing) radii.push(r)
  return radii
}

/** Number of a center's concentric discs whose radius exceeds `maxR`. Each such
 *  disc covers the WHOLE canvas (center→pixel distance ≤ the diagonal = maxR), so
 *  in solid (XOR-fill) mode each is a uniform parity toggle. `ringRadii` drops
 *  them for performance; if the dropped total is odd the whole parity field
 *  inverts in one frame each time a disc crosses maxR — the Op-Art "flash" bug.
 *  Solid mode adds this parity back (one full-screen toggle) to stay in sync with
 *  the true unbounded field. Mirrors the cull in `ringRadii` exactly:
 *  `culledRingCount + ringRadii().length === ceil(phase/spacing)`. */
export function culledRingCount(phase: number, spacing: number, maxR: number): number {
  return phase > maxR ? Math.ceil((phase - maxR) / spacing) : 0
}

/** Birth/death fade: ramps 0->1 over the first `fadeFrac` of the radius range
 *  and 1->0 over the last `fadeFrac`. Flat 1 in between. */
export function ringAlpha(radius: number, maxR: number, fadeFrac: number): number {
  const f = radius / maxR
  if (f <= 0 || f >= 1) return 0
  const inAlpha = Math.min(1, f / fadeFrac)
  const outAlpha = Math.min(1, (1 - f) / fadeFrac)
  return Math.min(inAlpha, outAlpha)
}

/** Ring expansion speed at time t, modulated by the slow breathing sinusoid.
 *  breathRate is breaths/min -> rad/ms. */
export function effectiveSpeed(t: number, cfg: MoireConfig): number {
  const omega = (cfg.breathRate / 60) * 2 * Math.PI / 1000 // rad per ms
  return cfg.ringSpeed * (1 + cfg.breathAmount * Math.sin(t * omega))
}

/** Advance the sim by dt ms: grow every center's ring phase and drift the
 *  centers, bouncing them off the canvas edges. */
export function stepMoire(state: MoireState, dt: number): void {
  state.t += dt
  const dts = dt / 1000
  const speed = effectiveSpeed(state.t, state.cfg)
  for (const c of state.centers) {
    c.phase += speed * dts
    c.x += c.vx * dts
    c.y += c.vy * dts
    if (c.x < 0) { c.x = 0; c.vx = -c.vx } else if (c.x > state.w) { c.x = state.w; c.vx = -c.vx }
    if (c.y < 0) { c.y = 0; c.vy = -c.vy } else if (c.y > state.h) { c.y = state.h; c.vy = -c.vy }
  }
}

const FADE_FRAC = 0.12 // share of the radius range used for birth/death fade

/** Rotate a hex colour's hue by `deg` degrees, returning an rgb() string.
 *  Renderer-local; XOR mode uses it for the slow hue cycle. */
function hueShift(hex: string, deg: number): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
  let h = 0, s = 0
  const d = max - min
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
  }
  h = (((h + deg / 360) % 1) + 1) % 1
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const R = Math.round(hue2rgb(p, q, h + 1 / 3) * 255)
  const G = Math.round(hue2rgb(p, q, h) * 255)
  const B = Math.round(hue2rgb(p, q, h - 1 / 3) * 255)
  return `rgb(${R}, ${G}, ${B})`
}

const BLUR_MAX = 12 // CSS px of blur at softness = 1

// Per-state offscreen for the crisp rings layer. Softness is then ONE blur pass
// on blit — not a per-ring shadowBlur, which is O(rings) and melts the CPU
// (~13× slower at default softness). Rebuilt when the backing size changes;
// it's a plain 2D canvas (GC'd with the state — no GL resource to free).
const ringLayers = new WeakMap<MoireState, { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }>()
function getRingLayer(state: MoireState, dw: number, dh: number) {
  let layer = ringLayers.get(state)
  if (!layer || layer.canvas.width !== dw || layer.canvas.height !== dh) {
    const canvas = document.createElement('canvas')
    canvas.width = dw
    canvas.height = dh
    layer = { canvas, ctx: canvas.getContext('2d')! }
    ringLayers.set(state, layer)
  }
  return layer
}

/** Draw one crisp ring (thickness = ringWidth). Softness is applied globally as a
 *  single blur on blit, so this stays a cheap stroke. */
function strokeRing(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number, alpha: number, color: string, ringWidth: number,
): void {
  if (alpha <= 0.003) return
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
  ctx.lineWidth = ringWidth
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.stroke()
}

/** Render the moire field for the current frame. Rings are drawn crisp onto a
 *  cached offscreen using the mode's inter-ring compositing (glow=lighten,
 *  solid=filled-disc XOR parity, xor=difference cancellation), then composited
 *  over the background through a single softness blur. */
export function drawMoire(state: MoireState, ctx: CanvasRenderingContext2D): void {
  const { cfg, w, h, maxR } = state
  const dpr = ctx.canvas.width / w

  // Background, drawn in CSS px under the host's DPR transform.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = cfg.color.background
  ctx.fillRect(0, 0, w, h)

  // Rings layer (transparent), crisp, in CSS px.
  const layer = getRingLayer(state, ctx.canvas.width, ctx.canvas.height)
  const lc = layer.ctx
  lc.setTransform(dpr, 0, 0, dpr, 0, 0)
  lc.globalAlpha = 1
  lc.globalCompositeOperation = 'source-over'
  lc.clearRect(0, 0, w, h)

  if (cfg.color.mode === 'solid') {
    // Filled-disc XOR parity. A pixel's parity = how many disc edges enclose it,
    // summed across ALL centers — so the centers' rings MERGE into a single
    // 2-colour interference field, not separate strands that merely cross. `fg`
    // fills the odd-parity regions; the background shows through the even ones.
    // Full opacity (no per-ring fade) — partial alpha would corrupt the parity.
    lc.globalCompositeOperation = 'xor'
    lc.globalAlpha = 1
    lc.fillStyle = cfg.color.fg
    let culledParity = 0
    for (const c of state.centers) {
      culledParity += culledRingCount(c.phase, cfg.ringSpacing, maxR)
      for (const r of ringRadii(c.phase, cfg.ringSpacing, maxR)) {
        lc.beginPath()
        lc.arc(c.x, c.y, r, 0, Math.PI * 2)
        lc.fill()
      }
    }
    // The windowing dropped every disc with r > maxR; each covers the whole
    // canvas, so an odd number of them would invert the entire parity field
    // (the flash). Re-toggle once to put the parity back in sync with the true
    // unbounded field — seamless as a disc crosses maxR.
    if (culledParity % 2 === 1) {
      lc.beginPath()
      lc.rect(0, 0, w, h)
      lc.fill()
    }
  } else {
    // Glow = additive tinted rings; XOR = thin duotone rings that cancel where
    // they cross (moire lines).
    lc.globalCompositeOperation = cfg.color.mode === 'glow' ? 'lighten' : 'difference'
    const xorColor = cfg.color.hueCycle > 0
      ? hueShift(cfg.color.fg, (state.t / 1000) * cfg.color.hueCycle)
      : cfg.color.fg
    const tints = cfg.color.tints
    for (const c of state.centers) {
      const color = cfg.color.mode === 'glow' ? tints[c.tint % tints.length] : xorColor
      for (const r of ringRadii(c.phase, cfg.ringSpacing, maxR)) {
        strokeRing(lc, c.x, c.y, r, ringAlpha(r, maxR, FADE_FRAC), color, cfg.ringWidth)
      }
    }
  }

  // Composite the blurred ring layer over the background, 1:1 in device px.
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.filter = cfg.softness > 0 ? `blur(${(cfg.softness * BLUR_MAX * dpr).toFixed(2)}px)` : 'none'
  ctx.drawImage(layer.canvas, 0, 0)
  ctx.filter = 'none'
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0) // restore for the framework
}

/** Live-apply a config change. Structural changes (center count, seed) return
 *  false so the framework re-runs setup(); everything else applies in place. */
export function updateMoireState(state: MoireState, cfg: MoireConfig, w: number, h: number): boolean {
  if (cfg.centers !== state.cfg.centers || cfg.seed !== state.cfg.seed) return false
  state.cfg = cfg
  state.w = w
  state.h = h
  state.maxR = Math.hypot(w, h)
  return true
}

/** Reposition centers proportionally into the new size and rescale maxR. */
export function resizeMoireState(state: MoireState, w: number, h: number): void {
  const sx = w / state.w, sy = h / state.h
  for (const c of state.centers) {
    c.x = Math.min(w, c.x * sx)
    c.y = Math.min(h, c.y * sy)
  }
  state.w = w
  state.h = h
  state.maxR = Math.hypot(w, h)
}
