import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'gpu-fluid',
  title: 'GPU Fluid',
  description: 'A real-time Stable-Fluids solver: colored dye swirls into curling vortex '
    + 'filaments that never settle, self-fed by drifting impulses.',
  kind: 'webgl',
} as const satisfies DiversionMeta
