// Cells to pixels. Pure given the target buffer, so it is testable without a canvas.

import type { Colony } from './colony'
import type { Rock } from './rock'
import type { LichenConfig } from './schema'

const hexToRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16),
]

export interface Palette {
  species: [number, number, number][]
  rock: [number, number, number]
  sea: [number, number, number]
}

export function buildPalette(cfg: LichenConfig): Palette {
  const g = cfg.species
  return {
    species: [g.verrucaria, g.caloplaca, g.xanthoria, g.lecanora, g.ramalina].map(hexToRgb),
    rock: hexToRgb(cfg.rock),
    sea: hexToRgb(cfg.sea),
  }
}

/** Warm pale quartz for sterile ground. Deliberately away from Lecanora's pale grey — if
 *  the two land near each other they read as one grey mass and the stone stops being
 *  legible as stone. */
const QUARTZ: [number, number, number] = [150, 144, 126]
const QUARTZ_BASE: [number, number, number] = [104, 97, 84]

export function paint(
  buf: Uint8ClampedArray, colony: Colony, rock: Rock, cfg: LichenConfig, pal: Palette,
): void {
  const { w, h, waterRow } = rock
  const { occ, age, scour } = colony
  const margin = cfg.margins / 100 * 0.78

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const p = i * 4
      const lit = 0.34 + rock.shade[i] * 0.46
      let r: number, g: number, b: number

      if (occ[i] === -1) {
        if (rock.sterile[i]) {
          r = QUARTZ[0] * lit + QUARTZ_BASE[0]
          g = QUARTZ[1] * lit + QUARTZ_BASE[1]
          b = QUARTZ[2] * lit + QUARTZ_BASE[2]
        } else {
          r = pal.rock[0] * lit + 26
          g = pal.rock[1] * lit + 28
          b = pal.rock[2] * lit + 32
        }
      } else {
        const c = pal.species[occ[i]]
        // Young thalli are paler and thinner; mature ones saturate.
        const m = Math.min(1, age[i] / 2.4)
        const l = (0.60 + rock.shade[i] * 0.36) * (0.55 + 0.45 * m)
        const mix = (1 - m) * 0.34
        const stone = pal.rock[0] * lit + 26
        r = c[0] * l * (1 - mix) + stone * mix
        g = c[1] * l * (1 - mix) + (pal.rock[1] * lit + 28) * mix
        b = c[2] * l * (1 - mix) + (pal.rock[2] * lit + 32) * mix

        // Contact margin. Full 4-neighbourhood, not just right/down — a one-sided check
        // puts the margin on one side of each border and it stops reading as a drawn line.
        if (margin > 0) {
          const sp = occ[i]
          const touches =
            (x > 0 && occ[i - 1] !== -1 && occ[i - 1] !== sp) ||
            (x < w - 1 && occ[i + 1] !== -1 && occ[i + 1] !== sp) ||
            (y > 0 && occ[i - w] !== -1 && occ[i - w] !== sp) ||
            (y < h - 1 && occ[i + w] !== -1 && occ[i + w] !== sp)
          if (touches) { const k = 1 - margin; r *= k; g *= k; b *= k }
        }
      }

      // Freshly scoured rock is WET ROCK, not water: darken the stone it already is rather
      // than tinting toward the sea's blue. Tinting blue made a large low storm
      // indistinguishable from risen water.
      const s = scour[i]
      if (s > 0.01) {
        const t = s * 0.55
        r *= 1 - t * 0.52
        g *= 1 - t * 0.48
        b *= 1 - t * 0.40
      }

      if (y > waterRow) {
        const d = Math.min(1, (y - waterRow) / 14)
        r = r * (1 - d) + pal.sea[0] * d
        g = g * (1 - d) + pal.sea[1] * d
        b = b * (1 - d) + pal.sea[2] * d
      }

      buf[p] = r
      buf[p + 1] = g
      buf[p + 2] = b
      buf[p + 3] = 255
    }
  }
}
