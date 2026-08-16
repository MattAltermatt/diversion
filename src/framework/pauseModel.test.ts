import { describe, it, expect } from 'vitest'
import {
  RUNNING,
  hasWakeLock,
  samePauseSources,
  shouldHoldWakeLock,
  shouldPause,
  type PauseSources,
} from './pauseModel'

describe('shouldPause', () => {
  const none = { manual: false, hidden: false, reduced: false, offscreen: false, lost: false }
  it('runs when no source is active', () => {
    expect(shouldPause(none)).toBe(false)
  })
  it('pauses if any single source is active', () => {
    expect(shouldPause({ ...none, manual: true })).toBe(true)
    expect(shouldPause({ ...none, hidden: true })).toBe(true)
    expect(shouldPause({ ...none, reduced: true })).toBe(true)
    expect(shouldPause({ ...none, offscreen: true })).toBe(true)
    expect(shouldPause({ ...none, lost: true })).toBe(true)
  })
  it('stays paused while the WebGL context is lost regardless of other sources', () => {
    expect(shouldPause({ ...none, lost: true })).toBe(true)
  })
  it('stays paused while another source is active even as one clears', () => {
    expect(shouldPause({ ...none, hidden: true, offscreen: true })).toBe(true)
  })

  it('exports RUNNING as the nothing-is-freezing-it state', () => {
    expect(shouldPause(RUNNING)).toBe(false)
    expect(RUNNING).toEqual(none)
  })
})

describe('samePauseSources', () => {
  const none: PauseSources = { ...RUNNING }
  it('compares field-wise, not by identity', () => {
    expect(samePauseSources(none, { ...none })).toBe(true)
    expect(samePauseSources(RUNNING, RUNNING)).toBe(true)
  })
  it('sees a change in any single field', () => {
    const keys = ['manual', 'hidden', 'reduced', 'offscreen', 'lost'] as const
    for (const k of keys) {
      expect(samePauseSources(none, { ...none, [k]: true }), k).toBe(false)
    }
  })
})

describe('hasWakeLock', () => {
  it('is true only when the API is actually callable', () => {
    expect(hasWakeLock({ wakeLock: { request: () => {} } })).toBe(true)
  })
  it('is false on a browser without the API, or with a non-callable stub', () => {
    expect(hasWakeLock({})).toBe(false)
    expect(hasWakeLock(null)).toBe(false)
    expect(hasWakeLock(undefined)).toBe(false)
    expect(hasWakeLock({ wakeLock: undefined })).toBe(false)
    // A present-but-inert wakeLock object would render a toggle that does nothing —
    // the exact defect the availability gate exists to prevent.
    expect(hasWakeLock({ wakeLock: {} })).toBe(false)
    expect(hasWakeLock({ wakeLock: { request: 'nope' } })).toBe(false)
  })
})

describe('shouldHoldWakeLock', () => {
  const base = { requested: true, supported: true, pause: RUNNING }

  it('holds the screen awake while the piece is actually running', () => {
    expect(shouldHoldWakeLock(base)).toBe(true)
  })

  it('never holds it unless the viewer asked — battery is their call', () => {
    expect(shouldHoldWakeLock({ ...base, requested: false })).toBe(false)
  })

  it('never holds it on a browser without the API', () => {
    expect(shouldHoldWakeLock({ ...base, supported: false })).toBe(false)
  })

  it('releases it for EVERY pause source, so a still image never burns battery', () => {
    const keys = ['manual', 'hidden', 'reduced', 'offscreen', 'lost'] as const
    for (const k of keys) {
      expect(shouldHoldWakeLock({ ...base, pause: { ...RUNNING, [k]: true } }), k).toBe(false)
    }
  })

  it('re-arms once the document is visible again — the re-request seam', () => {
    // The platform releases the lock on tab-hide. `hidden` being a pause source is
    // what makes the re-request fall out of the same decision, with no second
    // visibilitychange listener anywhere.
    expect(shouldHoldWakeLock({ ...base, pause: { ...RUNNING, hidden: true } })).toBe(false)
    expect(shouldHoldWakeLock({ ...base, pause: { ...RUNNING, hidden: false } })).toBe(true)
  })
})
