// The project states its Node runtime in three places that have to agree, and nothing
// else compares them (#307/#308). Before this, CI ran 20, `@types/node` was pinned at 24
// and the author's machine ran 26 — three different answers to "what Node is this", none
// of which a green build could distinguish. `engines` is advisory (there is no
// engine-strict) and `tsc` never reads `.nvmrc`, so agreement is enforced by no tool:
// this is the guard, in the shape the repo already uses for every other invariant.
import { describe, it, expect } from 'vitest'
// @ts-expect-error tsconfig.app exposes only vite/client types; node's are not
// widened into the app for one test file. Same pattern as manifest.test.ts.
import { readFileSync } from 'node:fs'

const read = (p: string): string => readFileSync(p, 'utf8')

describe('the declared Node runtime', () => {
  const nvmrc = read('.nvmrc').trim()
  const pkg = JSON.parse(read('package.json'))

  it('is a bare major in .nvmrc, which setup-node and a version manager both read', () => {
    expect(nvmrc).toMatch(/^\d+$/)
  })

  it('is the floor engines.node declares', () => {
    // `>=24` admits the 26 the author actually runs, while refusing the EOL 20 CI was on.
    expect(pkg.engines?.node).toBe(`>=${nvmrc}`)
  })

  it('is the major @types/node is pinned to, so tsc types against what CI runs', () => {
    // Dependabot will offer @types/node 26 on its own; taking it types the build against
    // APIs Node 24 does not ship. This is what makes that a red PR rather than a silent
    // divergence — bump .nvmrc and engines in the same change, or hold the PR.
    const range: string = pkg.devDependencies['@types/node']
    expect(range.replace(/^\D*/, '').split('.')[0]).toBe(nvmrc)
  })

  it('is what both workflows resolve, rather than a fourth copy of the number', () => {
    for (const wf of ['.github/workflows/ci.yml', '.github/workflows/deploy.yml']) {
      const s = read(wf)
      expect(s).toContain('node-version-file: .nvmrc')
      expect(s).not.toMatch(/^\s*node-version:\s*\d/m)
    }
  })
})
