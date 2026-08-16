import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'contagion',
  title: 'Contagion',
  description: 'An SIR/SIRS epidemic sweeps a lattice: infection fronts roll out from a few sparks, '
    + 'curl into endless spiral reinfection waves, or burn out and seed anew — the S/I/R curve '
    + 'breathing below.',
  kind: '2d',
} as const satisfies DiversionMeta
