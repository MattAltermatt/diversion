// Munching Squares — HAKMEM item 146. The lit set is decided in munch.ts (pure);
// here we own the canvas. We paint the N×N grid into an off-screen ImageData once
// per frame and nearest-neighbour scale it up to the viewport, so cells stay crisp
// and the grid never re-allocates on resize (a stretched-square mapping — resize
// just updates w/h). Cheap: N² pixel writes (≤ 65k at N=256) + one drawImage.
import { defineDiversion } from '../../framework/types'
import { parseHex6, type RGBA } from '../../framework/color'
import { munchingSquaresSchema, type MunchingSquaresConfig } from './schema'
import {
  buildLut, cellColorIndex, deriveParams, isLit, stepAt, type Lut, type Variant,
} from './munch'

interface MunchState {
  cfg: MunchingSquaresConfig
  w: number; h: number // viewport CSS px (drawImage target)
  n: number
  variant: Variant
  offset: number
  off: HTMLCanvasElement // N×N backing image
  offCtx: CanvasRenderingContext2D
  img: ImageData
  lut: Lut
  bg: RGBA
  stepAcc: number // t accumulator (bounded to [0,n))
  phaseAcc: number // color-phase accumulator (bounded to [0,256))
}

function buildBacking(cfg: MunchingSquaresConfig): {
  n: number; off: HTMLCanvasElement; offCtx: CanvasRenderingContext2D; img: ImageData
} {
  const n = 1 << cfg.gridPower
  const off = document.createElement('canvas')
  off.width = n; off.height = n
  const offCtx = off.getContext('2d')!
  const img = offCtx.createImageData(n, n)
  return { n, off, offCtx, img }
}

function lutOf(cfg: MunchingSquaresConfig): Lut {
  return buildLut(cfg.color.hueStart, cfg.color.hueSpan, cfg.color.saturation, cfg.color.lightness)
}

const munchingSquares = defineDiversion<typeof munchingSquaresSchema, MunchState, '2d'>({
  id: 'munching-squares',
  title: 'Munching Squares',
  description: 'The classic HAKMEM display hack: lighting cell (x, y) when y = x XOR t and '
    + 'stepping t folds a pulsing triangular XOR mosaic that shimmers through a cycling palette.',
  kind: '2d',
  schema: munchingSquaresSchema,

  setup(_ctx, config, size) {
    const { n, off, offCtx, img } = buildBacking(config)
    const d = deriveParams(config)
    return {
      cfg: config, w: size.width, h: size.height,
      n, variant: d.variant, offset: d.offset,
      off, offCtx, img,
      lut: lutOf(config), bg: parseHex6(config.background),
      stepAcc: 0, phaseAcc: d.seedPhase,
    }
  },

  frame(state, ctx, _t, dt) {
    const { cfg, n, variant, offset, lut, bg, img } = state
    const t = stepAt(state.stepAcc, n)
    const phase = Math.floor(state.phaseAcc) & 255
    const data = img.data
    let p = 0
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        let r: number, g: number, b: number
        if (isLit(x, y, t, n, variant, offset)) {
          const idx = cellColorIndex(x, y, t, n, cfg.colorMode, phase)
          r = lut.r[idx]; g = lut.g[idx]; b = lut.b[idx]
        } else {
          r = bg.r; g = bg.g; b = bg.b
        }
        data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255
        p += 4
      }
    }
    state.offCtx.putImageData(img, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(state.off, 0, 0, state.w, state.h)

    // Advance both accumulators, kept bounded so a screensaver running for hours
    // never loses float precision. t loops every n steps; phase every 256.
    state.stepAcc = (state.stepAcc + cfg.stepSpeed * (dt / 1000)) % n
    state.phaseAcc = (state.phaseAcc + cfg.colorSpeed * (dt / 1000)) % 256
  },

  resize(state, size) {
    // Stretched-square mapping: only the drawImage target changes; no grid rebuild.
    state.w = size.width
    state.h = size.height
  },

  update(state, config, _size) {
    if (config.gridPower !== state.cfg.gridPower) return false // structural: grid re-alloc
    const seedish = config.seed !== state.cfg.seed || config.rule !== state.cfg.rule
    const d = deriveParams(config)
    state.variant = d.variant
    state.offset = d.offset
    state.lut = lutOf(config)
    state.bg = parseHex6(config.background)
    if (seedish) state.phaseAcc = d.seedPhase // re-anchor the static phase to the new seed
    state.cfg = config
    return true
  },
})

export default munchingSquares
