import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PresetPicker } from './PresetPicker'
import type { PresetGroup } from './types'

type Cfg = { speed: number; color: { mode: string; colors: string[] } }

const base: Cfg = { speed: 0.3, color: { mode: 'palette', colors: ['#aaa'] } }

const groups: PresetGroup<Cfg>[] = [
  {
    label: 'Flow',
    options: [
      { name: 'Slow', patch: { speed: 0.3 } },
      { name: 'Fast', patch: { speed: 0.9 } },
    ],
  },
  {
    label: 'Color',
    options: [
      { name: 'Mono', patch: { color: { mode: 'palette', colors: ['#aaa'] } } },
      { name: 'Neon', patch: { color: { mode: 'palette', colors: ['#0ff'] } } },
    ],
  },
]

describe('PresetPicker', () => {
  it('renders one labeled select per group', () => {
    render(<PresetPicker groups={groups} value={base} onApply={vi.fn()} />)
    expect(screen.getByLabelText('Flow')).toBeTruthy()
    expect(screen.getByLabelText('Color')).toBeTruthy()
  })

  it('shows the matching preset as the selected value', () => {
    render(<PresetPicker groups={groups} value={base} onApply={vi.fn()} />)
    expect((screen.getByLabelText('Flow') as HTMLSelectElement).value).toBe('Slow')
    expect((screen.getByLabelText('Color') as HTMLSelectElement).value).toBe('Mono')
  })

  it('applies the patch via onApply when an option is picked', () => {
    const onApply = vi.fn()
    render(<PresetPicker groups={groups} value={base} onApply={onApply} />)
    fireEvent.change(screen.getByLabelText('Flow'), { target: { value: 'Fast' } })
    expect(onApply).toHaveBeenCalledWith({ ...base, speed: 0.9 })
  })

  it('shows "Custom" selected when no preset matches', () => {
    const drifted: Cfg = { ...base, speed: 0.55 }
    render(<PresetPicker groups={groups} value={drifted} onApply={vi.fn()} />)
    const flow = screen.getByLabelText('Flow') as HTMLSelectElement
    expect(flow.value).toBe('__custom__')
    expect(screen.getByText('Custom')).toBeTruthy()
    // the other group still resolves to its match
    expect((screen.getByLabelText('Color') as HTMLSelectElement).value).toBe('Mono')
  })

  it('renders nothing when there are no preset groups', () => {
    const { container } = render(<PresetPicker groups={undefined} value={base} onApply={vi.fn()} />)
    expect(container.firstChild).toBeNull()
    const { container: c2 } = render(<PresetPicker groups={[]} value={base} onApply={vi.fn()} />)
    expect(c2.firstChild).toBeNull()
  })
})
