import { describe, it, expect } from 'vitest'
import { shouldPause } from './pauseModel'

describe('shouldPause', () => {
  const none = { manual: false, hidden: false, reduced: false, offscreen: false }
  it('runs when no source is active', () => {
    expect(shouldPause(none)).toBe(false)
  })
  it('pauses if any single source is active', () => {
    expect(shouldPause({ ...none, manual: true })).toBe(true)
    expect(shouldPause({ ...none, hidden: true })).toBe(true)
    expect(shouldPause({ ...none, reduced: true })).toBe(true)
    expect(shouldPause({ ...none, offscreen: true })).toBe(true)
  })
  it('stays paused while another source is active even as one clears', () => {
    expect(shouldPause({ ...none, hidden: true, offscreen: true })).toBe(true)
  })
})
