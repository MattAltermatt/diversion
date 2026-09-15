import { describe, it, expect } from 'vitest'
import { buildSpectrum, setSlosh, NT } from './spectrum'
import { writePhase } from './phase'

const base = { tilt: 1.78, spread: 0.28, slosh: 0.7, seed: 7 }
const off = (s: { trainsB: Float32Array }, i: number) => s.trainsB[i * 4 + 2]
const wgt = (s: { trainsB: Float32Array }, i: number) => s.trainsB[i * 4 + 3]

describe('writePhase', () => {
  // The mechanism test, and it can ONLY be checked at the uniform level: under
  // jsdom there are no pixels at all, and in a browser the canvas has no
  // preserveDrawingBuffer, so a read-back is blank and proves nothing.
  it('a standing train holds phase and moves weight', () => {
    const s = buildSpectrum(base)
    setSlosh(s, 1)
    writePhase(s, 0)
    const w0 = Array.from({ length: NT }, (_, i) => wgt(s, i))
    writePhase(s, 3.1)
    for (let i = 0; i < NT; i++) {
      expect(off(s, i)).toBe(0)
      expect(wgt(s, i)).not.toBeCloseTo(w0[i], 5)
      expect(Math.abs(wgt(s, i))).toBeLessThanOrEqual(1)
    }
  })

  it('a travelling train holds weight at 1 and moves phase', () => {
    const s = buildSpectrum(base)
    setSlosh(s, 0)
    writePhase(s, 0)
    const p0 = Array.from({ length: NT }, (_, i) => off(s, i))
    writePhase(s, 3.1)
    for (let i = 0; i < NT; i++) {
      expect(wgt(s, i)).toBe(1)
      expect(off(s, i)).not.toBeCloseTo(p0[i], 5)
    }
  })

  it('mixed slosh splits the spectrum exactly along the standing mask', () => {
    const s = buildSpectrum(base)
    setSlosh(s, 0.5)
    writePhase(s, 2.0)
    for (let i = 0; i < NT; i++) {
      if (s.standing[i]) {
        expect(off(s, i)).toBe(0)
        expect(wgt(s, i)).not.toBe(1)
      } else {
        expect(wgt(s, i)).toBe(1)
        expect(off(s, i)).not.toBe(0)
      }
    }
  })

  // An unbounded accumulated phase loses float32 precision over exactly the long
  // unattended run this gallery exists for.
  it('keeps the travelling phase wrapped for any elapsed time', () => {
    const s = buildSpectrum(base)
    setSlosh(s, 0)
    for (const t of [0, 1, 1e3, 1e5, 1e7]) {
      writePhase(s, t)
      for (let i = 0; i < NT; i++) {
        expect(Math.abs(off(s, i)), `t=${t} train ${i}`).toBeLessThanOrEqual(2 * Math.PI + 1e-6)
      }
    }
  })

  it('is a pure function of t — same t, same output', () => {
    const s = buildSpectrum(base)
    writePhase(s, 5.5)
    const a = Array.from(s.trainsB)
    writePhase(s, 9.9)
    writePhase(s, 5.5)
    expect(Array.from(s.trainsB)).toEqual(a)
  })
})
