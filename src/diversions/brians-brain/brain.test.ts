import { describe, it, expect } from 'vitest'
import {
  createBrainState, stepBrain, seedBoard, updateBrain, buildLut,
  BB_OFF, BB_ON, BB_DYING, WW_EMPTY, WW_WIRE, WW_HEAD, WW_TAIL, type BrainState,
} from './brain'
import { briansBrainSchema, type BriansBrainConfig } from './schema'

const cfg = (over: Partial<BriansBrainConfig> = {}): BriansBrainConfig =>
  briansBrainSchema.parse({ seed: 1, ...over })

// Build a blank grid of a known size (cellSize 10 → gw=w/10, gh=h/10) and clear it.
function blank(over: Partial<BriansBrainConfig>, w: number, h: number): BrainState {
  const st = createBrainState(cfg({ cellSize: 10, ...over }), w, h)
  st.cur.fill(0)
  return st
}
const at = (st: BrainState, x: number, y: number) => st.cur[y * st.gw + x]
const put = (st: BrainState, x: number, y: number, v: number) => { st.cur[y * st.gw + x] = v }

describe('schema', () => {
  it('parses with valid defaults', () => {
    const c = briansBrainSchema.parse({})
    expect(c.rule).toBe("Brian's Brain")
    expect(c.cellSize).toBe(5)
    expect(c.speed).toBe(14)
    expect(c.background).toMatch(/^#[0-9a-fA-F]{6}$/)
  })
  it('builds a 3-slot LUT for Brian’s Brain and a 4-slot LUT for Wireworld', () => {
    expect(buildLut(cfg())).toHaveLength(3)
    expect(buildLut(cfg({ rule: 'Wireworld' }))).toHaveLength(4)
  })
})

describe('determinism', () => {
  it('same seed → identical evolution across K steps (both rules)', () => {
    for (const rule of ["Brian's Brain", 'Wireworld'] as const) {
      const a = createBrainState(cfg({ rule, cellSize: 6 }), 240, 180)
      const b = createBrainState(cfg({ rule, cellSize: 6 }), 240, 180)
      for (let i = 0; i < 25; i++) { stepBrain(a); stepBrain(b) }
      expect(Array.from(a.cur)).toEqual(Array.from(b.cur))
    }
  })
  it('different seed → different starting field', () => {
    const a = createBrainState(cfg({ seed: 1, cellSize: 6 }), 240, 180)
    const b = createBrainState(cfg({ seed: 2, cellSize: 6 }), 240, 180)
    expect(Array.from(a.cur)).not.toEqual(Array.from(b.cur))
  })
})

describe("HEADLINE — Brian's Brain rule transitions are exact", () => {
  // OFF → ON iff EXACTLY 2 ON neighbours; ON → DYING; DYING → OFF. Verified on a
  // hand-checked micro pattern (an ON domino) whose successor is derivable by hand.
  it('OFF wakes on exactly 2 ON neighbours; ON→DYING; a 1-neighbour cell stays OFF', () => {
    const st = blank({}, 70, 70) // 7×7 grid
    put(st, 3, 3, BB_ON)
    put(st, 4, 3, BB_ON) // horizontal ON domino
    stepBrain(st)
    // the two ON cells flash to DYING
    expect(at(st, 3, 3)).toBe(BB_DYING)
    expect(at(st, 4, 3)).toBe(BB_DYING)
    // the four corner cells each border BOTH ON cells (exactly 2) → wake ON
    for (const [x, y] of [[3, 2], [4, 2], [3, 4], [4, 4]]) expect(at(st, x, y)).toBe(BB_ON)
    // a cell bordering only ONE ON cell (exactly 1) stays OFF
    expect(at(st, 2, 3)).toBe(BB_OFF)
  })

  it('does NOT wake a cell with 3 ON neighbours (the "exactly 2" upper bound)', () => {
    const st = blank({}, 70, 70)
    // L-tromino: (3,3),(4,3),(3,4) all ON → cell (4,4) borders all three
    put(st, 3, 3, BB_ON); put(st, 4, 3, BB_ON); put(st, 3, 4, BB_ON)
    stepBrain(st)
    expect(at(st, 4, 4)).toBe(BB_OFF) // 3 ON neighbours → stays OFF
  })

  it('DYING → OFF unconditionally', () => {
    const st = blank({}, 70, 70)
    put(st, 3, 3, BB_DYING) // isolated dying cell
    stepBrain(st)
    expect(at(st, 3, 3)).toBe(BB_OFF)
  })
})

describe("HEADLINE — a Brian's Brain spaceship translates across the grid", () => {
  // The settled c/1 orthogonal spaceship (found by search, verified against this
  // module): ON {(2,0),(0,1),(0,2)} + DYING {(3,0),(1,1),(1,2)} translates by
  // (-1,0) every single step. Assert it crosses the grid intact.
  const SHIP_ON: [number, number][] = [[2, 0], [0, 1], [0, 2]]
  const SHIP_DYING: [number, number][] = [[3, 0], [1, 1], [1, 2]]
  it('moves left exactly one cell per step, keeping its shape', () => {
    const st = blank({}, 300, 120) // 30×12 grid — room to travel
    const ox = 20, oy = 4
    for (const [x, y] of SHIP_ON) put(st, ox + x, oy + y, BB_ON)
    for (const [x, y] of SHIP_DYING) put(st, ox + x, oy + y, BB_DYING)
    for (let s = 1; s <= 10; s++) {
      stepBrain(st)
      // after s steps the ON cells sit at their start x minus s
      for (const [x, y] of SHIP_ON) expect(at(st, ox + x - s, oy + y)).toBe(BB_ON)
    }
    // it genuinely traveled 10 cells from where it started
    expect(at(st, ox + 2, oy)).toBe(BB_OFF)
  })
})

describe('HEADLINE — the field stays alive over a long run (reseeds on collapse)', () => {
  it("Brian's Brain soup never leaves a dead screen across a long run", () => {
    const st = createBrainState(cfg({ cellSize: 6 }), 360, 240)
    let sawAlive = 0
    for (let s = 0; s < 1500; s++) {
      stepBrain(st)
      if (st.active > 3) sawAlive++
    }
    // essentially every step is lively (a streaming BB field basically never dies)
    expect(sawAlive).toBeGreaterThan(1400)
    expect(st.active).toBeGreaterThan(3) // alive at the end
  })

  it('reseeds a Brian’s Brain field that collapses to empty', () => {
    const st = createBrainState(cfg({ cellSize: 10 }), 100, 100)
    st.cur.fill(BB_OFF) // force a dead field
    st.active = 0
    const seeds0 = st.reseeds
    // a dead BB field stays dead → the absolute-threshold window must trip a reseed
    for (let s = 0; s < 200; s++) stepBrain(st)
    expect(st.reseeds).toBeGreaterThan(seeds0)
  })
})

describe('HEADLINE — Wireworld: a signal propagates along a wire', () => {
  it('an electron head travels down a straight wire, one cell per step', () => {
    const st = blank({ rule: 'Wireworld' }, 200, 30) // 20×3 grid
    const y = 1
    for (let x = 0; x < st.gw; x++) put(st, x, y, WW_WIRE) // a straight wire
    put(st, 5, y, WW_HEAD) // one electron head partway along
    // head at 5 → next step heads appear at 4 and 6 (a bare wire carries both ways),
    // and the signal front advances one cell per step. Track the leading (rightward) front.
    for (let s = 1; s <= 6; s++) {
      stepBrain(st)
      expect(at(st, 5 + s, y)).toBe(WW_HEAD) // the front reached cell 5+s
    }
    // the origin cell has cycled HEAD→TAIL→WIRE (no NaN, valid state)
    expect([WW_EMPTY, WW_WIRE, WW_HEAD, WW_TAIL]).toContain(at(st, 5, y))
  })

  it('every cell is always a valid finite state value (no NaN)', () => {
    const st = createBrainState(cfg({ rule: 'Wireworld', cellSize: 6 }), 240, 180)
    for (let s = 0; s < 60; s++) stepBrain(st)
    for (let i = 0; i < st.cur.length; i++) {
      expect(Number.isInteger(st.cur[i])).toBe(true)
      expect(st.cur[i]).toBeGreaterThanOrEqual(0)
      expect(st.cur[i]).toBeLessThanOrEqual(3)
    }
  })
})

describe('updateBrain (live-apply)', () => {
  it('applies a palette edit live (true) but forces rebuild on a rule/structural change (false)', () => {
    const st = createBrainState(cfg(), 200, 200)
    expect(updateBrain(st, cfg({ onColor: '#ffffff' }))).toBe(true)
    expect(st.lut[BB_ON]).toEqual([255, 255, 255])
    expect(updateBrain(st, cfg({ rule: 'Wireworld' }))).toBe(false)
    expect(updateBrain(st, cfg({ cellSize: 8 }))).toBe(false)
    expect(updateBrain(st, cfg({ seed: 999 }))).toBe(false)
  })
})

describe('seedBoard', () => {
  it('lays down live cells for both rules', () => {
    const bb = createBrainState(cfg(), 200, 200)
    seedBoard(bb)
    expect(bb.cur.some((v) => v === BB_ON)).toBe(true)
    const ww = createBrainState(cfg({ rule: 'Wireworld' }), 200, 200)
    seedBoard(ww)
    expect(ww.cur.some((v) => v === WW_WIRE)).toBe(true)
    expect(ww.cur.some((v) => v === WW_HEAD)).toBe(true)
  })
})
