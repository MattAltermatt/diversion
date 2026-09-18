import { paintGround } from './ground'

/** Two layers, composited each frame: the ground (rebuilt only when it changes)
 *  and the ink the pen has laid down so far.
 *
 *  ⚠️ The ink layer is PERSISTENT. Powder is deposited, not redrawn — which is
 *  why every colour-bearing field is structural rather than live-applied: a
 *  stroke's colour is baked when the composition is built, and recolouring
 *  mid-draw would leave a drawing half one palette and half another that never
 *  heals. */
export interface Layers {
  ground: HTMLCanvasElement | OffscreenCanvas
  groundCtx: CanvasRenderingContext2D
  ink: HTMLCanvasElement | OffscreenCanvas
  inkCtx: CanvasRenderingContext2D
  /** The key `paintGround` resolved for what is currently painted. */
  groundKey: string
  width: number
  height: number
}

/** jsdom has no OffscreenCanvas, and `diversionSmoke` runs `setup()` for real —
 *  so the fallback branch is the one the suite exercises. Sizes must be set on
 *  it explicitly or it is 300x150. */
function offscreen(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height)
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  return c
}

const ctx2d = (c: HTMLCanvasElement | OffscreenCanvas): CanvasRenderingContext2D =>
  c.getContext('2d') as unknown as CanvasRenderingContext2D

export function makeLayers(
  width: number, height: number, background: string, groundGrain: number, seed: number,
): Layers {
  const ground = offscreen(width, height)
  const groundCtx = ctx2d(ground)
  const ink = offscreen(width, height)
  const groundKey = paintGround(groundCtx, width, height, background, groundGrain, seed)
  return { ground, groundCtx, ink, inkCtx: ctx2d(ink), groundKey, width, height }
}

/** Repaint the ground only if its key changed. The key includes the SEED, so a
 *  reseed genuinely gets a new floor — without that, every drawing forever sits
 *  on the identical one. */
export function refreshGround(
  layers: Layers, background: string, groundGrain: number, seed: number,
): void {
  const key = paintGround(layers.groundCtx, layers.width, layers.height,
                          background, groundGrain, seed)
  layers.groundKey = key
}

/** Composite ground then ink, centred. The drawing is anchored at a fixed
 *  `Rmax` derived once at setup, so a resize re-composites rather than
 *  rescaling: a reflow changes aspect ratio, and resampling deposited 2px
 *  streaks would leave a visible seam on a drawing that is then held. */
export function composite(
  ctx: CanvasRenderingContext2D, layers: Layers, width: number, height: number,
): void {
  ctx.clearRect(0, 0, width, height)
  ctx.drawImage(layers.ground as CanvasImageSource, 0, 0, width, height)
  const ox = Math.round((width - layers.width) / 2)
  const oy = Math.round((height - layers.height) / 2)
  ctx.drawImage(layers.ink as CanvasImageSource, ox, oy)
}
