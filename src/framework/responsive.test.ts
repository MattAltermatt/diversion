import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { render } from '@testing-library/react'
import { createElement } from 'react'
import { AnimationHost } from './AnimationHost'
import type { Diversion } from './types'
import '../test-setup'

// NOT `?raw`: vitest runs with CSS processing off, so `import css from
// './theme.css?raw'` resolves to the EMPTY STRING and every assertion below
// passes vacuously. That is the whole failure mode this file exists to prevent,
// so it reads the bytes itself and asserts they arrived (see the guard below).
// @ts-expect-error tsconfig.app exposes only vite/client types; node's are not
// widened into the app for one test file.
import { readFileSync } from 'node:fs'

const read = (p: string): string => readFileSync(p, 'utf8')
const css: string = read('src/framework/theme.css')
const html: string = read('index.html')

/** Strip comments so a rule quoted inside a warning comment can't satisfy a test. */
const code = css.replace(/\/\*[\s\S]*?\*\//g, '')
/** Same for the HTML: index.html explains viewport-fit in a comment that quotes it. */
const markup = html.replace(/<!--[\s\S]*?-->/g, '')

/** Every selector list in the stylesheet, paired with its declaration block. */
function rules(): { sel: string; body: string }[] {
  const out: { sel: string; body: string }[] = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(code))) out.push({ sel: m[1].trim(), body: m[2] })
  return out
}

describe('the stylesheet actually loaded', () => {
  // Guard, not ceremony: every assertion in this file is a search over `css`, so
  // an empty read turns the whole file green while checking nothing.
  it('read theme.css and index.html as non-empty text', () => {
    expect(css.length).toBeGreaterThan(5000)
    expect(html).toContain('<meta name="viewport"')
    expect(rules().length).toBeGreaterThan(50)
  })
})

describe('touch-action seam (#284)', () => {
  // The regression this guards is invisible: `touch-action` is honoured by the
  // compositor whether or not a JS listener exists, and the gallery mounts a
  // canvas per tile on a ~50,000px-tall scrolling page. Promoting this
  // declaration to `.anim-canvas` would silently make the gallery unscrollable
  // on every touch device while every existing test stayed green.
  it('never puts touch-action on bare .anim-canvas', () => {
    for (const { sel, body } of rules()) {
      const targetsBareCanvas = sel
        .split(',')
        .map((s) => s.trim())
        .some((s) => /(^|[\s>+~])\.anim-canvas$/.test(s))
      if (targetsBareCanvas) expect(body).not.toMatch(/touch-action/)
    }
  })

  it('puts touch-action: none on the interactive modifier instead', () => {
    const rule = rules().find((r) => r.sel.includes('.anim-canvas--interactive'))
    expect(rule?.body).toMatch(/touch-action:\s*none/)
  })

  it('withholds the modifier from a non-interactive mount, so gallery tiles still scroll', () => {
    // A gallery tile mounts the same component for a diversion that declares
    // onPointer. Keyed on onPointer alone it inherited touch-action: none and
    // became a ~26%-of-screen dead zone in a ~50,000px scroll.
    const tile = render(
      createElement(AnimationHost, {
        diversion: {
          id: 'probe',
          title: 'Probe',
          description: '',
          kind: '2d',
          schema: z.object({ v: z.number().default(0) }),
          setup: () => ({}),
          frame: () => {},
          onPointer: () => {},
        } as Diversion,
        config: { v: 0 },
        interactive: false,
      }),
    )
    expect(tile.container.querySelector('canvas')!.className).toBe('anim-canvas')
    tile.unmount()
  })

  it('withholds the pointer LISTENERS too, not just the class', () => {
    // The class half and the listener half are separate branches; guarding only
    // the class let `interactive ? diversion.onPointer : undefined` be reverted
    // with the whole suite green.
    const seen: string[] = []
    const spy = vi
      .spyOn(HTMLCanvasElement.prototype, 'addEventListener')
      .mockImplementation(function (this: HTMLCanvasElement, type: string) {
        seen.push(type)
      } as never)
    try {
      const tile = render(
        createElement(AnimationHost, {
          diversion: {
            id: 'probe',
            title: 'Probe',
            description: '',
            kind: '2d',
            schema: z.object({ v: z.number().default(0) }),
            setup: () => ({}),
            frame: () => {},
            onPointer: () => {},
          } as Diversion,
          config: { v: 0 },
          interactive: false,
        }),
      )
      expect(seen.filter((t) => t.startsWith('pointer'))).toEqual([])
      tile.unmount()
    } finally {
      spy.mockRestore()
    }
  })

  it('publishes `interactive` on the canvas for diversions that own their listeners', () => {
    // #290. A diversion that attaches its own canvas listeners (the three GPU
    // cameras) is outside React and cannot see the prop, so the host states it.
    // Both directions matter: "true" missing kills the camera on Play, and "false"
    // missing gives a gallery tile back the wheel-hijack this fixed.
    const base: Diversion = {
      id: 'probe',
      title: 'Probe',
      description: '',
      kind: '2d',
      schema: z.object({ v: z.number().default(0) }),
      setup: () => ({}),
      frame: () => {},
    }
    const play = render(createElement(AnimationHost, { diversion: base, config: { v: 0 } }))
    expect(play.container.querySelector('canvas')!.dataset.interactive).toBe('true')
    play.unmount()

    const tile = render(
      createElement(AnimationHost, { diversion: base, config: { v: 0 }, interactive: false }),
    )
    expect(tile.container.querySelector('canvas')!.dataset.interactive).toBe('false')
    tile.unmount()
  })

  it('applies the modifier for ownsCanvasGestures, but wires NO framework listeners', () => {
    // #290. The three GPU cameras attach their own listeners, so they need the CSS
    // opt-out without the framework's pointer plumbing. Both halves matter: no class
    // and a finger drag pans AND scrolls; framework listeners and `onPointer` would
    // be called on a diversion that never declared it.
    const base: Diversion = {
      id: 'probe',
      title: 'Probe',
      description: '',
      kind: '2d',
      schema: z.object({ v: z.number().default(0) }),
      setup: () => ({}),
      frame: () => {},
    }
    const seen: string[] = []
    const spy = vi
      .spyOn(HTMLCanvasElement.prototype, 'addEventListener')
      .mockImplementation(function (this: HTMLCanvasElement, type: string) {
        seen.push(type)
      } as never)
    try {
      const play = render(
        createElement(AnimationHost, {
          diversion: { ...base, ownsCanvasGestures: true } as Diversion,
          config: { v: 0 },
        }),
      )
      expect(play.container.querySelector('canvas')!.className).toContain(
        'anim-canvas--interactive',
      )
      expect(seen.filter((t) => t.startsWith('pointer'))).toEqual([])
      play.unmount()
    } finally {
      spy.mockRestore()
    }

    // A gallery tile stays inert even for a gesture-owning diversion.
    const tile = render(
      createElement(AnimationHost, {
        diversion: { ...base, ownsCanvasGestures: true } as Diversion,
        config: { v: 0 },
        interactive: false,
      }),
    )
    expect(tile.container.querySelector('canvas')!.className).toBe('anim-canvas')
    tile.unmount()
  })

  it('AnimationHost applies the modifier only when the diversion declares onPointer', () => {
    const base: Diversion = {
      id: 'probe',
      title: 'Probe',
      description: '',
      kind: '2d',
      schema: z.object({ v: z.number().default(0) }),
      setup: () => ({}),
      frame: () => {},
    }

    const inert = render(createElement(AnimationHost, { diversion: base, config: { v: 0 } }))
    expect(inert.container.querySelector('canvas')!.className).toBe('anim-canvas')
    inert.unmount()

    const interactive = render(
      createElement(AnimationHost, {
        diversion: { ...base, onPointer: () => {} },
        config: { v: 0 },
      }),
    )
    expect(interactive.container.querySelector('canvas')!.className).toContain(
      'anim-canvas--interactive',
    )
    interactive.unmount()
  })
})

describe('mobile viewport contract (#284)', () => {
  it('sizes the config screen in dvh, keeping vh as the fallback', () => {
    const rule = rules().find((r) => r.sel === '.config-screen')!
    // Order matters: the vh line must come first or it overrides dvh.
    expect(rule.body.indexOf('100vh')).toBeGreaterThanOrEqual(0)
    expect(rule.body.indexOf('100dvh')).toBeGreaterThan(rule.body.indexOf('100vh'))
  })

  it('offsets every absolutely-positioned overlay by the safe-area inset', () => {
    // viewport-fit=cover lets content reach under the notch, so an overlay pinned
    // with a bare px offset lands beneath it. These four are the whole set.
    //
    // Per-PROPERTY, not per-rule: an earlier version only asked that the rule body
    // mention env() somewhere, so reverting `right: calc(14px + env(...))` back to a
    // bare `right: 14px` while `top:` stayed converted kept it green.
    for (const sel of ['.anim-bar', '.play-chrome', '.animate-pill', '.reset-pill']) {
      const rule = rules().find((r) => r.sel === sel)
      expect(rule, `${sel} missing`).toBeDefined()
      const offsets = [...rule!.body.matchAll(/(^|[\s;])(top|right|bottom|left)\s*:([^;]*)/g)]
      expect(offsets.length, `${sel} pins nothing`).toBeGreaterThan(0)
      for (const [, , prop, value] of offsets) {
        if (value.trim() === 'auto') continue // deliberately unpinned on that edge
        expect(value, `${sel} { ${prop}: ${value.trim()} }`).toMatch(/env\(safe-area-inset-/)
      }
    }
  })

  it('gives the stacked preview an intrinsic height', () => {
    // The canvas is inset:0 against .config-preview, which gets its height from
    // grid stretch only while the page is 100dvh tall. Once the stacked layout
    // makes the page content-sized that height must be stated, or the canvas
    // collapses to zero — a blank Config screen, with jsdom none the wiser.
    const stacked = rules().find(
      (r) => r.sel === '.config-preview' && /position:\s*sticky/.test(r.body),
    )
    expect(stacked, 'no stacked .config-preview rule').toBeDefined()
    expect(stacked!.body).toMatch(/height:\s*clamp\(/)
  })

  it('pads the scrolling panels clear of the insets too, at every width', () => {
    // NOT inside the 820px media query: an iPhone Pro Max in landscape is 932px
    // wide, so it keeps the desktop two-column layout while carrying a ~59px left
    // inset — which puts the "← gallery" link and the left edge of every control
    // under the notch. env() is 0px elsewhere, so hoisting these is free.
    for (const sel of ['.config-panel', '.gallery']) {
      const rule = rules().find((r) => r.sel === sel)
      expect(rule, `${sel} missing`).toBeDefined()
      expect(rule!.body, sel).toMatch(/padding-left:\s*max\([^)]*env\(safe-area-inset-left/)
      expect(rule!.body, sel).toMatch(/padding-right:\s*max\([^)]*env\(safe-area-inset-right/)
    }
  })

  it('declares viewport-fit=cover, which is what makes the insets necessary', () => {
    // Must match inside the tag, on comment-stripped markup: index.html explains
    // viewport-fit in a comment that quotes it, so a bare file-wide search stayed
    // green with the attribute deleted from the meta tag.
    expect(markup).toMatch(/<meta name="viewport"[^>]*viewport-fit=cover/)
  })

  it('lets the wake-lock toggle inherit the 44px anim-bar touch target', () => {
    // The narrow-viewport rule grows `.anim-bar button` to 44px. The wake-lock
    // toggle IS one, so it must not restate its own box — a width/height here
    // would win on specificity and silently shrink it back below the target.
    const target = rules().find(
      (r) => r.sel === '.anim-bar button' && /width:\s*44px/.test(r.body),
    )
    expect(target, 'no 44px .anim-bar button rule').toBeDefined()
    for (const { sel, body } of rules()) {
      if (!sel.includes('.wake-lock')) continue
      expect(body, sel).not.toMatch(/(^|[\s;])(width|height|min-width|min-height):/)
    }
  })

  it('keeps the anim bar above the play chrome so they cannot occlude', () => {
    // Below 524px these two overlapped and the chrome's z-index won, making
    // Pause and Fullscreen un-tappable — taps hit the copy button instead.
    const bar = rules().find((r) => r.sel === '.anim-bar')!
    const chrome = rules().find((r) => r.sel === '.play-chrome')!
    const z = (body: string) => Number(/z-index:\s*(\d+)/.exec(body)?.[1] ?? 0)
    expect(z(bar.body)).toBeGreaterThan(z(chrome.body))
  })
})

describe('switch touch target (#290)', () => {
  /** Rules inside `@media (pointer: coarse)`. `rules()` cannot be used directly here:
   *  it reports nested rules with the media wrapper stripped, so a `.find(sel === '.sw')`
   *  returns the BASE 38x20 rule and every assertion below would read the thing it is
   *  supposed to be checking the override of. */
  function coarseRules(): { sel: string; body: string }[] {
    // EVERY such block, not the first: there is now more than one (#293 grows its own
    // buttons the same way), and taking only the first silently pointed all of the
    // assertions below at the wrong rules.
    const out: { sel: string; body: string }[] = []
    let from = 0
    for (;;) {
      const start = code.indexOf('@media (pointer: coarse)', from)
      if (start < 0) break
      const open = code.indexOf('{', start)
      let depth = 0
      let end = open
      for (let i = open; i < code.length; i++) {
        if (code[i] === '{') depth++
        else if (code[i] === '}' && --depth === 0) {
          end = i
          break
        }
      }
      const block = code.slice(open + 1, end)
      const re = /([^{}]+)\{([^{}]*)\}/g
      let m: RegExpExecArray | null
      while ((m = re.exec(block))) out.push({ sel: m[1].trim(), body: m[2] })
      from = end + 1
    }
    expect(out.length, 'no (pointer: coarse) rules').toBeGreaterThan(0)
    return out
  }
  const coarse = (sel: string) => coarseRules().find((r) => r.sel === sel)
  const px = (body: string, prop: string) =>
    Number(new RegExp(`(^|[\\s;])${prop}:\\s*(-?[\\d.]+)px`).exec(body)?.[2] ?? NaN)

  it('reads the coarse block, and the base switch is still the 38x20 one', () => {
    // Non-vacuity. Every test here is a search; a broken slicer would return [] and
    // pass the lot. Also pins the premise: the DESKTOP switch is unchanged by #290.
    expect(coarseRules().length).toBeGreaterThan(2)
    const base = rules().find((r) => r.sel === '.sw')!
    expect(px(base.body, 'width')).toBe(38)
    expect(px(base.body, 'height')).toBe(20)
  })

  it('grows the switch to a 44px target on coarse pointers', () => {
    // Not a conformance fix — 38x20 already passes SC 2.5.8 (AA) via its Spacing
    // exception at this app's 35px worst-case pitch. 44px is SC 2.5.5 (AAA) and the
    // practical touch figure, on the most-tapped control in the form.
    const sw = coarse('.sw')
    expect(sw, 'no .sw rule under (pointer: coarse)').toBeDefined()
    expect(px(sw!.body, 'width')).toBeGreaterThanOrEqual(44)
    expect(px(sw!.body, 'height')).toBeGreaterThanOrEqual(44)
  })

  it('grows a LAYOUT box, never an absolute overlay', () => {
    // The whole reason the pill moved to ::before. Two help-less booleans inside a
    // .group sit 15px apart, so an overlay reaching 12px past each edge would have
    // stacked toggles claiming 9px of each other's hit area — a tap flipping the
    // WRONG field. A real box separates its neighbours instead of overlapping them.
    const sw = coarse('.sw')!
    expect(sw.body).not.toMatch(/position:\s*absolute/)
    expect(sw.body).not.toMatch(/(^|[\s;])(inset|margin):\s*-/)
  })

  it('keeps the pill at 38x20 by painting it with ::before', () => {
    const track = coarse('.sw::before')
    expect(track, 'no .sw::before track').toBeDefined()
    expect(px(track!.body, 'height')).toBe(20)
    // Width is implied by left/right against the 42px padding box (44 less the 1px
    // borders), so assert the arithmetic rather than trusting the comment: an
    // asymmetric left/right would slide the pill off-centre with height still 20.
    const boxW = px(coarse('.sw')!.body, 'width') - 2
    const left = px(track!.body, 'left')
    const right = px(track!.body, 'right')
    expect(left).toBe(right)
    expect(boxW - left - right).toBe(38)
    // And the knob must sit inside the pill, not beyond its right edge.
    const knobOn = px(coarse('.sw.on::after')!.body, 'left')
    expect(knobOn + 14).toBeLessThanOrEqual(left + 38)
    // `*` does not match pseudo-elements, so without this the 1px border makes the
    // pill 22px tall and 1px off centre — a silent 2px drift in the form's rhythm.
    expect(track!.body).toMatch(/box-sizing:\s*border-box/)
  })

  it('restates the ON colours, which .sw.on would otherwise win back', () => {
    // Specificity, not source order, decides this: base `.sw.on` (0,2,0) outranks a
    // bare `.sw` (0,1,0) even from inside a media query. Without these two rules the
    // accent paints the whole 44x44 box — a green slab where a pill should be — and
    // the knob sits at the pill's old offset. Nothing else in the suite would notice.
    expect(coarse('.sw.on')?.body, 'the 44px box would paint accent').toMatch(
      /background:\s*transparent/,
    )
    expect(coarse('.sw.on::before')?.body, 'the pill would never light up').toMatch(
      /background:\s*var\(--accent\)/,
    )
    expect(coarse('.sw.on::after'), 'the ON knob would sit at its 38px offset').toBeDefined()
  })
})
