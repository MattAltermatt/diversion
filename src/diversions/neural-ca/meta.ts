import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'neural-ca',
  title: 'Neural CA',
  description: 'A learned cellular automaton: each cell runs a tiny pretrained neural net over its hex neighbourhood, growing an endless churning texture. After Mordvintsev & Niklasson, Self-Organising Textures.',
  kind: 'webgl',
} as const satisfies DiversionMeta
