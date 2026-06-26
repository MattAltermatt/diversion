import { describe, it, expect } from 'vitest'
import { listDiversions, getDiversion } from './registry'

describe('registry', () => {
  it('lists at least the flow-field diversion', () => {
    const all = listDiversions()
    expect(all.some((d) => d.id === 'flow-field')).toBe(true)
  })

  it('looks up a diversion by id', () => {
    expect(getDiversion('flow-field')?.title).toBe('Flow Field')
  })

  it('returns an array (empty until diversions are registered)', () => {
    expect(Array.isArray(listDiversions())).toBe(true)
  })

  it('returns undefined for unknown id', () => {
    expect(getDiversion('nope')).toBeUndefined()
  })
})
