import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ConfigScreen } from './ConfigScreen'

function renderAt(entries: string[]) {
  return render(
    <MemoryRouter initialEntries={entries}>
      <Routes>
        <Route path="/d/:slug" element={<ConfigScreen />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ConfigScreen URL hydration', () => {
  it('initialises the form from the URL params', () => {
    renderAt(['/d/flow-field?particles=1000'])
    const particles = document.querySelector('input[type="range"]') as HTMLInputElement
    expect(particles.value).toBe('1000')
  })
})
