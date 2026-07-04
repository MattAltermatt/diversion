import { describe, it, expect } from 'vitest'
import { advance, applyConfig, createState, simulateBlot, type Mark } from './rorschach'
import { rorschachSchema, type RorschachConfig } from './schema'

const cfg = (over: Partial<RorschachConfig> = {}): RorschachConfig => rorschachSchema.parse({ ...over })

const W = 480
const H = 360

// A stable key for a mark, quantized so float dust from the mirror arithmetic can't
// split a reflected pair. w - x is exact for the vertical axis, but quad's h - y and
// general rounding warrant a small tolerance.
const key = (x: number, y: number) => `${Math.round(x * 100)}:${Math.round(y * 100)}`

describe('rorschach schema', () => {
  it('parses with valid defaults', () => {
    const c = cfg()
    expect(c.symmetry).toBe('bilateral')
    expect(c.lobes).toBe(4)
    expect(c.blotColor).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(c.background).toMatch(/^#[0-9a-fA-F]{6}$/)
  })
  it('rejects an out-of-range field', () => {
    expect(() => rorschachSchema.parse({ lobes: 99 })).toThrow()
  })
})

describe('rorschach determinism', () => {
  it('same seed → identical blot', () => {
    const a = simulateBlot(cfg({ seed: 42 }), W, H)
    const b = simulateBlot(cfg({ seed: 42 }), W, H)
    expect(a.marks.length).toBe(b.marks.length)
    expect(a.marks).toEqual(b.marks)
  })
  it('different seed → different blot', () => {
    const a = simulateBlot(cfg({ seed: 1 }), W, H)
    const b = simulateBlot(cfg({ seed: 2 }), W, H)
    expect(a.marks).not.toEqual(b.marks)
  })
  it('is frame-rate independent (dt granularity does not change the mark set)', () => {
    const coarse = simulateBlot(cfg({ seed: 7 }), W, H)
    // fine-grained stepping to the same end state
    const s = createState(cfg({ seed: 7 }), W, H)
    let guard = 0
    while (s.phase === 'grow' && guard < 400000) { advance(s, 4); guard++ }
    expect(s.marks).toEqual(coarse.marks)
  })
})

// ─── HEADLINE probe: the finished ink field is EXACTLY mirror-symmetric ─────────
function assertVerticalMirror(marks: Mark[], w: number) {
  const set = new Set(marks.map((m) => key(m.x, m.y)))
  for (const m of marks) {
    expect(set.has(key(w - m.x, m.y))).toBe(true)
  }
}

describe('rorschach mirror symmetry (headline)', () => {
  it('bilateral: every mark has a vertical-axis reflection', () => {
    const s = simulateBlot(cfg({ seed: 3, symmetry: 'bilateral' }), W, H)
    assertVerticalMirror(s.marks, W)
  })

  it('quad: every mark has both a vertical AND a horizontal reflection', () => {
    const s = simulateBlot(cfg({ seed: 3, symmetry: 'quad' }), W, H)
    const set = new Set(s.marks.map((m) => key(m.x, m.y)))
    for (const m of s.marks) {
      expect(set.has(key(W - m.x, m.y))).toBe(true) // vertical
      expect(set.has(key(m.x, H - m.y))).toBe(true) // horizontal
    }
  })

  it('non-degenerate: substantial, spread-out coverage with no NaN', () => {
    const s = simulateBlot(cfg({ seed: 5 }), W, H)
    expect(s.marks.length).toBeGreaterThan(400)
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const m of s.marks) {
      expect(Number.isFinite(m.x)).toBe(true)
      expect(Number.isFinite(m.y)).toBe(true)
      expect(Number.isFinite(m.r)).toBe(true)
      expect(m.r).toBeGreaterThan(0)
      minX = Math.min(minX, m.x); maxX = Math.max(maxX, m.x)
      minY = Math.min(minY, m.y); maxY = Math.max(maxY, m.y)
    }
    // the blot spreads across a real area (not collapsed to a point/line) and, being
    // mirrored, straddles the vertical axis.
    expect(maxX - minX).toBeGreaterThan(W * 0.2)
    expect(maxY - minY).toBeGreaterThan(H * 0.15)
    expect(minX).toBeLessThan(W / 2)
    expect(maxX).toBeGreaterThan(W / 2)
  })
})

describe('rorschach lifecycle', () => {
  it('cycles grow → hold → fade → reseed', () => {
    const s = createState(cfg({ seed: 9, growthSpeed: 3, holdSeconds: 1 }), W, H)
    expect(s.phase).toBe('grow')
    // run well past grow + hold + fade
    for (let i = 0; i < 2000; i++) advance(s, 16)
    // after a full cycle it has reseeded at least once and is growing a fresh blot
    expect(s.gen).toBeGreaterThan(0)
  })
})

describe('rorschach applyConfig', () => {
  it('applies appearance edits live and flags a rebake', () => {
    const s = createState(cfg({ twoTone: false }), W, H)
    s.needsFullRedraw = false
    expect(applyConfig(s, cfg({ twoTone: true }))).toBe(true)
    expect(s.needsFullRedraw).toBe(true)
  })
  it('rejects structural edits for a full re-setup', () => {
    const s = createState(cfg({ seed: 1 }), W, H)
    expect(applyConfig(s, cfg({ seed: 2 }))).toBe(false)
    expect(applyConfig(s, cfg({ symmetry: 'quad' }))).toBe(false)
    expect(applyConfig(s, cfg({ lobes: 6 }))).toBe(false)
  })
  it('background edits apply live without a rebake', () => {
    const s = createState(cfg({ background: '#000000' }), W, H)
    s.needsFullRedraw = false
    expect(applyConfig(s, cfg({ background: '#ffffff' }))).toBe(true)
    expect(s.needsFullRedraw).toBe(false)
  })
})
