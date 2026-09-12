// Every form control the schema can render must expose a non-empty ACCESSIBLE NAME
// (WCAG 2.2 SC 4.1.2, Level A). This is the test whose absence made #306's audit
// necessary: `.ctl-name` is a sibling <span> in every control, never a `<label for>`
// and never referenced by `aria-labelledby`, so a control that does not carry its own
// `aria-label` announces as "slider, 4000" with no hint whether that is Particles,
// Hue start or Damping — across 1006 slider fields, 240 colour swatches, 137 number
// fields, 86 colour lists and 13 selects.
//
// The kind list is DERIVED from SchemaForm's own dispatch rather than hardcoded, for
// the reason #304 records: a hardcoded list is exactly what let `ui: 'select'` go
// unchecked for the whole life of the options test. A new `case` in that switch with
// no entry here fails this file.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
// @ts-expect-error dom-accessibility-api ships typings but its package.json "exports"
// map does not point at them, so TS cannot resolve the declaration. Imported rather
// than reimplemented because it is the SAME accname implementation @testing-library's
// own `getByRole({ name })` uses — a hand-rolled approximation could disagree with the
// queries used everywhere else in this suite. A transitive resolution failure here is
// a loud import error in CI, never a silent pass.
import { computeAccessibleName } from 'dom-accessibility-api'
// @ts-expect-error tsconfig.app exposes only vite/client types; node's are not
// widened into the app for one test file. Same pattern as manifest.test.ts.
import { readFileSync } from 'node:fs'
import { Slider } from './Slider'
import { NumberInput } from './NumberInput'
import { Segmented } from './Segmented'
import { Select } from './Select'
import { Toggle } from './Toggle'
import { Swatch } from './Swatch'
import { ColorList } from './ColorList'
import { ImagePicker } from './ImagePicker'

const LABEL = 'Hue start'

/** One rendering per `ui` kind, each with a label a real schema would carry. */
const CASES: Record<string, () => void> = {
  slider: () =>
    render(<Slider value={4} onChange={vi.fn()} meta={{ ui: 'slider', label: LABEL, min: 0, max: 10 }} />),
  number: () =>
    render(<NumberInput value={4} onChange={vi.fn()} meta={{ ui: 'number', label: LABEL }} />),
  segmented: () =>
    render(<Segmented value="a" onChange={vi.fn()} meta={{ ui: 'segmented', label: LABEL, options: ['a', 'b'] }} />),
  select: () =>
    render(<Select value="a" onChange={vi.fn()} meta={{ ui: 'select', label: LABEL, options: ['a', 'b'] }} />),
  toggle: () =>
    render(<Toggle value={true} onChange={vi.fn()} meta={{ ui: 'toggle', label: LABEL }} />),
  color: () =>
    render(<Swatch value="#3366cc" onChange={vi.fn()} meta={{ ui: 'color', label: LABEL }} />),
  colorList: () =>
    render(<ColorList value={['#3366cc', '#cc3366']} onChange={vi.fn()} meta={{ ui: 'colorList', label: LABEL }} />),
  image: () =>
    render(<ImagePicker value={undefined} onChange={vi.fn()} meta={{ ui: 'image', label: LABEL }} />),
}

/** Every focusable form element the render produced. */
function formElements(): HTMLElement[] {
  return [
    ...document.querySelectorAll<HTMLElement>('input, select, textarea, button, [role="switch"]'),
  ].filter((el) => !(el as HTMLInputElement).disabled)
}

describe('every control exposes an accessible name (SC 4.1.2)', () => {
  it('covers every ui kind SchemaForm dispatches, so a new one cannot slip past', () => {
    const src = readFileSync('src/framework/SchemaForm.tsx', 'utf8')
    // Anchored on `case 'x': return Y`, the same form diversionMeta.test.ts already uses
    // against this switch — a bare `case '...'` would also match an unrelated switch added
    // to this file later, and `[a-zA-Z]+` alone would miss a kebab-case kind.
    const switched = [...src.matchAll(/case '([A-Za-z]+)':\s*return (\w+)/g)].map((m) => m[1])
    expect(switched.length).toBeGreaterThan(5) // non-vacuity: the switch was found

    // `controlFor`'s switch is NOT the only dispatch. `renderField` branches on three
    // kinds BEFORE reaching it, and CLAUDE.md names that dedicated-branch shape as THE
    // pattern for a config-aware control (ui:'matrix' is the reference) — so deriving
    // from the switch alone would hand the next such control zero coverage, which is the
    // silent gap #304 records. Exemptions are DECLARED with a reason rather than skipped,
    // the same rule UNCACHED and UNMATCHED_AT_DEFAULTS follow: deleting a line here is
    // how one gets resolved, and a declaration that no longer applies fails below.
    const EXEMPT: Record<string, string> = {
      hidden: 'renders null — a schema-only field carries no control',
      group: 'recurses into SchemaForm, so its children are covered by their own kinds',
      matrix: 'MatrixEditor: its buttons carry text; its CELLS are #306 SC 2.1.1, still open',
    }
    const branched = [...src.matchAll(/meta\.ui === '([A-Za-z]+)'/g)].map((m) => m[1])
    expect(branched.length).toBeGreaterThan(0) // non-vacuity: the branches were found

    const covered = [...Object.keys(CASES), ...Object.keys(EXEMPT)]
    for (const kind of [...switched, ...branched]) expect(covered).toContain(kind)

    // An exemption for a kind SchemaForm no longer dispatches is itself an error.
    for (const kind of Object.keys(EXEMPT)) expect(branched).toContain(kind)
  })

  for (const [kind, mount] of Object.entries(CASES)) {
    it(`${kind}: no form element is anonymous`, () => {
      mount()
      const els = formElements()
      expect(els.length).toBeGreaterThan(0) // non-vacuity: something rendered
      const anonymous = els
        .filter((el) => computeAccessibleName(el).trim() === '')
        .map((el) => `${el.tagName.toLowerCase()}[type=${el.getAttribute('type') ?? '-'}]`)
      expect(anonymous).toEqual([])
    })

    it(`${kind}: at least one name carries the field's own label`, () => {
      mount()
      // A wrapping role=group counts: for a set of segment buttons the group is what
      // carries the field identity ("Blend"), while each button names only its option
      // ("solid"). That is the correct ARIA shape, not a loophole — the anonymity
      // assertion above still applies to every individual element.
      const carriers = [
        ...formElements(),
        ...document.querySelectorAll<HTMLElement>('[role="group"]'),
      ]
      const named = carriers.map((el) => computeAccessibleName(el))
      expect(named.some((n) => n.includes(LABEL))).toBe(true)
    })
  }
})

describe('a segmented control exposes WHICH option is selected (SC 4.1.2)', () => {
  it('names the group and marks the active option pressed', () => {
    render(
      <Segmented value="solid" onChange={vi.fn()} meta={{ ui: 'segmented', label: 'Blend', options: ['glow', 'solid', 'xor'] }} />,
    )
    // Without this the panel announces "glow, button. solid, button. xor, button." —
    // three buttons, no group name, and no indication which one is in effect.
    const group = screen.getByRole('group', { name: 'Blend' })
    expect(within(group).getByRole('button', { name: 'solid' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(group).getByRole('button', { name: 'glow' })).toHaveAttribute('aria-pressed', 'false')
  })
})
