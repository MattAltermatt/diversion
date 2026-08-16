import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'chime',
  title: 'Chime',
  description: 'A still field of wells, each filling with energy at its own pace. A full well '
    + 'rings out — a wavefront that expands exactly as far as the energy it released, tipping '
    + 'every charged well it sweeps over into ringing too. Chains, silences and standing '
    + 'interference emerge from nothing but filling and spilling.',
  kind: '2d',
} as const satisfies DiversionMeta
