import { describe, it, expect } from 'vitest'
import { newPen, advance } from './powder'
import { buildComposition } from './composition'
import { DEFAULTS } from './config'

const comp = buildComposition(DEFAULTS, 1200, 900, 42)
const STEP = 1.7, MAX = 1100, SEED = 42

const run = (chunk: () => number) => {
  const pen = newPen()
  const out: string[] = []
  for (let i = 0; i < 200000 && pen.si < comp.strokes.length; i++) {
    for (const s of advance(pen, comp, chunk(), STEP, MAX, SEED)) {
      out.push(`${s.stroke}:${s.ord}:${s.x.toFixed(6)}:${s.y.toFixed(6)}:${s.col}:${s.seed}`)
    }
  }
  return out
}

describe('the pen is independent of how the draw is CHUNKED', () => {
  it('lays an identical stamp stream under one call, per-frame, and irregular chunking', () => {
    const one = run(() => comp.total)
    let n = 0
    expect(run(() => comp.Rmax * 1.5 * (16 / 1000))).toEqual(one)   // the regime that matters
    expect(run(() => 3 + ((n++ % 37) * 11))).toEqual(one)
    expect(one.length).toBeGreaterThan(20000)    // measured 23,413 — non-vacuity
  }, 30000)
})
