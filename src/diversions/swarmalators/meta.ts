import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'swarmalators',
  title: 'Swarmalators',
  description: 'Particles that swarm in space and sync in phase at once — each one\'s colour is its inner rhythm. Tune two couplings to slide between a frozen rainbow ring, a shattering of colour clusters, and a slowly rotating living annulus. Scroll to zoom, drag to pan. A new world every seed.',
  kind: 'webgpu',
} as const satisfies DiversionMeta
