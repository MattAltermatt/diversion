import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'julia-morph',
  title: 'Julia Morph',
  description: 'The Julia set z ← z² + c, with c endlessly orbiting the complex plane so the fractal breathes between dendrites, spirals, and scattered islands — never landing on one shape.',
  kind: 'webgl',
} as const satisfies DiversionMeta
