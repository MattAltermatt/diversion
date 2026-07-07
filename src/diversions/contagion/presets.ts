import type { ContagionConfig } from './schema'

type Patch = { name: string; patch: Partial<ContagionConfig> }

// Two independent axes. Regime sets the epidemic dynamics (SIR burnout vs SIRS
// spiral waves vs near-threshold sputter); Palette swaps the colour ramp. Speed,
// grid, and seed stay user-controlled outside both.

export const regimePresets: Patch[] = [
  {
    name: 'Spiral Fever',
    patch: { transmission: 0.35, infectiousDuration: 6, immunityDuration: 28, seedCount: 6, sparkRate: 0.00004 },
  },
  {
    name: 'Endemic Churn',
    patch: { transmission: 0.6, infectiousDuration: 5, immunityDuration: 14, seedCount: 8, sparkRate: 0.00008 },
  },
  {
    name: 'Burnout (SIR)',
    patch: { transmission: 0.5, infectiousDuration: 7, immunityDuration: 0, seedCount: 5, sparkRate: 0 },
  },
  {
    name: 'Fragile Spark',
    patch: { transmission: 0.16, infectiousDuration: 8, immunityDuration: 36, seedCount: 10, sparkRate: 0.00002 },
  },
]

export const palettePresets: Patch[] = [
  {
    name: 'Bloom',
    patch: {
      palette: [
        '#05060f', '#0b0a22', '#160e39', '#25124f', '#3a1563', '#531a70', '#711f77', '#912577',
        '#b12d70', '#cc3a63', '#e14e55', '#f0664f', '#f9835a', '#fea678', '#ffcaa2', '#fff0dd',
      ],
    },
  },
  {
    name: 'Toxic',
    patch: {
      palette: [
        '#05100a', '#08210f', '#0c3315', '#10471a', '#155c1d', '#1c7320', '#278a24', '#37a029',
        '#4fb531', '#6fc93e', '#93da53', '#b8e870', '#d8f295', '#eefabf', '#f7fddb', '#fffff0',
      ],
    },
  },
  {
    name: 'Cryo',
    patch: {
      palette: [
        '#04070f', '#061530', '#08214a', '#0a2f63', '#0c3d7d', '#0e4d93', '#105ea8', '#1372bb',
        '#1787cc', '#1e9dd8', '#2ab3e2', '#3fc7ea', '#63d6f0', '#93e4f5', '#c3f2fa', '#eafcff',
      ],
    },
  },
  {
    name: 'Ferroin',
    patch: {
      palette: [
        '#0a0300', '#1c0700', '#2e0c00', '#431100', '#5a1600', '#731b00', '#8d2100', '#a72900',
        '#c03400', '#d64400', '#e85a05', '#f47516', '#fb9432', '#ffb861', '#ffd89a', '#fff2d6',
      ],
    },
  },
]
