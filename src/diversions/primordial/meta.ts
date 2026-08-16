import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'primordial',
  title: 'Primordial',
  description: 'Thousands of identical particles obey one tiny motion law — turn toward your more crowded side — and, from that single rule, spontaneously condense into wandering cell-like membranes that grow, pulse, and divide. Artificial life from nothing.',
  kind: '2d',
} as const satisfies DiversionMeta
