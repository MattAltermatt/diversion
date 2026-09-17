// Storms. A storm is an EVENT with duration, not an instantaneous mask: a sweep spirals
// through the struck area over several seconds, stripping as it goes, and a sparse remnant
// always survives. The survivors matter beyond looking right — total clearance made every
// recolonisation restart identically.

import type { Colony } from './colony'
import { fbm2 } from './noise'
import type { Rock } from './rock'

export const NATURAL = ['band', 'plume', 'spatter', 'slab', 'swath'] as const
export const WHIMSY = ['checker', 'smiley', 'spiral', 'dots', 'bite'] as const
export type MaskKind = (typeof NATURAL)[number] | (typeof WHIMSY)[number]
export const ALL_KINDS: readonly MaskKind[] = [...NATURAL, ...WHIMSY]

/** Fraction of struck lichen left standing. */
export const SURVIVE = 0.085
const TURNS = 2.6
const COIL = 0.55

export interface Storm {
  kind: MaskKind
  severity: number
  /** Cells the storm reaches, ordered by the progress at which each is scrubbed. */
  cells: Int32Array
  phase: Float32Array
  ptr: number
  age: number
  duration: number
  stripped: number
  salt: number
}

/** Severity is skewed hard toward the small: measured median 0.214, and ~54% fall under
 *  a quarter strength. (NOT ~70% — an earlier draft said so, and the tempting "fix" is to
 *  change the exponent to about 4.14, which would alter the distribution the second act
 *  depends on.) */
export function drawSeverity(rnd: () => number): number {
  return 0.04 + Math.pow(rnd(), 2.4) * 0.92
}

export function pickKind(whimsy: number, rnd: () => number): MaskKind {
  const pool = rnd() * 100 < whimsy ? WHIMSY : NATURAL
  return pool[(rnd() * pool.length) | 0]
}

export interface Mask {
  hit: (x: number, y: number) => boolean
  cx: number
  cy: number
  salt: number
  /** Inclusive cell bounds the mask can possibly reach. `beginStorm` scans only this —
   *  without it every storm evaluates its (noise-bearing) predicate over the whole grid,
   *  which measured 120-130ms for kinds covering a fraction of the screen. Must be a
   *  conservative OVER-estimate: anything clipped off here is silently never struck. */
  bounds: { x0: number; y0: number; x1: number; y1: number }
}

/** Every shape costs the same, which is what the Whimsy control spends. */
export function makeMask(kind: MaskKind, sev: number, rock: Rock, rnd: () => number): Mask {
  const { w: W, h: H, noise } = rock
  const cx = W * (0.2 + rnd() * 0.6)
  const cy = H * (0.25 + rnd() * 0.5)
  // Per-storm salt. Without it every mask's raggedness is the same field in world space on
  // every rock and in every storm, so two different seeds cut identical edges.
  const salt = 1 + ((rnd() * 1e5) | 0)
  const wob = (x: number, y: number, s: number) => (fbm2(noise, x / 9 + s + salt, y / 9, 2) - 0.5) * 2
  let hit: (x: number, y: number) => boolean
  let bounds = { x0: 0, y0: 0, x1: W - 1, y1: H - 1 }
  const span = (x: number, y: number, rx: number, ry = rx) => ({
    x0: Math.max(0, Math.floor(x - rx)), y0: Math.max(0, Math.floor(y - ry)),
    x1: Math.min(W - 1, Math.ceil(x + rx)), y1: Math.min(H - 1, Math.ceil(y + ry)),
  })

  switch (kind) {
    case 'band': {
      const half = 2 + sev * H * 0.52
      hit = (x, y) => Math.abs(y - (rock.waterRow - half * 0.35)) < half + wob(x, y, 11) * 6
      bounds = { ...span(0, rock.waterRow - half * 0.35, 0, half + 12), x0: 0, x1: W - 1 }
      break
    }
    case 'plume': {
      const gx = rnd() * W
      const reach = H * (0.2 + sev * 0.8)
      hit = (x, y) => {
        const up = rock.waterRow - y
        if (up < 0 || up > reach) return false
        const halfW = (1 - up / reach) * (4 + sev * W * 0.16) + 2
        return Math.abs(x - gx + wob(x, y, 23) * 7) < halfW
      }
      bounds = {
        ...span(gx, rock.waterRow - reach / 2, 4 + sev * W * 0.16 + 12, reach / 2 + 2),
      }
      break
    }
    case 'spatter': {
      const n = 3 + Math.round(sev * 34)
      const blobs: [number, number, number][] = []
      for (let i = 0; i < n; i++) blobs.push([rnd() * W, rnd() * H, 3 + rnd() * (4 + sev * 26)])
      {
        let x0 = W, y0 = H, x1 = 0, y1 = 0
        for (const [bx, by, r] of blobs) {
          x0 = Math.min(x0, bx - r - 2); y0 = Math.min(y0, by - r - 2)
          x1 = Math.max(x1, bx + r + 2); y1 = Math.max(y1, by + r + 2)
        }
        bounds = {
          x0: Math.max(0, Math.floor(x0)), y0: Math.max(0, Math.floor(y0)),
          x1: Math.min(W - 1, Math.ceil(x1)), y1: Math.min(H - 1, Math.ceil(y1)),
        }
      }
      // The jitter depends on the CELL, not the blob, so it must be hoisted out of the
      // `some` callback. Inside it, `beginStorm`'s full-grid scan evaluated fbm2 once per
      // blob per cell — up to 37 blobs — which measured as a 950 ms main-thread freeze at
      // high severity on a play-resolution grid. Hoisting is exactly behaviour-preserving.
      hit = (x, y) => {
        const jitter = 0.7 + 0.6 * fbm2(noise, x / 8 + salt, y / 8, 2)
        return blobs.some(([bx, by, r]) => {
          const dx = x - bx, dy = y - by
          return dx * dx + dy * dy < r * r * jitter
        })
      }
      break
    }
    case 'slab': {
      // Edges must be RAGGED at two scales. A clean rotated rectangle reads as geometry —
      // i.e. as whimsy, which the natural family must never do.
      const a = rnd() * Math.PI, ca = Math.cos(a), sa = Math.sin(a)
      const hw = 6 + sev * W * 0.34, hh = 6 + sev * H * 0.34
      const sd = salt + 500
      hit = (x, y) => {
        const dx = x - cx, dy = y - cy
        const u = dx * ca + dy * sa, v = -dx * sa + dy * ca
        const ju = (fbm2(noise, v / 13 + sd, u / 55, 3) - 0.5) * hw * 0.55
          + (fbm2(noise, v / 4 + sd + 7, u / 9, 2) - 0.5) * 7
        const jv = (fbm2(noise, u / 13 + sd + 90, v / 55, 3) - 0.5) * hh * 0.55
          + (fbm2(noise, u / 4 + sd + 97, v / 9, 2) - 0.5) * 7
        return Math.abs(u) < hw + ju && Math.abs(v) < hh + jv
      }
      // Rotated, so the reach in either axis is the half-diagonal, plus the jitter budget.
      bounds = span(cx, cy, Math.hypot(hw, hh) * 1.3 + 12)
      break
    }
    case 'swath': {
      const a = (rnd() - 0.5) * 1.5, ca = Math.cos(a), sa = Math.sin(a)
      const half = 4 + sev * H * 0.42
      hit = (x, y) => Math.abs((x - cx) * sa + (y - cy) * ca + wob(x, y, 47) * 8) < half
      break
    }
    case 'checker': {
      const s = Math.max(5, H / (4 + Math.round(rnd() * 7)))
      const rw = W * (0.3 + sev * 0.7), rh = H * (0.3 + sev * 0.7)
      hit = (x, y) => Math.abs(x - cx) < rw / 2 && Math.abs(y - cy) < rh / 2
        && (Math.floor(x / s) + Math.floor(y / s)) % 2 === 0
      bounds = span(cx, cy, rw / 2 + 1, rh / 2 + 1)
      break
    }
    case 'smiley': {
      // Carve the FEATURES, not the disc — a face in bare rock reads far better than a
      // bare circle with lichen eyes.
      const r = (0.20 + sev * 0.55) * Math.min(W, H) * 0.7
      const t = Math.max(2.2, r * 0.10)
      const ex = r * 0.38, ey = -r * 0.30, er = r * 0.13
      hit = (x, y) => {
        const dx = x - cx, dy = y - cy
        const d = Math.hypot(dx, dy)
        if (d > r * 1.25) return false
        if (Math.abs(d - r) < t) return true
        if (Math.hypot(dx - ex, dy - ey) < er) return true
        if (Math.hypot(dx + ex, dy - ey) < er) return true
        const md = Math.hypot(dx, dy - r * 0.05)
        return Math.abs(md - r * 0.62) < t && dy > r * 0.16
      }
      bounds = span(cx, cy, r * 1.25 + 2)
      break
    }
    case 'spiral': {
      const turns = 2 + rnd() * 2.5
      const rMax = (0.25 + sev * 0.55) * Math.min(W, H) * 0.8
      const t = Math.max(2.2, rMax * 0.075)
      hit = (x, y) => {
        const dx = x - cx, dy = y - cy
        const d = Math.hypot(dx, dy)
        if (d > rMax || d < 1) return false
        const ang = Math.atan2(dy, dx)
        const arm = (d / rMax) * turns * Math.PI * 2
        let diff = ((arm - ang) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)
        if (diff > Math.PI) diff -= Math.PI * 2
        return Math.abs(diff) * d / turns < t
      }
      bounds = span(cx, cy, rMax + 2)
      break
    }
    case 'dots': {
      const s = Math.max(8, H / (3 + Math.round(rnd() * 5)))
      const r = s * (0.16 + sev * 0.26)
      hit = (x, y) => {
        const mx = ((x % s) + s) % s - s / 2
        const my = ((y % s) + s) % s - s / 2
        return mx * mx + my * my < r * r
      }
      break
    }
    case 'bite': {
      const r = (0.18 + sev * 0.5) * Math.min(W, H)
      hit = (x, y) => Math.hypot(x - cx, y - cy) < r
      bounds = span(cx, cy, r + 2)
      break
    }
  }
  return { hit, cx, cy, salt, bounds }
}

/** Collect the struck cells and give each the progress value at which it is scrubbed. */
export function beginStorm(kind: MaskKind, sev: number, rock: Rock, rnd: () => number): Storm {
  const { hit, cx, cy, salt, bounds } = makeMask(kind, sev, rock, rnd)
  const idx: number[] = []
  const key: number[] = []
  const maxR = Math.hypot(rock.w, rock.h) * 0.5
  for (let y = bounds.y0; y <= bounds.y1; y++) {
    for (let x = bounds.x0; x <= bounds.x1; x++) {
      if (!hit(x, y)) continue
      const dx = x - cx, dy = y - cy
      const th = Math.atan2(dy, dx) / (Math.PI * 2) + 0.5
      const r = Math.hypot(dx, dy) / maxR
      const turb = (fbm2(rock.noise, x / 13 + salt + 707, y / 13, 2) - 0.5) * 0.22
      let ph = (th * TURNS + r * COIL * TURNS + turb) % 1
      if (ph < 0) ph += 1
      idx.push(y * rock.w + x)
      key.push(ph)
    }
  }
  const order = idx.map((_, k) => k).sort((a, b) => key[a] - key[b])
  return {
    kind, severity: sev, salt,
    cells: Int32Array.from(order, k => idx[k]),
    phase: Float32Array.from(order, k => key[k]),
    ptr: 0, age: 0,
    duration: 1.4 + sev * 4.2,
    stripped: 0,
  }
}

/** Hash a cell index into [0,1) for the survivor draw. Keyed on the STORM as well as the
 *  cell: a constant key makes the remnant the same subset of indices in every storm of
 *  every run, which is the opposite of what survivors are for. */
export function survivorRoll(i: number, salt: number): number {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b)
  h = Math.imul(h ^ salt, 0xc2b2ae35)
  h ^= h >>> 15
  h = Math.imul(h, 0x27d4eb2f)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** Advance the sweep. Returns true while the storm is still running. */
export function stepStorm(storm: Storm, colony: Colony, dYears: number): boolean {
  storm.age += dYears
  const progress = Math.min(1, storm.age / storm.duration)
  while (storm.ptr < storm.cells.length && storm.phase[storm.ptr] <= progress) {
    const i = storm.cells[storm.ptr++]
    colony.scour[i] = 1
    if (colony.occ[i] !== -1 && survivorRoll(i, storm.salt) >= SURVIVE) {
      colony.occ[i] = -1
      colony.age[i] = 0
      storm.stripped++
    }
  }
  return progress < 1
}
