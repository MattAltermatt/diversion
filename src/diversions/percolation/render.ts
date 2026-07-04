import { parseHex8 } from '../../framework/color'
import { sampleGradientRGBA } from '../../framework/gradient'
import type { PercolationState } from './percolation'

// ─── Rendering ───────────────────────────────────────────────────────────────
// The lattice is drawn one pixel per site into a tiny offscreen ImageData
// (gw×gh), then blitted onto the main canvas with nearest-neighbour scaling — so a
// full relabel is a single cheap image upscale, never gw·gh fillRect calls. A
// per-root colour cache (rebuilt each frame in one pass) keeps the hsl/gradient
// maths off the per-site hot loop; the size ramp is a palette LUT.

const LUT_SIZE = 128

interface RenderBuf {
  off: HTMLCanvasElement
  octx: CanvasRenderingContext2D
  img: ImageData
  gw: number
  gh: number
  // per-root colour cache (packed 0xRRGGBB) valid for the current gen
  rootCol: Int32Array
  rootGen: Int32Array
  gen: number
  ramp: Int32Array // size-mode palette LUT (packed rgb)
  rampSig: string
}
const bufs = new WeakMap<PercolationState, RenderBuf>()

const pack = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b

function buildRamp(palette: string[]): Int32Array {
  const stops = palette.map((c) => c + 'ff')
  const lut = new Int32Array(LUT_SIZE)
  for (let i = 0; i < LUT_SIZE; i++) {
    const c = sampleGradientRGBA(stops, i / (LUT_SIZE - 1))
    lut[i] = pack(Math.round(c.r), Math.round(c.g), Math.round(c.b))
  }
  return lut
}

// Distinct hue per cluster from a hash of its (stable, min-index) root.
function hashHue(r: number): number {
  let h = Math.imul(r ^ 0x9e3779b9, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

function hslToPacked(h: number, sPct: number, lPct: number): number {
  const s = sPct / 100, l = lPct / 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = (h % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0, g = 0, b = 0
  if (hp < 1) { r = c; g = x } else if (hp < 2) { r = x; g = c }
  else if (hp < 3) { g = c; b = x } else if (hp < 4) { g = x; b = c }
  else if (hp < 5) { r = x; b = c } else { r = c; b = x }
  const m = l - c / 2
  return pack(Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255))
}

function ensureBuf(s: PercolationState): RenderBuf {
  let buf = bufs.get(s)
  if (!buf || buf.gw !== s.gw || buf.gh !== s.gh) {
    const off = document.createElement('canvas')
    off.width = s.gw
    off.height = s.gh
    const octx = off.getContext('2d')!
    const n = s.gw * s.gh
    buf = {
      off, octx, img: octx.createImageData(s.gw, s.gh), gw: s.gw, gh: s.gh,
      rootCol: new Int32Array(n), rootGen: new Int32Array(n).fill(-1), gen: 0,
      ramp: buildRamp(s.cfg.palette), rampSig: s.cfg.palette.join(),
    }
    bufs.set(s, buf)
    s.needsRepaint = true
  }
  const sig = s.cfg.palette.join()
  if (sig !== buf.rampSig) { buf.ramp = buildRamp(s.cfg.palette); buf.rampSig = sig }
  return buf
}

export function render(s: PercolationState, ctx: CanvasRenderingContext2D): void {
  const buf = ensureBuf(s)
  if (s.needsRepaint) {
    paintLattice(s, buf)
    buf.octx.putImageData(buf.img, 0, 0)
    s.needsRepaint = false
  }
  // Blit the lattice to the whole canvas (CSS px; the dpr transform maps it to the
  // device backing store). Nearest-neighbour → crisp blocky sites.
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, s.w, s.h)
  ctx.drawImage(buf.off, 0, 0, s.w, s.h)
}

function paintLattice(s: PercolationState, buf: RenderBuf): void {
  const { root, isSpan, size } = s
  const n = s.gw * s.gh
  const data = buf.img.data
  const bg = parseHex8(s.cfg.background + 'ff')
  const span = parseHex8(s.cfg.spanningColor + 'ff')
  const mode = s.cfg.colorMode
  const highlight = s.cfg.highlightSpanning
  const maxSize = Math.max(1, s.largestSize)
  const logMax = Math.log(maxSize + 1)
  const gen = ++buf.gen
  const { rootCol, rootGen, ramp } = buf
  // 'spanning' mode base ink for open non-spanning sites: a dim desaturated slate.
  const inkR = 74, inkG = 84, inkB = 104

  for (let i = 0; i < n; i++) {
    const o = i * 4
    const r = root[i]
    let col: number
    if (r < 0) {
      data[o] = bg.r; data[o + 1] = bg.g; data[o + 2] = bg.b; data[o + 3] = 255
      continue
    }
    if (highlight && isSpan[i]) {
      data[o] = span.r; data[o + 1] = span.g; data[o + 2] = span.b; data[o + 3] = 255
      continue
    }
    if (mode === 'spanning') {
      data[o] = inkR; data[o + 1] = inkG; data[o + 2] = inkB; data[o + 3] = 255
      continue
    }
    if (rootGen[r] === gen) {
      col = rootCol[r]
    } else {
      if (mode === 'size') {
        const t = Math.log(size[r] + 1) / logMax
        col = ramp[Math.min(LUT_SIZE - 1, (t * (LUT_SIZE - 1)) | 0)]
      } else {
        col = hslToPacked(hashHue(r) * 360, 62, 56)
      }
      rootCol[r] = col
      rootGen[r] = gen
    }
    data[o] = (col >> 16) & 255; data[o + 1] = (col >> 8) & 255; data[o + 2] = col & 255; data[o + 3] = 255
  }
}

/** Free the offscreen buffers for a state (teardown). */
export function disposeRender(s: PercolationState): void {
  bufs.delete(s)
}
