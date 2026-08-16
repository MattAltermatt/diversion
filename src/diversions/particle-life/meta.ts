import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'particle-life',
  title: 'Particle Life',
  description: 'Colored particles obey a hidden matrix of attractions and repulsions. From random soup, cell-like creatures, membranes, and endless chases self-organize — a different world every seed.',
  kind: '2d',
} as const satisfies DiversionMeta
