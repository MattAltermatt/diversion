import type { DBMState } from './dbm'

// ─── Rendering ───────────────────────────────────────────────────────────────
// The bolt is small (hundreds of cells) and static once grown, so we redraw the
// whole channel every frame from the `parent` links — no accumulation buffer. Two
// additive layers keep the hue at high density (per the additive-glow-blowout
// gotcha): a wide, low-alpha halo bloom under a thin, near-opaque core. A per-cell
// brightness envelope drives the three looks: a bright head crawling down a lit
// channel while GROWING, a white spike on the FLASH, and a warm decay to an ember
// while FADING.

const TIP_LEN = 34 // cells: how far back from the head the growing glow reaches
const CHANNEL_BASE = 0.5 // brightness of the already-grown channel while growing

type RGB = [number, number, number]

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}
function rgba(c: RGB, a: number): string {
  return `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${a})`
}
const easeOut = (t: number) => 1 - (1 - t) * (1 - t)

interface Envelope {
  core: RGB
  halo: RGB
  env: number // global brightness 0..1
  flash: number // extra halo boost 0..1
}

/** Phase → colours + global brightness. */
function envelope(s: DBMState): Envelope {
  const core = hexToRgb(s.cfg.coreColor)
  const halo = hexToRgb(s.cfg.haloColor)
  const ember = hexToRgb(s.cfg.emberColor)
  if (s.phase === 'growing') return { core, halo, env: 1, flash: 0 }
  if (s.phase === 'flashing') return { core: mix(core, [255, 255, 255], 0.6), halo, env: 1, flash: 1 }
  // fading: decay to a dim ember, hue shifting warm as it cools
  const t = Math.min(1, s.phaseMs / (s.cfg.afterglow * 1000))
  const decay = easeOut(1 - t)
  return { core: mix(core, ember, t), halo: mix(halo, ember, t), env: decay, flash: 0 }
}

/** Per-cell brightness (the crawling head lives here, GROWING only). */
function cellBrightness(s: DBMState, order: number): number {
  if (s.phase !== 'growing') return 1
  const fromTip = s.count - 1 - order
  return CHANNEL_BASE + (1 - CHANNEL_BASE) * Math.exp(-fromTip / TIP_LEN)
}

export function render(s: DBMState, ctx: CanvasRenderingContext2D): void {
  const { gw, cellPx, order, parent, bc } = s
  ctx.fillStyle = s.cfg.background
  ctx.fillRect(0, 0, s.w, s.h)

  const e = envelope(s)
  if (e.env <= 0.002) return

  const cx = (i: number) => ((i % gw) + 0.5) * cellPx
  const cy = (i: number) => (((i / gw) | 0) + 0.5) * cellPx

  const coreW = s.cfg.boltWidth
  const glow = s.cfg.glow
  // Two halo passes (wide+faint, then tighter+stronger) give a soft bloom without
  // a per-frame full-canvas blur; the core rides on top opaque.
  const haloOuterW = coreW + (2 + glow * 16) * (1 + e.flash * 0.8)
  const haloInnerW = coreW + (1 + glow * 7) * (1 + e.flash * 0.6)
  const haloOuterA = (0.05 + glow * 0.16) * (1 + e.flash * 1.4)
  const haloInnerA = (0.10 + glow * 0.26) * (1 + e.flash * 1.2)

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const TREE = 2
  // Halo: one uniform-brightness layer batched into a single path + stroke.
  const haloLayer = (width: number, alpha: number) => {
    ctx.lineWidth = width
    ctx.strokeStyle = rgba(e.halo, Math.min(1, alpha * e.env))
    ctx.beginPath()
    for (let i = 0; i < order.length; i++) {
      if (bc[i] !== TREE) continue
      const p = parent[i]
      if (p < 0) continue
      ctx.moveTo(cx(p), cy(p)); ctx.lineTo(cx(i), cy(i))
    }
    ctx.stroke()
  }
  // Core: each segment strokes at its own brightness so the growing head reads as a
  // bright crawling spark. Segments are binned into 8 brightness buckets so we issue
  // 8 batched strokes, not one per cell.
  const coreLayer = () => {
    ctx.lineWidth = coreW
    const BINS = 8
    for (let b = 0; b < BINS; b++) {
      const bri = ((b + 0.5) / BINS)
      ctx.strokeStyle = rgba(e.core, Math.min(1, bri * e.env))
      ctx.beginPath()
      for (let i = 0; i < order.length; i++) {
        if (bc[i] !== TREE) continue
        const p = parent[i]
        if (p < 0) continue
        const bin = Math.min(BINS - 1, (cellBrightness(s, order[i]) * BINS) | 0)
        if (bin !== b) continue
        ctx.moveTo(cx(p), cy(p)); ctx.lineTo(cx(i), cy(i))
      }
      ctx.stroke()
    }
  }

  ctx.globalCompositeOperation = 'lighter'
  if (glow > 0) {
    haloLayer(haloOuterW, haloOuterA)
    haloLayer(haloInnerW, haloInnerA)
  }
  coreLayer()

  ctx.globalCompositeOperation = 'source-over'
}
