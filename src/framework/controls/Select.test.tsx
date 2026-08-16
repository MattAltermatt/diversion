import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Select } from './Select'
import type { FieldMeta } from '../fieldMeta'

const base: FieldMeta = { ui: 'select', label: 'Picture' }

describe('Select', () => {
  it('still renders a plain string[] as value===label (regression guard)', () => {
    render(<Select value="b" onChange={vi.fn()} meta={{ ...base, options: ['a', 'b'] }} />)
    const opts = screen.getAllByRole('option') as HTMLOptionElement[]
    expect(opts.map((o) => [o.value, o.textContent])).toEqual([['a', 'a'], ['b', 'b']])
    expect(document.querySelectorAll('optgroup')).toHaveLength(0)
  })

  it('splits value from label for object options', () => {
    render(
      <Select
        value="pine-ridge"
        onChange={vi.fn()}
        meta={{ ...base, options: [{ value: 'pine-ridge', label: 'Pine Ridge' }] }}
      />,
    )
    const opt = screen.getByRole('option') as HTMLOptionElement
    expect(opt.value).toBe('pine-ridge')
    expect(opt.textContent).toBe('Pine Ridge')
  })

  it('renders an optgroup per distinct group, in first-seen order, ungrouped first', () => {
    render(
      <Select
        value="shuffle"
        onChange={vi.fn()}
        meta={{
          ...base,
          options: [
            { value: 'shuffle', label: 'Shuffle all' },
            { value: 'landscapes', label: 'Landscapes', group: 'Rotations' },
            { value: 'pine-ridge', label: 'Pine Ridge', group: 'Landscapes' },
            { value: 'space', label: 'Space', group: 'Rotations' },
          ],
        }}
      />,
    )
    const groups = Array.from(document.querySelectorAll('optgroup'))
    expect(groups.map((g) => g.getAttribute('label'))).toEqual(['Rotations', 'Landscapes'])
    // An ungrouped option stays at top level, outside any optgroup.
    expect(screen.getByText('Shuffle all').closest('optgroup')).toBeNull()
    // Grouped options keep their group even when the source list interleaves them.
    expect(groups[0].querySelectorAll('option')).toHaveLength(2)
  })
})
