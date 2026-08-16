import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'mccabe',
  title: 'McCabe',
  description: "Jonathan McCabe's multi-scale Turing patterns: at every point the field measures its surroundings at a ladder of blur radii, and the scale that fits best nudges it up or down — and out of pure noise grows a living field of fingerprint ridges, reptile-skin cells, and nested organic mazes.",
  kind: 'webgl',
} as const satisfies DiversionMeta
