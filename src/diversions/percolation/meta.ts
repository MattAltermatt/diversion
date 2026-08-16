import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'percolation',
  title: 'Percolation',
  description: 'Open sites scatter across a lattice; as their density crosses criticality a lacy '
    + 'fractal cluster abruptly spans the whole grid — the giant-component phase transition.',
  kind: '2d',
} as const satisfies DiversionMeta
