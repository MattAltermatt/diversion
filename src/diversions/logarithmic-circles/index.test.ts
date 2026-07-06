import { describe, it, expect } from 'vitest'
import logCircles from './index'

describe('logarithmic-circles diversion contract', () => {
  it('exposes the framework contract', () => {
    expect(logCircles.id).toBe('logarithmic-circles')
    expect(logCircles.kind).toBe('webgl')
    expect(typeof logCircles.setup).toBe('function')
    expect(typeof logCircles.frame).toBe('function')
    expect(typeof logCircles.teardown).toBe('function')
    expect(logCircles.schema).toBeDefined()
  })
  it('declares Palette and Motion preset groups', () => {
    const labels = (logCircles.presets ?? []).map((g) => g.label)
    expect(labels).toContain('Palette')
    expect(labels).toContain('Motion')
  })
})
