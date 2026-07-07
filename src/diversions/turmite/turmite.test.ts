import { describe, it, expect } from 'vitest'
import { applyTurn, parseRule, createTurmiteState, DIRS, stepOnce, shouldReseed, stepsForDt, hex8ToRgba } from './turmite'
import { turmiteSchema, RULES, type TurmiteConfig } from './schema'
import { encodeConfig, decodeConfig } from '../../framework/urlCodec'
import { rulePresets, palettePresets } from './presets'
import turmite from './index'

const base = turmiteSchema.parse({})

describe('applyTurn', () => {
  // headings: 0=N,1=E,2=S,3=W
  it('L rotates counter-clockwise', () => {
    expect(applyTurn(0, 'L')).toBe(3) // N -> W
    expect(applyTurn(1, 'L')).toBe(0) // E -> N
  })
  it('R rotates clockwise', () => {
    expect(applyTurn(0, 'R')).toBe(1) // N -> E
    expect(applyTurn(3, 'R')).toBe(0) // W -> N
  })
  it('U reverses', () => {
    expect(applyTurn(0, 'U')).toBe(2)
    expect(applyTurn(1, 'U')).toBe(3)
  })
  it('N keeps heading', () => {
    expect(applyTurn(2, 'N')).toBe(2)
  })
})

describe('parseRule', () => {
  it('splits a rule string into per-state turn letters', () => {
    expect(parseRule('RL')).toEqual(['R', 'L'])
    expect(parseRule('LRRRRRLLR')).toHaveLength(9)
  })
})

describe('createTurmiteState determinism', () => {
  it('places ants identically for the same seed', () => {
    const a = createTurmiteState({ ...base, seed: 42 }, 400, 300)
    const b = createTurmiteState({ ...base, seed: 42 }, 400, 300)
    expect(a.ants).toEqual(b.ants)
  })
  it('places ants differently for different seeds', () => {
    const a = createTurmiteState({ ...base, seed: 1 }, 400, 300)
    const b = createTurmiteState({ ...base, seed: 2 }, 400, 300)
    expect(a.ants).not.toEqual(b.ants)
  })
  it('starts every grid cell at state 0', () => {
    const s = createTurmiteState(base, 200, 200)
    expect(s.grid.every((v) => v === 0)).toBe(true)
  })
  it('sizes the grid to ceil(px / cellSize)', () => {
    const s = createTurmiteState({ ...base, cellSize: 10 }, 200, 100)
    expect(s.cols).toBe(20)
    expect(s.rows).toBe(10)
    expect(s.grid.length).toBe(200)
  })
  it('places every ant within grid bounds', () => {
    const s = createTurmiteState({ ...base, ants: 12, seed: 5 }, 400, 300)
    for (const ant of s.ants) {
      expect(ant.x).toBeGreaterThanOrEqual(0)
      expect(ant.x).toBeLessThan(s.cols)
      expect(ant.y).toBeGreaterThanOrEqual(0)
      expect(ant.y).toBeLessThan(s.rows)
      expect(ant.h).toBeGreaterThanOrEqual(0)
      expect(ant.h).toBeLessThan(4)
    }
  })
})

describe('DIRS', () => {
  it('maps headings to unit steps (N,E,S,W)', () => {
    expect(DIRS).toEqual([[0, -1], [1, 0], [0, 1], [-1, 0]])
  })
})

describe('stepOnce', () => {
  it('advances the visited cell state and paints it', () => {
    const s = createTurmiteState({ ...base, rule: 'RL', ants: 1, seed: 1, cellSize: 10 }, 100, 100)
    s.ants[0] = { x: 5, y: 5, h: 0 }
    const painted: Array<[number, number, number]> = []
    stepOnce(s, (x, y, state) => painted.push([x, y, state]))
    // cell (5,5) was 0 -> becomes 1, painted with state 1
    expect(s.grid[5 * s.cols + 5]).toBe(1)
    expect(painted).toContainEqual([5, 5, 1])
  })

  it('wraps toroidally off the right edge', () => {
    const s = createTurmiteState({ ...base, rule: 'NN' as TurmiteConfig['rule'], ants: 1, cellSize: 10 }, 100, 100)
    // 'N' = no turn; ant facing E at the last column steps to column 0
    s.ants[0] = { x: s.cols - 1, y: 3, h: 1 } // facing East
    stepOnce(s, () => {})
    expect(s.ants[0].x).toBe(0)
    expect(s.ants[0].y).toBe(3)
  })

  it('wraps toroidally off the top edge', () => {
    const s = createTurmiteState({ ...base, rule: 'NN' as TurmiteConfig['rule'], ants: 1, cellSize: 10 }, 100, 100)
    s.ants[0] = { x: 4, y: 0, h: 0 } // facing North
    stepOnce(s, () => {})
    expect(s.ants[0].y).toBe(s.rows - 1)
  })

  it('counts coverage only on first paint of a cell', () => {
    const s = createTurmiteState({ ...base, rule: 'UU' as TurmiteConfig['rule'], ants: 1, cellSize: 10 }, 100, 100)
    // 'U' u-turn: ant ping-pongs over two cells, revisiting them
    s.ants[0] = { x: 5, y: 5, h: 1 }
    for (let i = 0; i < 6; i++) stepOnce(s, () => {})
    // only the handful of distinct visited cells count, not every step
    expect(s.painted).toBeLessThanOrEqual(2 + 1) // ping-pong touches few cells
    expect(s.painted).toBeGreaterThan(0)
  })

  it('cycles state back to 0 after nStates visits', () => {
    const s = createTurmiteState({ ...base, rule: 'UU' as TurmiteConfig['rule'], ants: 1, cellSize: 10 }, 100, 100)
    const idx = 5 * s.cols + 5
    s.ants[0] = { x: 5, y: 5, h: 1 }
    // nStates = 2; visiting the same cell twice cycles 0->1->0
    stepOnce(s, () => {}) // visits (5,5): 0->1, steps east
    s.ants[0] = { x: 5, y: 5, h: 1 }
    stepOnce(s, () => {}) // visits (5,5) again: 1->0
    expect(s.grid[idx]).toBe(0)
  })
})

describe('stepsForDt', () => {
  it('converts dt + speed into whole steps, carrying the remainder', () => {
    const s = createTurmiteState({ ...base, speed: 1000 }, 100, 100) // 1000 steps/s
    // 16ms at 1000/s = 16 steps
    expect(stepsForDt(s, 16)).toBe(16)
    expect(s.carry).toBeCloseTo(0, 5)
  })
  it('accumulates fractional steps across frames', () => {
    const s = createTurmiteState({ ...base, speed: 100 }, 100, 100) // 100 steps/s
    // 5ms at 100/s = 0.5 step -> 0 this frame, 0.5 carried
    expect(stepsForDt(s, 5)).toBe(0)
    expect(stepsForDt(s, 5)).toBe(1) // 0.5 + 0.5 = 1
  })
  it('caps a single frame to avoid spiral-of-death after a long stall', () => {
    const s = createTurmiteState({ ...base, speed: 4000 }, 100, 100)
    expect(stepsForDt(s, 100000)).toBeLessThanOrEqual(20000) // clamped
  })
})

describe('shouldReseed', () => {
  it('fires when coverage crosses the threshold', () => {
    const s = createTurmiteState(base, 100, 100)
    s.painted = Math.floor(s.cols * s.rows * 0.96)
    expect(shouldReseed(s)).toBe(true)
  })
  it('does not fire on a sparse grid', () => {
    const s = createTurmiteState(base, 100, 100)
    s.painted = 5
    expect(shouldReseed(s)).toBe(false)
  })
})

describe('turmite live update (#270 — palette recolours the accumulated pattern)', () => {
  const size = { width: 200, height: 200 }

  it('flags a full repaint when the palette changes so painted cells recolour', () => {
    const state = createTurmiteState(base, size.width, size.height)
    state.bgDirty = false
    const palette = [...base.palette]
    palette[1] = '#123456ff' // change one stop
    const applied = turmite.update!(state, { ...base, palette }, size)
    expect(applied).toBe(true)
    expect(state.bgDirty).toBe(true) // repaintBackground() will redraw the grid with new styles
    expect(state.styles).toContain(hex8ToRgba('#123456ff'))
  })

  it('does not flag a repaint when no visual field changed', () => {
    const state = createTurmiteState(base, size.width, size.height)
    state.bgDirty = false
    turmite.update!(state, { ...base }, size)
    expect(state.bgDirty).toBe(false)
  })
})

describe('turmite codec round-trip', () => {
  it('encodes then decodes back to the same config (seed is pin-only, reverts to default)', () => {
    const cfg = turmiteSchema.parse({ rule: 'LLRR', ants: 6, cellSize: 8, seed: 99 })
    const round = decodeConfig(turmiteSchema, encodeConfig(turmiteSchema, cfg))
    // seed is a randomizeOnFreshLoad field → encode omits it, decode reverts to default.
    expect(round).toEqual({ ...cfg, seed: turmiteSchema.parse({}).seed })
  })
})

describe('turmite presets', () => {
  it('every Rule preset patches a rule in the schema enum', () => {
    const valid = new Set<string>(RULES)
    for (const p of rulePresets) expect(valid.has(p.patch.rule as string)).toBe(true)
  })
  it('every Palette preset is a valid hex8 array within bounds', () => {
    for (const p of palettePresets) {
      const arr = p.patch.palette as string[]
      expect(arr.length).toBeGreaterThanOrEqual(2)
      expect(arr.length).toBeLessThanOrEqual(12)
      for (const c of arr) expect(c).toMatch(/^#[0-9a-fA-F]{8}$/)
    }
  })
})
