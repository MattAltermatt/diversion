// @ts-expect-error tsconfig.app exposes only vite/client types; node's are not
// widened into the app for one test file. Same idiom as contract.test.ts.
import { readFileSync } from 'node:fs'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { DiversionDescription, DESC_CLAMP_LINES } from './DiversionDescription'

/** jsdom computes no layout: every element measures 0 and `lineHeight` comes
 *  back as 'normal'. The component reads exactly three numbers, so stub those
 *  three and the whole clamp/measure/scroll path becomes testable — without
 *  them every test here passes vacuously (no toggle is ever rendered). */
const LINE_HEIGHT = 18.6

function stubLayout({ textHeight, boxHeight }: { textHeight: number; boxHeight: number }) {
  const realGCS = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pe) => {
    const style = realGCS(el as Element, pe as string)
    if ((el as HTMLElement).classList?.contains('config-desc-text')) {
      return { ...style, lineHeight: `${LINE_HEIGHT}px` } as CSSStyleDeclaration
    }
    return style
  })
  // `scrollHeight` is the FULL content height in both states — `-webkit-line-clamp`
  // hides the overflow rather than removing it — which is why the component can
  // measure while expanded.
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(textHeight)
  // What a real browser reports: the clamped text shows N lines, the expanded text
  // shows all of it. Without this, `scrollHeight > clientHeight` would read true in
  // BOTH states against jsdom's 0, and the regression guard below would pass for a
  // reason that has nothing to do with the clamp.
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (!this.classList.contains('config-desc-text')) return 0
    return this.parentElement?.classList.contains('is-clamped')
      ? LINE_HEIGHT * DESC_CLAMP_LINES
      : textHeight
  })
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    // The box is as tall as what it shows: clamped => N lines, expanded => all of it.
    if (!this.classList.contains('config-desc')) return 0
    return this.classList.contains('is-clamped') ? LINE_HEIGHT * DESC_CLAMP_LINES : boxHeight
  })
}

describe('DiversionDescription (#315)', () => {
  beforeEach(() => {
    // Off by default so the clamp tests measure exactly once; the resize block
    // below installs a driveable one, because a stubbed-away observer would let
    // the whole re-measure path be deleted with the suite still green.
    vi.stubGlobal('ResizeObserver', undefined)
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders the description verbatim — the same sentence the gallery card shows', () => {
    const d = 'Turrets ride a track and peel a contour map, one colour at a time.'
    render(<DiversionDescription description={d} />)
    expect(screen.getByText(d)).toBeTruthy()
  })

  it('renders NO toggle when the text fits inside the clamp', () => {
    // 3 lines of content against a 5-line clamp.
    stubLayout({ textHeight: LINE_HEIGHT * 3, boxHeight: LINE_HEIGHT * 3 })
    render(<DiversionDescription description="Gooey blobs that rise, merge, and split." />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(document.querySelector('.config-desc')?.classList.contains('is-clamped')).toBe(false)
  })

  it('renders the toggle and clamps when the text overflows', () => {
    stubLayout({ textHeight: LINE_HEIGHT * 11, boxHeight: LINE_HEIGHT * 11 })
    render(<DiversionDescription description={'long '.repeat(90)} />)
    const btn = screen.getByRole('button')
    expect(btn.textContent).toContain('more')
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelector('.config-desc')?.classList.contains('is-clamped')).toBe(true)
  })

  it('expands and collapses, and keeps the toggle labelled for the action it performs', () => {
    stubLayout({ textHeight: LINE_HEIGHT * 11, boxHeight: LINE_HEIGHT * 11 })
    render(<DiversionDescription description={'long '.repeat(90)} />)
    const btn = screen.getByRole('button')
    const box = () => document.querySelector('.config-desc')!

    fireEvent.click(btn)
    expect(box().classList.contains('is-clamped')).toBe(false)
    expect(btn.textContent).toContain('less')
    expect(btn.getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(btn)
    expect(box().classList.contains('is-clamped')).toBe(true)
    expect(btn.textContent).toContain('more')
    expect(btn.getAttribute('aria-expanded')).toBe('false')
  })

  it('keeps the toggle after expanding — the measurement must survive losing the clamp', () => {
    // Regression guard for measuring `scrollHeight > clientHeight`, which is only
    // true while clamped: with that test the button vanishes the moment you open it.
    stubLayout({ textHeight: LINE_HEIGHT * 11, boxHeight: LINE_HEIGHT * 11 })
    render(<DiversionDescription description={'long '.repeat(90)} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button').textContent).toContain('less')
  })


  it('never hides text it offers no way to reveal', () => {
    // The safe direction for a mis-measurement. If `overflows` reads false the
    // clamp class must not be applied either, or a piece would silently lose the
    // tail of its description with no control to get it back.
    stubLayout({ textHeight: LINE_HEIGHT * 9, boxHeight: LINE_HEIGHT * 9 })
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      lineHeight: 'normal', // what a browser reports when it computes no layout
    } as CSSStyleDeclaration)
    render(<DiversionDescription description={'long '.repeat(90)} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(document.querySelector('.config-desc')!.classList.contains('is-clamped')).toBe(false)
  })


  it('clamps to the SAME line count it measures against', () => {
    // The docblock on DESC_CLAMP_LINES claims the CSS cannot drift from the
    // measurement. Nothing else can check that: jsdom implements no line-clamp,
    // and the stylesheet carries its own `var(--desc-lines, 5)` fallback, so the
    // two can silently disagree while every other test here stays green.
    // Read with node:fs — `import './theme.css?raw'` is the EMPTY STRING under
    // vitest, which would make this pass vacuously.
    const css = readFileSync('src/framework/theme.css', 'utf8')
    expect(css.length).toBeGreaterThan(1000) // the read itself must not be empty
    // Strip comments first, the way responsive.test.ts does: the prose above this
    // rule quotes `--desc-lines`, so a file-wide match would survive deleting the
    // declaration it is meant to guard.
    const code = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(code).toMatch(/-webkit-line-clamp:\s*var\(--desc-lines/)

    stubLayout({ textHeight: LINE_HEIGHT * 11, boxHeight: LINE_HEIGHT * 11 })
    render(<DiversionDescription description={'long '.repeat(90)} />)
    const box = document.querySelector('.config-desc') as HTMLElement
    expect(box.style.getPropertyValue('--desc-lines')).toBe(String(DESC_CLAMP_LINES))
  })

  it('points aria-controls at the paragraph, with an id unique per instance', () => {
    stubLayout({ textHeight: LINE_HEIGHT * 11, boxHeight: LINE_HEIGHT * 11 })
    const { container } = render(
      <>
        <DiversionDescription description={'long '.repeat(90)} />
        <DiversionDescription description={'long '.repeat(90)} />
      </>,
    )
    const texts = [...container.querySelectorAll('.config-desc-text')] as HTMLElement[]
    const btns = [...container.querySelectorAll('.config-desc-more')] as HTMLElement[]
    expect(texts).toHaveLength(2)
    for (const [i, b] of btns.entries()) {
      expect(texts[i].id).not.toBe('')
      expect(b.getAttribute('aria-controls')).toBe(texts[i].id)
    }
    // A hardcoded id would tie the second button to the FIRST paragraph.
    expect(texts[0].id).not.toBe(texts[1].id)
  })

  describe('the measurement boundary', () => {
    it('does not grow a toggle for text that lands exactly on the clamp', () => {
      stubLayout({
        textHeight: LINE_HEIGHT * DESC_CLAMP_LINES,
        boxHeight: LINE_HEIGHT * DESC_CLAMP_LINES,
      })
      render(<DiversionDescription description={'x'} />)
      expect(screen.queryByRole('button')).toBeNull()
    })

    it('absorbs a sub-pixel overshoot rather than flagging it as overflow', () => {
      // Line boxes round to device pixels while `line-height` is computed at
      // sub-pixel precision, so N lines rarely measure as exactly N x lineHeight.
      // The epsilon in the component is what keeps that from reading as a 6th line.
      stubLayout({
        textHeight: LINE_HEIGHT * DESC_CLAMP_LINES + 0.4,
        boxHeight: LINE_HEIGHT * DESC_CLAMP_LINES + 0.4,
      })
      render(<DiversionDescription description={'x'} />)
      expect(screen.queryByRole('button')).toBeNull()
    })

    it('still flags a genuine extra line', () => {
      stubLayout({
        textHeight: LINE_HEIGHT * (DESC_CLAMP_LINES + 1),
        boxHeight: LINE_HEIGHT * (DESC_CLAMP_LINES + 1),
      })
      render(<DiversionDescription description={'x'} />)
      expect(screen.getByRole('button')).toBeTruthy()
    })
  })

  describe('re-measuring on resize', () => {
    /** A driveable ResizeObserver: `fire()` runs the callback the component gave it. */
    function installResizeObserver() {
      const cbs: Array<() => void> = []
      vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(cb: () => void) {
            cbs.push(cb)
          }
          observe() {}
          disconnect() {}
        },
      )
      return () => cbs.forEach((cb) => cb())
    }

    it('drops the toggle when the text gets a wider box and no longer overflows', () => {
      const fire = installResizeObserver()
      // Narrow: the same sentence wraps to 9 lines and overflows the 5-line clamp.
      let width = 320
      let lines = 9
      const realGCS = window.getComputedStyle.bind(window)
      vi.spyOn(window, 'getComputedStyle').mockImplementation((el) =>
        (el as HTMLElement).classList?.contains('config-desc-text')
          ? ({ lineHeight: `${LINE_HEIGHT}px` } as CSSStyleDeclaration)
          : realGCS(el as Element),
      )
      vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(
        () => LINE_HEIGHT * lines,
      )
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width)
      render(<DiversionDescription description={'long '.repeat(40)} />)
      expect(screen.getByRole('button')).toBeTruthy()

      // Wider box: the same text now fits in 4 lines.
      width = 560
      lines = 4
      act(() => fire())
      expect(screen.queryByRole('button')).toBeNull()
    })

    it('ignores a callback that carries no width change — the height it caused is its own', () => {
      const fire = installResizeObserver()
      const measured: number[] = []
      const realGCS = window.getComputedStyle.bind(window)
      vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
        if ((el as HTMLElement).classList?.contains('config-desc-text')) {
          measured.push(1)
          return { lineHeight: `${LINE_HEIGHT}px` } as CSSStyleDeclaration
        }
        return realGCS(el as Element)
      })
      vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(LINE_HEIGHT * 9)
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(320)
      render(<DiversionDescription description={'long '.repeat(40)} />)
      const afterMount = measured.length
      act(() => fire()) // same width — the observer saw its own height change
      expect(measured.length).toBe(afterMount)
    })
  })

  describe('scroll restoration on collapse', () => {
    /** Mount inside a real scrolling panel, the way `.config-panel` scrolls above 820px. */
    function renderInPanel(scrollTop: number) {
      const panel = document.createElement('div')
      panel.className = 'config-panel'
      document.body.append(panel)
      vi.spyOn(window, 'getComputedStyle').mockImplementation(
        (el) =>
          ({
            lineHeight: `${LINE_HEIGHT}px`,
            overflowY: (el as HTMLElement) === panel ? 'auto' : 'visible',
          }) as CSSStyleDeclaration,
      )
      vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (
        this: HTMLElement,
      ) {
        return this === panel ? 9999 : LINE_HEIGHT * 11
      })
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400)
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
        this: HTMLElement,
      ) {
        if (!this.classList.contains('config-desc')) return 0
        return this.classList.contains('is-clamped')
          ? LINE_HEIGHT * DESC_CLAMP_LINES
          : LINE_HEIGHT * 11
      })
      panel.scrollTop = scrollTop
      render(<DiversionDescription description={'long '.repeat(90)} />, { container: panel })
      return panel
    }

    it('gives the scroller back exactly the height the collapse removed', () => {
      const panel = renderInPanel(500)
      const btn = screen.getByRole('button')
      fireEvent.click(btn) // expand
      expect(panel.scrollTop).toBe(500) // expanding never moves the reader
      fireEvent.click(btn) // collapse
      // 11 lines -> 5 lines == 6 lines removed above the reader.
      expect(panel.scrollTop).toBeCloseTo(500 - LINE_HEIGHT * 6, 5)
    })

    it('never scrolls past the top — the common case (description in view) is a no-op', () => {
      const panel = renderInPanel(0)
      const btn = screen.getByRole('button')
      fireEvent.click(btn)
      fireEvent.click(btn)
      expect(panel.scrollTop).toBe(0)
    })

    it('corrects the DOCUMENT scroller when no ancestor scrolls (below 820px, #284)', () => {
      // jsdom returns null for `document.scrollingElement` even in standards mode
      // (real browsers give <html>), so this also covers the component's
      // `?? document.documentElement` fallback — which is the branch that runs here.
      const doc = document.documentElement
      vi.spyOn(window, 'getComputedStyle').mockReturnValue({
        lineHeight: `${LINE_HEIGHT}px`,
        overflowY: 'visible',
      } as CSSStyleDeclaration)
      vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(LINE_HEIGHT * 11)
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
        this: HTMLElement,
      ) {
        if (!this.classList.contains('config-desc')) return 0
        return this.classList.contains('is-clamped')
          ? LINE_HEIGHT * DESC_CLAMP_LINES
          : LINE_HEIGHT * 11
      })
      render(<DiversionDescription description={'long '.repeat(90)} />)
      const btn = screen.getByRole('button')
      fireEvent.click(btn)
      doc.scrollTop = 300
      fireEvent.click(btn)
      expect(doc.scrollTop).toBeCloseTo(300 - LINE_HEIGHT * 6, 5)
    })
  })
})
