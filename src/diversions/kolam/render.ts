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
  /** Device-pixel ratio the INK layer is drawn at. */
  dpr: number
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
  dpr = 1,
): Layers {
  const ground = offscreen(width, height)
  const groundCtx = ctx2d(ground)
  // ⚠️ The INK layer is DEVICE px. `setup` receives CSS px and the host has
  // already applied setTransform(dpr), so a CSS-px ink layer renders every
  // stroke at 1x and lets the host smooth it up — which softens exactly the
  // 1.8 px lines at 6.6 px spacing the whole piece is built on. It costs
  // nothing extra: the same stamps on a larger canvas.
  //
  // The GROUND deliberately stays CSS px. It is a smooth wash, and its build is
  // ~225 ms at this size — quadrupling that to sharpen a gradient is not a
  // trade worth making.
  const ink = offscreen(Math.round(width * dpr), Math.round(height * dpr))
  const inkCtx = ctx2d(ink)
  inkCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const groundKey = paintGround(groundCtx, width, height, background, groundGrain, seed)
  return { ground, groundCtx, ink, inkCtx, groundKey, width, height, dpr }
}

/** Repaint the ground only if its key changed. The key includes the SEED, so a
 *  reseed genuinely gets a new floor — without that, every drawing forever sits
 *  on the identical one. */
export function refreshGround(
  layers: Layers, background: string, groundGrain: number, seed: number,
  width = layers.width, height = layers.height,
): void {
  // Resize the ground canvas to the live box before repainting — otherwise the
  // strip outside the old size keeps a stale stretched bitmap forever.
  if (width !== layers.ground.width || height !== layers.ground.height) {
    layers.ground.width = width
    layers.ground.height = height
  }
  layers.groundKey = paintGround(layers.groundCtx, width, height, background, groundGrain, seed)
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
  // The ink layer is device px; draw it back at its CSS size.
  ctx.drawImage(layers.ink as CanvasImageSource, ox, oy, layers.width, layers.height)
}
