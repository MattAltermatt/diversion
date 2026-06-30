import { describe, it, expect } from 'vitest'
import { nextState, RULE_TABLE } from './rule'

describe('Langton rule table', () => {
  it('keeps the empty neighborhood quiescent (rule 000000)', () => {
    expect(nextState(0, 0, 0, 0, 0)).toBe(0)
  })

  it('applies a known base transition (rule 000012: C0 T0 R0 B0 L1 -> 2)', () => {
    expect(nextState(0, 0, 0, 0, 1)).toBe(2)
  })

  it('is rotate4-symmetric: all 4 cyclic rotations of (T,R,B,L) give the same output', () => {
    // base (T,R,B,L) = (0,0,0,1) -> 2; cyclic rotations must also -> 2
    expect(nextState(0, 0, 0, 0, 1)).toBe(2) // T,R,B,L = 0,0,0,1
    expect(nextState(0, 1, 0, 0, 0)).toBe(2) // T,R,B,L = 1,0,0,0
    expect(nextState(0, 0, 1, 0, 0)).toBe(2) // T,R,B,L = 0,1,0,0
    expect(nextState(0, 0, 0, 1, 0)).toBe(2) // T,R,B,L = 0,0,1,0
  })

  it('applies another known transition (rule 113221: C1 T1 R3 B2 L2 -> 1)', () => {
    expect(nextState(1, 1, 3, 2, 2)).toBe(1)
  })

  it('builds a dense 32768-entry table', () => {
    expect(RULE_TABLE.length).toBe(32768)
  })
})
