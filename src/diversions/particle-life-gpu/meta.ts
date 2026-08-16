import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'particle-life-gpu',
  title: 'Particle Life (GPU)',
  description: 'The same hidden matrix of attractions that grows cell-like creatures from random soup — now run entirely on the GPU as a compute shader, so tens of thousands of particles swarm at once. Scroll to zoom, drag to pan. A different world every seed.',
  kind: 'webgpu',
} as const satisfies DiversionMeta
