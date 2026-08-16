import type { Diversion } from './types'

// TEST-ONLY registry (#288). Must never be imported from production code — doing so
// would eagerly pull all 137 diversions back into the entry chunk and silently undo
// the code-split, with every test still green. `contract.test.ts` guards that.
//
// Why an eager glob is fine HERE: vitest does not bundle. The sweeps below all
// iterate at module scope (`for (const d of allDiversions)`) because they generate
// one `it()` per diversion, and vitest collects synchronously — an async loader
// could not drive them without restructuring several thousand cases. So the eager
// glob simply moved out of registry.ts into a file the browser never sees.
//
// This also keeps the keystone guarantees honest: codecSweep / seedContract /
// urlKeys still sweep all 137 REAL schemas, exactly as before.
const modules = import.meta.glob<{ default: Diversion }>('../diversions/*/index.ts', {
  eager: true,
})

const slugOf = (p: string) => p.replace(/.*\/diversions\/([^/]+)\/index\.ts$/, '$1')

/** Every fully-loaded diversion, title-sorted — the order listDiversions() uses. */
export const allDiversions: Diversion[] = Object.values(modules)
  .map((m) => m.default)
  .sort((a, b) => a.title.localeCompare(b.title))

/** [folderSlug, diversion] pairs, for tests that check the slug ⇆ id relationship. */
export const allDiversionEntries: (readonly [string, Diversion])[] = Object.entries(
  modules,
).map(([p, m]) => [slugOf(p), m.default] as const)
