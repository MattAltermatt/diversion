import { sampleCyclic, sampleGradientRGBA } from '../../framework/gradient'
import { CELL_PX, type DLAState } from './dla'

// ─── Rendering ───────────────────────────────────────────────────────────────
// Every frozen particle is drawn ONCE onto a persistent accumulation buffer
// (device px, transparent where empty). Each frame we only stamp the particles
// frozen since the last frame; a config edit that changes appearance rebuilds the
// buffer from the age grid. The background is composited live every frame so its
// colour edits show (per the baked-buffer memory: bake permanent marks, composite
// bg/glow live). Two caches keep it off the per-frame allocation / blur hot path:
//   • a palette LUT (age-phase → rgb string), rebuilt only when the palette changes
//     — never per particle (the documented #1-jank trap);
//   • an offscreen bloom buffer, re-blurred only when grains (or glow) change — so a
//     filled, holding cluster stops re-running a full-screen gaussian every frame.

const LUT_SIZE = 256

interface RenderBuf {
  canvas: HTMLCanvasElement
  bctx: CanvasRenderingContext2D
  bloom: HTMLCanvasElement
  bloomCtx: CanvasRenderingContext2D
  w: number
  h: number
  lut: string[] // age-phase → rgb, cyclic
  ink: string // single colour (colorByAge off)
  paletteSig: string
  bloomSig: string // signals when the cached bloom is stale
}
const bufs = new WeakMap<DLAState, RenderBuf>()

function buildLut(colors: string[]): { lut: string[]; ink: string } {
  const stops = colors.map((c) => c + 'ff')
  const rgb = (c: { r: number; g: number; b: number }) =>
    `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`
  const lut = new Array<string>(LUT_SIZE)
  for (let i = 0; i < LUT_SIZE; i++) lut[i] = rgb(sampleCyclic(stops, i / LUT_SIZE))
  return { lut, ink: rgb(sampleGradientRGBA(stops, 1)) }
}

function colorFor(s: DLAState, buf: RenderBuf, age: number): string {
  if (!s.cfg.colorByAge) return buf.ink
  const phase = ((age / s.period) % 1 + 1) % 1
  return buf.lut[Math.min(LUT_SIZE - 1, (phase * LUT_SIZE) | 0)]
}

function stamp(s: DLAState, buf: RenderBuf, dpr: number, gx: number, gy: number, age: number): void {
  const cell = CELL_PX * dpr
  const r = s.cfg.particleSize * CELL_PX * 0.62 * dpr
  buf.bctx.fillStyle = colorFor(s, buf, age)
  buf.bctx.beginPath()
  buf.bctx.arc((gx + 0.5) * cell, (gy + 0.5) * cell, r, 0, 2 * Math.PI)
  buf.bctx.fill()
}

function ensureBuf(s: DLAState, ctx: CanvasRenderingContext2D): RenderBuf {
  const cw = ctx.canvas.width, ch = ctx.canvas.height
  let buf = bufs.get(s)
  if (!buf || buf.w !== cw || buf.h !== ch) {
    const canvas = document.createElement('canvas')
    canvas.width = cw
    canvas.height = ch
    const bloom = document.createElement('canvas')
    bloom.width = cw
    bloom.height = ch
    const { lut, ink } = buildLut(s.cfg.colors)
    buf = {
      canvas, bctx: canvas.getContext('2d')!,
      bloom, bloomCtx: bloom.getContext('2d')!,
      w: cw, h: ch, lut, ink, paletteSig: s.cfg.colors.join(), bloomSig: '',
    }
    bufs.set(s, buf)
    s.needsFullRedraw = true
  }
  const sig = s.cfg.colors.join()
  if (sig !== buf.paletteSig) {
    const built = buildLut(s.cfg.colors)
    buf.lut = built.lut
    buf.ink = built.ink
    buf.paletteSig = sig
  }
  return buf
}

export function render(s: DLAState, ctx: CanvasRenderingContext2D): void {
  const buf = ensureBuf(s, ctx)
  const dpr = ctx.canvas.width / s.w
  let changed = false

  if (s.needsFullRedraw) {
    buf.bctx.clearRect(0, 0, buf.w, buf.h)
    const { ages, gw, gh } = s
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        const age = ages[gy * gw + gx]
        if (age >= 0) stamp(s, buf, dpr, gx, gy, age)
      }
    }
    s.needsFullRedraw = false
    s.fresh.length = 0
    changed = true
  } else if (s.fresh.length) {
    for (let i = 0; i < s.fresh.length; i += 3) {
      stamp(s, buf, dpr, s.fresh[i], s.fresh[i + 1], s.fresh[i + 2])
    }
    s.fresh.length = 0
    changed = true
  }

  // composite: background live, then the buffer with an optional bloom pass. The
  // bloom is a cached offscreen blur, regenerated only when grains or glow change
  // (a filled, holding cluster never re-blurs).
  ctx.fillStyle = s.cfg.background
  ctx.fillRect(0, 0, s.w, s.h)
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0) // draw the buffers 1:1 in device px
  if (s.cfg.glow > 0) {
    const bloomSig = `${s.cfg.glow}|${dpr}`
    if (changed || bloomSig !== buf.bloomSig) {
      buf.bloomCtx.clearRect(0, 0, buf.w, buf.h)
      buf.bloomCtx.filter = `blur(${(s.cfg.glow * 7 + 1) * dpr}px)`
      buf.bloomCtx.drawImage(buf.canvas, 0, 0)
      buf.bloomCtx.filter = 'none'
      buf.bloomSig = bloomSig
    }
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.35 + s.cfg.glow * 0.5
    ctx.drawImage(buf.bloom, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }
  ctx.drawImage(buf.canvas, 0, 0)
  ctx.restore()
}

/** Free the buffers for a state (teardown). */
export function disposeRender(s: DLAState): void {
  bufs.delete(s)
}
