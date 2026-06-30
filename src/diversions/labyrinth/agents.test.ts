import { describe, it, expect } from 'vitest'
import { texDimFor, initAgentsAtStart, buildLUT } from './agents'

describe('initAgentsAtStart', () => {
  it('places all agents inside the start-cell UV box', () => {
    const cellFracX = 1 / 10, cellFracY = 1 / 8
    const data = initAgentsAtStart(7, 5000, cellFracX, cellFracY)
    const dim = texDimFor(5000)
    for (let i = 0; i < 5000; i++) {
      const x = data[i * 4 + 0], y = data[i * 4 + 1]
      expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(cellFracX)
      expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(cellFracY)
    }
    expect(data.length).toBe(dim * dim * 4)
  })

  it('is deterministic', () => {
    const a = initAgentsAtStart(1, 1000, 0.1, 0.1)
    const b = initAgentsAtStart(1, 1000, 0.1, 0.1)
    expect(Array.from(a)).toEqual(Array.from(b))
  })
})

describe('buildLUT', () => {
  it('maps the first stop to index 0 and the last to index 255', () => {
    const lut = buildLUT(['#000000', '#ffffff'])
    expect(lut[0]).toBe(0)             // R at t=0
    expect(lut[255 * 4 + 0]).toBe(255) // R at t=1
    expect(lut[255 * 4 + 3]).toBe(255) // opaque
  })
})
