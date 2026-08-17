import { describe, it, expect } from 'vitest'
// @ts-expect-error tsconfig.app exposes only vite/client types; node's are not
// widened into the app for one test file. Same idiom as contract.test.ts.
import { readFileSync, readdirSync } from 'node:fs'
// @ts-expect-error — see above.
import { join } from 'node:path'
import {
  createPinchTracker,
  drivenByViewer,
  gesturesYielded,
  INTERACTIVE_ATTR,
  pageScrolls,
  wheelOwned,
} from './canvasGestures'

const canvasWith = (attr?: string): HTMLCanvasElement => {
  const cv = document.createElement('canvas')
  if (attr !== undefined) cv.setAttribute(INTERACTIVE_ATTR, attr)
  return cv
}

describe('drivenByViewer (#290)', () => {
  it('reads the host attribute', () => {
    expect(drivenByViewer(canvasWith('true'))).toBe(true)
    expect(drivenByViewer(canvasWith('false'))).toBe(false)
  })

  it('treats a MISSING attribute as not interactive', () => {
    // Fail-safe direction, and deliberately so: a camera that goes inert is visible
    // and recoverable, whereas a canvas that wrongly believes it is interactive
    // calls preventDefault() on wheel under {passive:false} and silently eats the
    // page's scroll — which is the #290 bug itself.
    expect(drivenByViewer(canvasWith())).toBe(false)
  })

  it('does not accept a merely PRESENT attribute', () => {
    // `getAttribute() !== null` and truthiness both pass for "false", which is the
    // exact value a gallery tile carries.
    expect(drivenByViewer(canvasWith(''))).toBe(false)
    expect(drivenByViewer(canvasWith('0'))).toBe(false)
  })
})

describe('gesturesYielded (#290) — both branches', () => {
  // This function had NO direct test: a mutation making it return false
  // unconditionally was green across the whole suite, while two separate fixes lean
  // on it. Its true branch is trivially reachable — inline style is enough.
  it('is false for an unstyled canvas — the browser still owns the gesture', () => {
    const cv = document.createElement('canvas')
    // Documenting the actual jsdom value, since the comment in the source used to
    // claim '' and a reader would reasonably trust it.
    expect(getComputedStyle(cv).touchAction).toBe('auto')
    expect(gesturesYielded(cv)).toBe(false)
  })

  it('is true once touch-action: none is in force', () => {
    const cv = document.createElement('canvas')
    cv.style.touchAction = 'none'
    expect(gesturesYielded(cv)).toBe(true)
  })

  it('is false for pan-y — a partial yield is not a yield', () => {
    const cv = document.createElement('canvas')
    cv.style.touchAction = 'pan-y'
    expect(gesturesYielded(cv)).toBe(false)
  })
})

describe('pageScrolls + wheelOwned (#294)', () => {
  /** jsdom reports 0 for every layout box, so the scroll range has to be stated. */
  const withPageScroll = (scrollable: boolean, run: () => void) => {
    const el = document.documentElement
    const orig = {
      sh: Object.getOwnPropertyDescriptor(el, 'scrollHeight'),
      ch: Object.getOwnPropertyDescriptor(el, 'clientHeight'),
    }
    Object.defineProperty(el, 'scrollHeight', { value: scrollable ? 3612 : 800, configurable: true })
    Object.defineProperty(el, 'clientHeight', { value: 800, configurable: true })
    try {
      run()
    } finally {
      if (orig.sh) Object.defineProperty(el, 'scrollHeight', orig.sh)
      else delete (el as unknown as Record<string, unknown>).scrollHeight
      if (orig.ch) Object.defineProperty(el, 'clientHeight', orig.ch)
      else delete (el as unknown as Record<string, unknown>).clientHeight
    }
  }

  const wheel = (ctrlKey = false) => ({ ctrlKey })

  it('reports whether the document has anywhere to scroll', () => {
    const cv = canvasWith('true')
    document.body.appendChild(cv)
    try {
      withPageScroll(true, () => expect(pageScrolls(cv)).toBe(true))
      withPageScroll(false, () => expect(pageScrolls(cv)).toBe(false))
    } finally {
      cv.remove()
    }
  })

  it('consumes the wheel when nothing behind the canvas can scroll (Play, Config >820px)', () => {
    const cv = canvasWith('true')
    document.body.appendChild(cv)
    try {
      withPageScroll(false, () => expect(wheelOwned(cv, wheel())).toBe(true))
    } finally {
      cv.remove()
    }
  })

  it('DECLINES a plain wheel over a canvas on a scrolling page — the #294 bug', () => {
    // The Config preview below 820px: sticky over the top 45% of a form the viewer
    // came to scroll, and still `interactive`.
    const cv = canvasWith('true')
    document.body.appendChild(cv)
    try {
      withPageScroll(true, () => expect(wheelOwned(cv, wheel())).toBe(false))
    } finally {
      cv.remove()
    }
  })

  it('still zooms on that same surface when the viewer asks with ctrl (or a trackpad pinch)', () => {
    const cv = canvasWith('true')
    document.body.appendChild(cv)
    try {
      withPageScroll(true, () => expect(wheelOwned(cv, wheel(true))).toBe(true))
    } finally {
      cv.remove()
    }
  })

  it('never consumes the wheel on a gallery tile, ctrl or not', () => {
    const cv = canvasWith('false')
    document.body.appendChild(cv)
    try {
      withPageScroll(true, () => {
        expect(wheelOwned(cv, wheel())).toBe(false)
        expect(wheelOwned(cv, wheel(true))).toBe(false)
      })
      withPageScroll(false, () => expect(wheelOwned(cv, wheel())).toBe(false))
    } finally {
      cv.remove()
    }
  })
})

describe('createPinchTracker (#295)', () => {
  const pt = (pointerId: number, x: number, y: number, pointerType = 'touch') =>
    ({ pointerId, clientX: x, clientY: y, pointerType }) as PointerEvent

  it('is inert for a single finger — one finger is a pan, not a pinch', () => {
    const p = createPinchTracker()
    p.down(pt(1, 0, 0))
    expect(p.active()).toBe(false)
    expect(p.move(pt(1, 10, 0))).toBeNull()
  })

  it('ignores a mouse entirely', () => {
    const p = createPinchTracker()
    p.down(pt(1, 0, 0, 'mouse'))
    p.down(pt(2, 100, 0, 'mouse'))
    expect(p.active()).toBe(false)
    expect(p.move(pt(1, -50, 0, 'mouse'))).toBeNull()
  })

  it('reports the scale ratio and the midpoint of two fingers', () => {
    const p = createPinchTracker()
    p.down(pt(1, 0, 0))
    p.down(pt(2, 100, 0)) // span 100
    const step = p.move(pt(2, 200, 0)) // span 200
    expect(step?.scale).toBeCloseTo(2, 6)
    expect(step?.cx).toBeCloseTo(100, 6)
    expect(step?.cy).toBeCloseTo(0, 6)
  })

  it('is INCREMENTAL — each step is measured against the previous span, not the first', () => {
    const p = createPinchTracker()
    p.down(pt(1, 0, 0))
    p.down(pt(2, 100, 0))
    expect(p.move(pt(2, 200, 0))?.scale).toBeCloseTo(2, 6)
    // Doubling again from 200 to 400 is another 2x, not 4x.
    expect(p.move(pt(2, 400, 0))?.scale).toBeCloseTo(2, 6)
  })

  it('never returns a non-finite scale when a pair first forms', () => {
    // The first move after a pair forms has no previous span to divide by. Infinity
    // here would NaN the whole view — a clamp propagates it rather than fixing it.
    const p = createPinchTracker()
    p.down(pt(1, 0, 0))
    p.down(pt(2, 0, 0)) // two fingers at the SAME point: span 0
    const step = p.move(pt(2, 50, 0))
    expect(Number.isFinite(step?.scale ?? NaN)).toBe(true)
    expect(step?.scale).toBe(1)
  })

  it('idles with three fingers rather than jumping between pairs', () => {
    const p = createPinchTracker()
    p.down(pt(1, 0, 0))
    p.down(pt(2, 100, 0))
    p.down(pt(3, 300, 0))
    expect(p.active()).toBe(true)
    expect(p.move(pt(3, 400, 0))).toBeNull()
    // Lifting back to two resumes cleanly, with no accumulated jump.
    p.up(pt(3, 400, 0))
    expect(p.move(pt(2, 200, 0))?.scale).toBeCloseTo(2, 6)
  })

  it('hands the pan back to the finger still down when a pinch ends', () => {
    const p = createPinchTracker()
    p.down(pt(1, 0, 0))
    p.down(pt(2, 100, 0))
    p.move(pt(2, 200, 0))
    const remaining = p.up(pt(2, 200, 0))
    // Without this the caller keeps a stale `last`, and the next move applies every
    // pixel travelled during the pinch as one pan step.
    expect(remaining).toEqual({ pointerId: 1, x: 0, y: 0 })
    expect(p.active()).toBe(false)
  })

  it('reports nothing on the last finger lifting, and forgets an unknown pointer', () => {
    const p = createPinchTracker()
    p.down(pt(1, 0, 0))
    expect(p.up(pt(1, 0, 0))).toBeNull()
    expect(p.up(pt(9, 0, 0))).toBeNull()
    expect(p.active()).toBe(false)
  })
})

describe('no diversion re-derives interactivity from canvas WIDTH (#290)', () => {
  // The regression this exists for shipped for months and was invisible: all three
  // GPU cameras approximated AnimationHost's `interactive` prop as
  // `cv.clientWidth >= 480`. A gallery tile is ~510px wide at viewports around
  // 530-628px, where the grid is one column — so a tile called itself interactive
  // and its wheel handler blocked page scroll over it, on a plain mouse. Nothing in
  // the suite noticed, because the camera has no other test and the width heuristic
  // is correct on every screen a developer usually has open.
  const dir = 'src/diversions'
  const slugs: string[] = readdirSync(dir, { withFileTypes: true })
    .filter((e: { isDirectory(): boolean }) => e.isDirectory())
    .map((e: { name: string }) => e.name)

  const ATTACHES = /addEventListener\s*\(\s*['"](?:wheel|pointerdown)/
  /** Every `.ts` in a diversion folder, not just `index.ts`: the natural next
   *  refactor here is to lift `attachCamera` into a sibling `camera.ts`, and a sweep
   *  that only read `index.ts` would then match nothing and stay green while
   *  guarding nothing. */
  const sourcesOf = (slug: string): string =>
    readdirSync(join(dir, slug), { withFileTypes: true })
      .filter((e: { isFile(): boolean; name: string }) => e.isFile() && /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name))
      .map((e: { name: string }) => readFileSync(join(dir, slug, e.name), 'utf8'))
      .join('\n')

  const owners = slugs.filter((s) => ATTACHES.test(sourcesOf(s)))

  it('sees the whole gallery, so the sweep below cannot pass vacuously', () => {
    expect(slugs.length).toBeGreaterThan(100)
  })

  it('actually inspects the diversions that own canvas listeners', () => {
    // The per-slug tests below early-return for anything that attaches no listeners,
    // so a slug count alone does NOT prove a single assertion ran. Naming the
    // population is what makes the sweep non-vacuous — and a FOURTH diversion
    // growing its own listeners has to come here and think about this on purpose.
    expect(owners.sort()).toEqual(['particle-life-gpu', 'swarm-chemistry', 'swarmalators'])
  })

  for (const slug of slugs) {
    it(`${slug}: gates canvas gestures on the host, not on a width threshold`, () => {
      const src = sourcesOf(slug)
      if (!ATTACHES.test(src)) return
      expect(src, 'reads clientWidth to decide if it may consume gestures').not.toMatch(
        /clientWidth\s*>=?/,
      )
      expect(src, 'must consult the host via drivenByViewer').toMatch(/drivenByViewer\s*\(/)
    })

    it(`${slug}: declares ownsCanvasGestures, or its canvas keeps browser gestures`, () => {
      const src = sourcesOf(slug)
      if (!ATTACHES.test(src)) return
      // Without the flag AnimationHost leaves the canvas at `touch-action: auto`
      // (the class is gated on `onPointer`, which these do not declare), so a finger
      // drag pans the camera AND scrolls the page at the same time.
      expect(src, 'no ownsCanvasGestures declaration').toMatch(/ownsCanvasGestures:\s*true/)
    })

    it(`${slug}: asks wheelOwned before consuming a wheel, never interactive() alone`, () => {
      const src = sourcesOf(slug)
      if (!ATTACHES.test(src)) return
      // #294: `drivenByViewer` alone is true of the Config preview below 820px, which
      // is sticky over a scrolling form — so preventDefault there ate the page's
      // scroll on a trackpad. A fourth gesture-owning diversion has to come here.
      expect(src, 'must gate the wheel on wheelOwned()').toMatch(/wheelOwned\s*\(/)
    })

    it(`${slug}: does not let a TOUCH drag run while the browser owns the gesture`, () => {
      const src = sourcesOf(slug)
      if (!ATTACHES.test(src)) return
      // The flag is not sufficient on its own: below 820px the Config preview media
      // query hands `touch-action` back, and that mount is still `interactive`.
      expect(src, 'must gate touch on gesturesYielded()').toMatch(/gesturesYielded\s*\(/)
      // pointerdown fires for the right/middle buttons and isPrimary is true for a
      // mouse regardless of which is down.
      expect(src, 'must check the pressed button').toMatch(/e\.button\s*===\s*0/)
    })
  }
})
