import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { PlayScreen } from './PlayScreen'

// Render PlayScreen at a play URL carrying encoded config, and read back the
// "← config" link's destination. The framework owns the rAF loop / canvas, so
// AnimationHost is harmless to mount in jsdom (it just won't paint).
function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/d/:slug/play" element={<PlayScreen />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PlayScreen back-link', () => {
  it('carries the current search params back to the config screen', () => {
    renderAt('/d/flow-field/play?particles=1000&speed=0.09')
    const back = screen.getByRole('link', { name: /config/i }) as HTMLAnchorElement
    // Regression for #2: clicking ← config must land on the configured form,
    // not reset to defaults — so the href must preserve the query string.
    expect(back.getAttribute('href')).toBe('/d/flow-field?particles=1000&speed=0.09')
  })

  it('points at the bare config route when there are no params', () => {
    renderAt('/d/flow-field/play')
    const back = screen.getByRole('link', { name: /config/i }) as HTMLAnchorElement
    expect(back.getAttribute('href')).toBe('/d/flow-field')
  })
})

describe('PlayScreen copy-link-with-seed', () => {
  it('offers a "copy this world" button whose link pins the live seed', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    // particle-life has a randomizeOnFreshLoad seed → a seedless load rolls one, and
    // the pinned button must bake it into the copied URL.
    renderAt('/d/particle-life/play')
    const pinned = screen.getByRole('button', { name: /copy this world/i })
    await act(async () => {
      fireEvent.click(pinned)
    })
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText.mock.calls[0][0]).toContain('seed=')
  })
})
