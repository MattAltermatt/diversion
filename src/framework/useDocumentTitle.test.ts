import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { diversionTitle, useDocumentTitle } from './useDocumentTitle'

describe('diversionTitle', () => {
  it('distinguishes the two diversion routes, which are distinct URLs', () => {
    expect(diversionTitle('Flow Field', 'play')).toBe('Flow Field — Diversion')
    expect(diversionTitle('Flow Field', 'config')).toBe('Flow Field settings — Diversion')
  })

  it('falls back to the bare app name when the piece is unknown (a 404 slug)', () => {
    expect(diversionTitle(undefined, 'play')).toBe('Diversion')
  })
})

describe('useDocumentTitle', () => {
  it('sets the title and restores the previous one on unmount', () => {
    document.title = 'Diversion'
    const { unmount, rerender } = renderHook(({ t }) => useDocumentTitle(t), {
      initialProps: { t: 'Flow Field — Diversion' },
    })
    expect(document.title).toBe('Flow Field — Diversion')

    // A slug change re-runs the effect rather than stacking a second one.
    rerender({ t: 'Ablation — Diversion' })
    expect(document.title).toBe('Ablation — Diversion')

    // Back to the gallery: the piece's name must not keep being announced.
    unmount()
    expect(document.title).toBe('Diversion')
  })
})
