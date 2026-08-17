import type { RorschachConfig } from './schema'

// Two independent preset axes:
//   • Form — symmetry + walk feel (what the blot's shape is like)
//   • Ink  — colours + edge treatment (how it's inked on the paper)
// Seed is excluded from both so the 🎲 dice stays independent.

type FormFields = Pick<RorschachConfig, 'symmetry' | 'lobes' | 'spread' | 'blotSize'>

export const formPresets: { name: string; patch: FormFields }[] = [
  { name: 'Classic Card', patch: { symmetry: 'bilateral', lobes: 4, spread: 0.5, blotSize: 0.72 } },
  { name: 'Butterfly', patch: { symmetry: 'bilateral', lobes: 2, spread: 0.35, blotSize: 0.66 } },
  { name: 'Tangle', patch: { symmetry: 'bilateral', lobes: 7, spread: 0.8, blotSize: 0.82 } },
  { name: 'Kaleidoscope', patch: { symmetry: 'quad', lobes: 5, spread: 0.55, blotSize: 0.8 } },
  { name: 'Snowflake', patch: { symmetry: 'quad', lobes: 3, spread: 0.4, blotSize: 0.7 } },
]

type InkFields = Pick<RorschachConfig, 'edgeSoftness' | 'twoTone' | 'blotColor' | 'accentColor' | 'background'>

export const inkPresets: { name: string; patch: InkFields }[] = [
  // The iconic look — near-black ink on cream card, crisp bold silhouette.
  { name: 'Inkblot', patch: { edgeSoftness: 0.35, twoTone: false,
      blotColor: '#111014', accentColor: '#8a1f2b', background: '#efe9dc' } },
  // A little pigment feathering into the paper.
  { name: 'Sanguine', patch: { edgeSoftness: 0.5, twoTone: true,
      blotColor: '#2a1414', accentColor: '#a83a2e', background: '#f2ede0' } },
  // Deep indigo on warm parchment.
  { name: 'Indigo', patch: { edgeSoftness: 0.4, twoTone: true,
      blotColor: '#14183a', accentColor: '#3f6fb0', background: '#ece4d0' } },
  // Inverted — luminous blot glowing on deep black.
  { name: 'Nocturne', patch: { edgeSoftness: 0.6, twoTone: true,
      blotColor: '#eef2ff', accentColor: '#5aa0ff', background: '#06070c' } },
  // Verdigris ink on slate.
  { name: 'Patina', patch: { edgeSoftness: 0.45, twoTone: true,
      blotColor: '#0e2a24', accentColor: '#4ea88c', background: '#d7d3c4' } },
]
