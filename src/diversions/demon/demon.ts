import { mulberry32 } from '../../framework/rng'
import type { Size } from '../../framework/types'
import { buildTessellation, type Tessellation } from './tessellation'
import { buildHueRing } from './colorRing'
import type { DemonConfig } from './schema'

export interface DemonState {
  cfg: DemonConfig
  w: number; h: number
  tess: Tessellation
  n: number
  kEff: number; tEff: number
  cur: Uint8Array; next: Uint8Array
  lut: string[]
  changed: number[]
  acc: number
  needsClear: boolean
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function clampK(reach: number, n: number): number {
  return clamp(reach, 1, Math.max(1, Math.floor((n - 1) / 2)))
}
function makeLut(cfg: DemonConfig): string[] {
  return buildHueRing(cfg.colors, cfg.color.hueStart, cfg.color.hueSpan, cfg.color.saturation, cfg.color.lightness)
}

export function createDemonState(cfg: DemonConfig, w: number, h: number): DemonState {
  const tess = buildTessellation(cfg.field, cfg.cellSize, w, h)
  const n = cfg.colors
  const rng = mulberry32(cfg.seed >>> 0)
  const cur = new Uint8Array(tess.cellCount)
  for (let i = 0; i < cur.length; i++) cur[i] = Math.floor(rng() * n)
  return {
    cfg, w, h, tess, n,
    kEff: clampK(cfg.dominanceReach, n),
    tEff: clamp(cfg.threshold, 1, tess.degree),
    cur, next: new Uint8Array(tess.cellCount),
    lut: makeLut(cfg),
    changed: [],
    acc: 0,
    needsClear: true,
  }
}

/** One synchronous CA generation. Fills `changed` with indices whose color flipped. */
export function stepDemon(st: DemonState): void {
  const { cur, next, tess, n, kEff, tEff } = st
  const { nbrStart, nbrIdx } = tess
  const changed = st.changed
  changed.length = 0
  for (let i = 0; i < cur.length; i++) {
    const c = cur[i]
    let result = c
    const start = nbrStart[i], end = nbrStart[i + 1]
    for (let j = 1; j <= kEff; j++) {
      const p = (c + j) % n
      let cnt = 0
      for (let e = start; e < end; e++) {
        if (cur[nbrIdx[e]] === p) { cnt++; if (cnt >= tEff) break }
      }
      if (cnt >= tEff) { result = p; break }
    }
    next[i] = result
    if (result !== c) changed.push(i)
  }
  st.cur = next
  st.next = cur
}

/** Live-apply tunable params; return false to force a structural rebuild. */
export function updateDemonState(st: DemonState, cfg: DemonConfig, _size: Size): boolean {
  if (cfg.field !== st.cfg.field || cfg.cellSize !== st.cfg.cellSize
      || cfg.colors !== st.cfg.colors || cfg.seed !== st.cfg.seed) {
    return false // structural: grid geometry or state-space changed → teardown + setup
  }
  st.cfg = cfg
  st.kEff = clampK(cfg.dominanceReach, st.n)
  st.tEff = clamp(cfg.threshold, 1, st.tess.degree)
  st.lut = makeLut(cfg)
  st.needsClear = true // recolor / background change → repaint whole field next frame
  return true
}

/** Rebuild the grid for a new canvas size (reseeds noise). */
export function resizeDemonState(st: DemonState, size: Size): void {
  const fresh = createDemonState(st.cfg, size.width, size.height)
  Object.assign(st, fresh)
}
