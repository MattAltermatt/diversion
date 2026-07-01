import { describe, it, expect } from 'vitest'
import {
  randomGenome, crossover, mutate, repair, pairIndex,
  MAX_NODES, MIN_NODES, MAX_WHEELS, MIN_WHEELS, N_PAIRS, DEFAULT_RANGES,
} from './genome'
import { mulberry32 } from '../../framework/rng'

const countNodes = (g: ReturnType<typeof randomGenome>) => g.nodes.filter(n => n.present).length
const countWheels = (g: ReturnType<typeof randomGenome>) => g.wheels.filter(w => w.present).length

describe('randomGenome', () => {
  it('is fixed-length with valid counts and in-range values', () => {
    for (let s = 1; s <= 30; s++) {
      const g = randomGenome(mulberry32(s))
      expect(g.nodes).toHaveLength(MAX_NODES)
      expect(g.pairs).toHaveLength(N_PAIRS)
      expect(g.wheels).toHaveLength(MAX_WHEELS)
      expect(countNodes(g)).toBeGreaterThanOrEqual(MIN_NODES)
      expect(countWheels(g)).toBeGreaterThanOrEqual(MIN_WHEELS)
      for (const n of g.nodes) {
        expect(n.x).toBeGreaterThanOrEqual(DEFAULT_RANGES.nodeXMin)
        expect(n.x).toBeLessThanOrEqual(DEFAULT_RANGES.nodeXMax)
      }
      for (const w of g.wheels) {
        if (!w.present) continue
        expect(g.nodes[w.node].present).toBe(true) // wheel mounts an active node
        expect(w.motorSpeed).toBeGreaterThanOrEqual(0) // forward only
        expect(w.motorSpeed).toBeLessThanOrEqual(DEFAULT_RANGES.motorSpeedMax)
      }
      const wheelNodes = g.wheels.filter(w => w.present).map(w => w.node)
      expect(new Set(wheelNodes).size).toBe(wheelNodes.length) // one wheel per node
    }
  })

  it('never produces a backward-spinning wheel (forward-only motor)', () => {
    for (let s = 1; s <= 40; s++) {
      for (const w of randomGenome(mulberry32(s)).wheels) {
        expect(w.motorSpeed).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('is deterministic for a given seed', () => {
    expect(randomGenome(mulberry32(7))).toEqual(randomGenome(mulberry32(7)))
  })
})

describe('pairIndex', () => {
  it('maps every unordered pair to a distinct slot in [0, N_PAIRS)', () => {
    const seen = new Set<number>()
    for (let i = 0; i < MAX_NODES; i++)
      for (let j = i + 1; j < MAX_NODES; j++) {
        const idx = pairIndex(i, j)
        expect(idx).toBe(pairIndex(j, i)) // symmetric
        expect(idx).toBeGreaterThanOrEqual(0)
        expect(idx).toBeLessThan(N_PAIRS)
        expect(seen.has(idx)).toBe(false)
        seen.add(idx)
      }
    expect(seen.size).toBe(N_PAIRS)
  })
})

describe('randomGenome new physics genes', () => {
  it('draws node radius/friction + wheel suspension in their anti-jitter-safe ranges', () => {
    for (let s = 1; s <= 30; s++) {
      const g = randomGenome(mulberry32(s))
      for (const n of g.nodes) {
        expect(n.radius).toBeGreaterThanOrEqual(DEFAULT_RANGES.nodeRadiusMin)
        expect(n.radius).toBeLessThanOrEqual(DEFAULT_RANGES.nodeRadiusMax)
        expect(n.friction).toBeGreaterThanOrEqual(DEFAULT_RANGES.nodeFrictionMin)
        expect(n.friction).toBeLessThanOrEqual(DEFAULT_RANGES.nodeFrictionMax)
      }
      for (const w of g.wheels) {
        expect(w.suspensionDamping).toBeGreaterThanOrEqual(DEFAULT_RANGES.suspDampingMin) // floor > bouncy 0.7
        expect(w.suspensionDamping).toBeLessThanOrEqual(DEFAULT_RANGES.suspDampingMax)
        expect(w.suspensionHertz).toBeGreaterThanOrEqual(DEFAULT_RANGES.suspHertzMin)
        expect(w.suspensionHertz).toBeLessThanOrEqual(DEFAULT_RANGES.suspHertzMax)
        expect(Math.abs(w.suspensionAxis)).toBeLessThanOrEqual(DEFAULT_RANGES.suspAxisMax)
        expect(w.suspensionTravel).toBeGreaterThanOrEqual(DEFAULT_RANGES.suspTravelMin)
      }
    }
  })
})

describe('crossover', () => {
  it('every pair gene comes from a parent and the child is valid + deterministic', () => {
    const a = randomGenome(mulberry32(1)), b = randomGenome(mulberry32(2))
    const child = crossover(a, b, mulberry32(3))
    child.pairs.forEach((p, i) =>
      expect([a.pairs[i].stiffness, b.pairs[i].stiffness]).toContain(p.stiffness))
    expect(countNodes(child)).toBeGreaterThanOrEqual(MIN_NODES)
    expect(countWheels(child)).toBeGreaterThanOrEqual(MIN_WHEELS)
    expect(crossover(a, b, mulberry32(3))).toEqual(crossover(a, b, mulberry32(3)))
  })

  it('inherits each node record coherently from ONE parent (no coordinate mixing)', () => {
    const a = randomGenome(mulberry32(1)), b = randomGenome(mulberry32(2))
    const child = crossover(a, b, mulberry32(3))
    child.nodes.forEach((n, i) => {
      const fromA = n.x === a.nodes[i].x && n.y === a.nodes[i].y &&
        n.mass === a.nodes[i].mass && n.radius === a.nodes[i].radius && n.friction === a.nodes[i].friction
      const fromB = n.x === b.nodes[i].x && n.y === b.nodes[i].y &&
        n.mass === b.nodes[i].mass && n.radius === b.nodes[i].radius && n.friction === b.nodes[i].friction
      expect(fromA || fromB).toBe(true) // a node is never a chimera of both parents
    })
  })

  it('mounts each child wheel on an active node and keeps the suspension coherent', () => {
    const a = randomGenome(mulberry32(4)), b = randomGenome(mulberry32(5))
    const child = crossover(a, b, mulberry32(6))
    for (const w of child.wheels) {
      if (!w.present) continue
      expect(child.nodes[w.node].present).toBe(true)
      // a present wheel's suspension fields are all finite + in their safe band
      expect(w.suspensionDamping).toBeGreaterThanOrEqual(DEFAULT_RANGES.suspDampingMin)
      expect(Number.isFinite(w.suspensionAxis)).toBe(true)
    }
  })
})

describe('mutate', () => {
  it('rate 0 is identity', () => {
    const g = randomGenome(mulberry32(5))
    expect(mutate(g, 0, mulberry32(9))).toEqual(g)
  })

  it('rate 1 keeps the genome valid and in range', () => {
    const g = randomGenome(mulberry32(5))
    const m = mutate(g, 1, mulberry32(9))
    expect(m.nodes).toHaveLength(MAX_NODES)
    expect(countNodes(m)).toBeGreaterThanOrEqual(MIN_NODES)
    expect(countWheels(m)).toBeGreaterThanOrEqual(MIN_WHEELS)
    m.wheels.forEach(w => { if (w.present) expect(m.nodes[w.node].present).toBe(true) })
    const wheelNodes = m.wheels.filter(w => w.present).map(w => w.node)
    expect(new Set(wheelNodes).size).toBe(wheelNodes.length) // one wheel per node
  })
})

describe('one wheel per node', () => {
  it('drops/relocates duplicate wheels so no two share a node', () => {
    const g = randomGenome(mulberry32(2))
    // force every wheel onto node 0 → repair must spread or drop them
    g.wheels.forEach(w => { w.present = true; w.node = 0 })
    const r = repair(g)
    const nodes = r.wheels.filter(w => w.present).map(w => w.node)
    expect(new Set(nodes).size).toBe(nodes.length)
    expect(nodes.length).toBeGreaterThanOrEqual(MIN_WHEELS)
    expect(nodes.length).toBeLessThanOrEqual(r.nodes.filter(n => n.present).length)
  })
})

describe('repair', () => {
  it('forces a wiped genome up to the minimums', () => {
    const g = randomGenome(mulberry32(11))
    g.nodes.forEach(n => (n.present = false))
    g.wheels.forEach(w => (w.present = false))
    const r = repair(g)
    expect(countNodes(r)).toBe(MIN_NODES)
    expect(countWheels(r)).toBe(MIN_WHEELS)
    r.wheels.forEach(w => { if (w.present) expect(r.nodes[w.node].present).toBe(true) })
  })
})
