import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'golden-apollonian',
  title: 'Golden Apollonian',
  description: 'An endless flight down a tunnel whose walls are glowing golden Apollonian-gasket fractals — a stack of receding planes, each a folded-cube sphere-inversion fractal lit by two soft lights and a sun far down the throat, weaving along a curved path with kaleidoscopic symmetry that cycles as you fall.',
  kind: 'webgl',
} as const satisfies DiversionMeta
