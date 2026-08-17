import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { z } from 'zod'
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

  // #305: the seam that makes a seed-patching preset displayable. The picker is the
  // only caller of matchPresets, and the only place with the schema in hand — so it
  // is where "which fields are pin-only" gets answered, via the codec's own
  // freshLoadKeys rather than a second walk of the meta.
  describe('pin-only fields are excluded from the match when a schema is supplied', () => {
    type SeedCfg = { map: string; seed: number }
    const seedSchema = z.object({
      map: z.enum(['martin', 'sine']).default('martin'),
      seed: z
        .number()
        .int()
        .default(7)
        .meta({ ui: 'number', label: 'Seed', randomizeOnFreshLoad: true }),
    })
    const seedGroups: PresetGroup<SeedCfg>[] = [
      {
        label: 'Attractor',
        options: [
          { name: 'Martin (sqrt)', patch: { map: 'martin', seed: 7 } },
          { name: 'Sine cousin', patch: { map: 'sine', seed: 7 } },
        ],
      },
    ]
    // As the route hands it over: the seed has already been re-rolled, so it can
    // never equal the patch's 7.
    const rolled: SeedCfg = { map: 'martin', seed: 861_204_337 }

    it('displays the named option instead of Custom', () => {
      render(
        <PresetPicker
          groups={seedGroups}
          value={rolled}
          onApply={vi.fn()}
          schema={seedSchema as never}
        />,
      )
      expect((screen.getByLabelText('Attractor') as HTMLSelectElement).value).toBe('Martin (sqrt)')
      expect(screen.queryByText('Custom')).toBeNull()
    })

    it('drifting a non-pinned field moves to the sibling option it now matches', () => {
      render(
        <PresetPicker
          groups={seedGroups}
          value={{ map: 'sine', seed: 5 }}
          onApply={vi.fn()}
          schema={seedSchema as never}
        />,
      )
      // 'sine' matches the OTHER option, so pick something in neither.
      expect((screen.getByLabelText('Attractor') as HTMLSelectElement).value).toBe('Sine cousin')
    })

    it('an unmatched non-pinned value reads Custom', () => {
      const wider: PresetGroup<SeedCfg>[] = [
        { label: 'Attractor', options: [{ name: 'Martin (sqrt)', patch: { map: 'martin', seed: 7 } }] },
      ]
      render(
        <PresetPicker
          groups={wider}
          value={{ map: 'sine', seed: 7 }}
          onApply={vi.fn()}
          schema={seedSchema as never}
        />,
      )
      expect((screen.getByLabelText('Attractor') as HTMLSelectElement).value).toBe('__custom__')
    })

    it('without a schema the old behaviour stands (prop is optional, safe default)', () => {
      render(<PresetPicker groups={seedGroups} value={rolled} onApply={vi.fn()} />)
      expect((screen.getByLabelText('Attractor') as HTMLSelectElement).value).toBe('__custom__')
    })
  })

  it('renders nothing when there are no preset groups', () => {
    const { container } = render(<PresetPicker groups={undefined} value={base} onApply={vi.fn()} />)
    expect(container.firstChild).toBeNull()
    const { container: c2 } = render(<PresetPicker groups={[]} value={base} onApply={vi.fn()} />)
    expect(c2.firstChild).toBeNull()
  })
})
