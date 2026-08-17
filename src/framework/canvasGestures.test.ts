import { describe, it, expect } from 'vitest'
// @ts-expect-error tsconfig.app exposes only vite/client types; node's are not
// widened into the app for one test file. Same idiom as contract.test.ts.
import { readFileSync, readdirSync } from 'node:fs'
// @ts-expect-error — see above.
import { join } from 'node:path'
import { drivenByViewer, INTERACTIVE_ATTR } from './canvasGestures'

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
