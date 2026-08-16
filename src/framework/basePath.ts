/**
 * Where the app is served from, as a function of how Vite was invoked (#288).
 *
 * Project Pages live at https://mattaltermatt.github.io/diversion/, so the built
 * app is served from the `/diversion/` subpath; the dev server serves from the
 * root. `App.tsx` derives the router's basename from `import.meta.env.BASE_URL`,
 * so this is the single place the prefix is decided.
 *
 * It is a named function rather than an inline ternary in `vite.config.ts` for one
 * reason: `vite.config.ts` cannot be unit-tested from inside `src` without pulling
 * Node's types into the app's TS project, and this branch has already been wrong
 * once — for about a year — in a way nothing caught.
 */
export interface BaseEnv {
  command: 'build' | 'serve'
  isPreview?: boolean
}

export function resolveBase({ command, isPreview }: BaseEnv): string {
  // `vite preview` reports command: 'serve', exactly like the dev server — Vite's
  // ConfigEnv documents `command` as "'serve': during dev (`vite` command)", which
  // reads as though preview were a third thing. It is not. Gating on `command`
  // alone therefore served the BUILT bundle (whose asset URLs are all baked with
  // the /diversion/ prefix) from `/`, while the router ran with basename
  // '/diversion' — a blank page, and the reason the production bundle had
  // effectively never been run locally.
  //
  // The invariant is "preview agrees with build", not "build gets the prefix":
  // serving what build emitted is the whole job of preview.
  return command === 'build' || isPreview ? '/diversion/' : '/'
}
