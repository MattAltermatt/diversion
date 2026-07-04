import type { PercolationConfig } from './schema'

// Two independent preset axes:
//   • Sweep  — how the density p breathes (or holds) through criticality
//   • Colour — how the clusters are painted
// Seed is excluded from both so the 🎲 dice stays independent.

type SweepFields = Pick<PercolationConfig, 'sweepMode' | 'sweepSpeed' | 'pMin' | 'pMax' | 'p'>

export const sweepPresets: { name: string; patch: SweepFields }[] = [
  // Landing sweep — a slow full breath scattered ↔ full through p_c.
  { name: 'Rising Tide', patch: { sweepMode: 'sweep', sweepSpeed: 0.6, pMin: 0.42, pMax: 0.8, p: 0.593 } },
  // Tight sweep hugging the threshold — the transition flickers in and out fast.
  { name: 'On the Edge', patch: { sweepMode: 'sweep', sweepSpeed: 0.9, pMin: 0.54, pMax: 0.64, p: 0.593 } },
  // Held right at criticality — a shimmering, barely-connected fractal.
  { name: 'Criticality', patch: { sweepMode: 'manual', sweepSpeed: 0.6, pMin: 0.42, pMax: 0.8, p: 0.593 } },
  // Held dense — one dominant continent with lakes.
  { name: 'Supercritical', patch: { sweepMode: 'manual', sweepSpeed: 0.6, pMin: 0.42, pMax: 0.8, p: 0.72 } },
]

type ColourFields = Pick<PercolationConfig,
  'colorMode' | 'highlightSpanning' | 'spanningColor' | 'palette' | 'background'>

export const colourPresets: { name: string; patch: ColourFields }[] = [
  // Confetti — every cluster its own hue, gold spanning cluster.
  { name: 'Confetti', patch: { colorMode: 'cluster', highlightSpanning: true, spanningColor: '#ffd94a',
      palette: ['#16305a', '#2a7fb8', '#57cbc4', '#f4dc55', '#ef8033'], background: '#060810' } },
  // Heat map — cool islands, warm giant.
  { name: 'Heat Map', patch: { colorMode: 'size', highlightSpanning: false, spanningColor: '#ffd94a',
      palette: ['#0d1f47', '#2450a8', '#37b7c6', '#f2d64a', '#f26d2c', '#e12f2f'], background: '#04050c' } },
  // Spotlight — the spanning cluster alone, gold on slate on black.
  { name: 'Spotlight', patch: { colorMode: 'spanning', highlightSpanning: true, spanningColor: '#ffcf3a',
      palette: ['#16305a', '#2a7fb8', '#57cbc4', '#f4dc55', '#ef8033'], background: '#04050a' } },
  // Ember — the giant glows molten against embers.
  { name: 'Ember', patch: { colorMode: 'size', highlightSpanning: true, spanningColor: '#ffe08a',
      palette: ['#2a0a04', '#7a1e08', '#c0431a', '#f2922b', '#ffe0a0'], background: '#0a0402' } },
]
