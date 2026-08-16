import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'lyapunov',
  title: 'Lyapunov',
  description: 'The Markus–Lyapunov "Zircon Zity" fractal — a binary A/B sequence drives the logistic map, and its Lyapunov exponent paints glowing warm stable cities against deep chaotic voids, slowly drifting through parameter space.',
  kind: 'webgl',
} as const satisfies DiversionMeta
