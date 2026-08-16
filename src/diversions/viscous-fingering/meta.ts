import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'viscous-fingering',
  title: 'Viscous Fingering',
  description: 'A less-viscous fluid injected into a thicker one forks into glowing, tip-splitting fractal fingers.',
  kind: 'webgl',
} as const satisfies DiversionMeta
