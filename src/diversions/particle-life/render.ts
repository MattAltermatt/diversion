// render.ts — luminous particles on a fading field, two-layer so hue survives
// density. Each species gets a pre-rendered CORE sprite (opaque colored dot) and a
// HALO sprite (soft radial glow). A frame: (1) fills the fade rect; (2) draws the
// opaque cores source-over so every particle keeps its species color even in a
// dense pack; (3) draws the halos with 'lighter' so overlaps bloom — but at low
// halo alpha, so bloom builds gradually instead of blowing straight to white.
// Sprites are pre-rendered in setup / on look-change → ZERO per-frame allocation.
import type { Size } from '../../framework/types'
import { parseHex6, rgba } from '../../framework/color'
import { WORLD_W, WORLD_H, type Sim } from './sim'
import type { ParticleLifeConfig } from './schema'

const TAU = Math.PI * 2

export interface GlowSprites {
  cores: HTMLCanvasElement[] // opaque colored dot per species (drawn source-over)
  halos: HTMLCanvasElement[] // soft additive glow per species (drawn 'lighter'); empty when glow off
  coreHalf: number
  haloHalf: number
  glow: boolean
}

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D | null] {
  const cv = document.createElement('canvas')
  cv.width = size
  cv.height = size
  return [cv, cv.getContext('2d')]
}

/** Pre-render a core (opaque dot) sprite per species, and — when `glow` — a soft
 *  additive halo per species. Halo alpha is deliberately low so additive overlap
 *  blooms gently rather than clipping to white. */
export function buildSprites(colors: string[], dotSize: number, glow: boolean): GlowSprites {
  const coreSize = Math.ceil(dotSize * 2) + 2
  const coreHalf = coreSize / 2
  const haloSize = Math.max(8, Math.ceil(dotSize * 7))
  const haloHalf = haloSize / 2

  const cores: HTMLCanvasElement[] = []
  const halos: HTMLCanvasElement[] = []
  for (const col of colors) {
    const { r, g, b } = parseHex6(col)
    const [coreCv, cc] = makeCanvas(coreSize)
    if (cc) {
      cc.fillStyle = rgba({ r, g, b }, 1)
      cc.beginPath()
      cc.arc(coreHalf, coreHalf, dotSize, 0, TAU)
      cc.fill()
    }
    cores.push(coreCv)

    if (glow) {
      const [haloCv, hc] = makeCanvas(haloSize)
      if (hc) {
        const grad = hc.createRadialGradient(haloHalf, haloHalf, 0, haloHalf, haloHalf, haloHalf)
        grad.addColorStop(0, rgba({ r, g, b }, 0.5))
        grad.addColorStop(0.25, rgba({ r, g, b }, 0.22))
        grad.addColorStop(0.6, rgba({ r, g, b }, 0.05))
        grad.addColorStop(1, rgba({ r, g, b }, 0))
        hc.fillStyle = grad
        hc.fillRect(0, 0, haloSize, haloSize)
      }
      halos.push(haloCv)
    }
  }
  return { cores, halos, coreHalf, haloHalf, glow }
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  cfg: ParticleLifeConfig,
  size: Size,
  sprites: GlowSprites,
): void {
  // trail fade: translucent bg fill (higher trailFade = slower fade = longer trails)
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = cfg.trailFade > 0 ? 1 - cfg.trailFade : 1
  ctx.fillStyle = cfg.background
  ctx.fillRect(0, 0, size.width, size.height)
  ctx.globalAlpha = 1

  // cover-fit world → screen (scale = max → crop overflow; wrap seams sit off-screen).
  // Inlined (no per-frame object literal) so drawScene stays zero-alloc.
  const scale = Math.max(size.width / WORLD_W, size.height / WORLD_H)
  const ox = (size.width - WORLD_W * scale) / 2
  const oy = (size.height - WORLD_H * scale) / 2
  const { cores, halos, coreHalf, haloHalf, glow } = sprites
  const { px, py, type, n } = sim

  // pass 1: additive halos underneath (bloom). Drawn first so the opaque cores sit
  // crisply on top and always show their species hue.
  if (glow) {
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < n; i++) {
      const spr = halos[type[i]]
      if (!spr) continue
      ctx.drawImage(spr, ox + px[i] * scale - haloHalf, oy + py[i] * scale - haloHalf)
    }
  }

  // pass 2: opaque colored cores — hue survives density.
  ctx.globalCompositeOperation = 'source-over'
  for (let i = 0; i < n; i++) {
    const spr = cores[type[i]]
    if (!spr) continue
    ctx.drawImage(spr, ox + px[i] * scale - coreHalf, oy + py[i] * scale - coreHalf)
  }
}
