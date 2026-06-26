import type { Diversion } from './types'

// Eagerly import every diversion's index module. Vite resolves this at build time.
const modules = import.meta.glob<{ default: Diversion }>('../diversions/*/index.ts', {
  eager: true,
})

const diversions: Diversion[] = Object.values(modules)
  .map((m) => m.default)
  .sort((a, b) => a.title.localeCompare(b.title))

export function listDiversions(): Diversion[] {
  return diversions
}

export function getDiversion(id: string): Diversion | undefined {
  return diversions.find((d) => d.id === id)
}
