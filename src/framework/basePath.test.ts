import { describe, it, expect } from 'vitest'
import { resolveBase } from './basePath'

// Contract test for the `base` decision behind vite.config.ts (#288).
//
// This branch was wrong for about a year and nothing caught it: `vite preview`
// reports `command: 'serve'`, identically to the dev server, so a `command`-only
// gate served the built bundle (asset URLs baked with the /diversion/ prefix) from
// `/` while the router ran with basename '/diversion'. Blank page — and so the
// production bundle had effectively never been run locally, which is why a 5.1s
// cold-cache mobile LCP went unmeasured until #284 went looking for it.
//
// Guarding the resolved STRING rather than the shape of the condition keeps this
// true however the branch is later spelled.

describe('resolveBase', () => {
  it('serves the /diversion/ subpath for a production build', () => {
    expect(resolveBase({ command: 'build' })).toBe('/diversion/')
  })

  it('serves the /diversion/ subpath under `vite preview`', () => {
    // The actual regression. Without the isPreview arm this returns '/'.
    expect(resolveBase({ command: 'serve', isPreview: true })).toBe('/diversion/')
  })

  it('agrees between build and preview', () => {
    // THIS is the invariant; the two cases above are only its endpoints. Whatever
    // prefix the build bakes into its asset URLs, preview has to serve from —
    // that agreement is the entire job of the preview server.
    expect(resolveBase({ command: 'serve', isPreview: true })).toBe(
      resolveBase({ command: 'build' }),
    )
  })

  it('serves the root for the dev server', () => {
    // Dev genuinely differs — CLAUDE.md: "dev URLs have no /diversion prefix".
    expect(resolveBase({ command: 'serve' })).toBe('/')
    expect(resolveBase({ command: 'serve', isPreview: false })).toBe('/')
  })
})
