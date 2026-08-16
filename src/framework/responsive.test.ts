import { describe, it, expect } from 'vitest'
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
    for (const sel of ['.anim-bar', '.play-chrome', '.animate-pill', '.reset-pill']) {
      const rule = rules().find((r) => r.sel === sel)
      expect(rule, `${sel} missing`).toBeDefined()
      expect(rule!.body, sel).toMatch(/env\(safe-area-inset-/)
    }
  })

  it('declares viewport-fit=cover, which is what makes the insets necessary', () => {
    expect(html).toMatch(/viewport-fit=cover/)
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
