import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { CopyLinkButton } from './CopyLinkButton'

describe('CopyLinkButton', () => {
  let writeText: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('copies the absolute URL (origin + href), not the relative href', async () => {
    render(<CopyLinkButton href="/d/flow-field/play?seed=1" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button'))
    })
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith(
      window.location.origin + '/d/flow-field/play?seed=1',
    )
  })

  it('includes the deploy base path (BASE_URL) so Pages links do not fall to the gallery', async () => {
    vi.stubEnv('BASE_URL', '/diversion/')
    render(<CopyLinkButton href="/d/flow-field/play?seed=1" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button'))
    })
    expect(writeText).toHaveBeenCalledWith(
      window.location.origin + '/diversion/d/flow-field/play?seed=1',
    )
  })

  it('swaps the label to "✓ Copied" after a successful copy', async () => {
    render(<CopyLinkButton href="/d/flow-field/play?seed=1" />)
    expect(screen.getByRole('button').textContent).toContain('Copy link')
    await act(async () => {
      fireEvent.click(screen.getByRole('button'))
    })
    expect(screen.getByRole('button').textContent).toContain('Copied')
  })

  it('reverts the label to "🔗 Copy link" after 1500ms', async () => {
    render(<CopyLinkButton href="/d/flow-field/play?seed=1" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button'))
    })
    expect(screen.getByRole('button').textContent).toContain('Copied')
    await act(async () => {
      vi.advanceTimersByTime(1500)
    })
    expect(screen.getByRole('button').textContent).toContain('Copy link')
  })

  it('does NOT show "Copied" when the clipboard write rejects', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    render(<CopyLinkButton href="/d/flow-field/play?seed=1" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button'))
    })
    expect(screen.getByRole('button').textContent).toContain('Copy link')
    expect(screen.getByRole('button').textContent).not.toContain('Copied')
  })
})
