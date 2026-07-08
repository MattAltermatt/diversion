import type { XraySwarmConfig } from './schema'

// Palette axis (Schema UX canon #256) — each option patches the SAME key-set
// (palette + background) so matchPresets can flip to "Custom" on manual drift.
export const palettePresets: { name: string; patch: Partial<XraySwarmConfig> }[] = [
  {
    name: 'X-Ray Cyan',
    patch: { palette: ['#00eaff', '#38bfff', '#7b5cff', '#c150ff'], background: '#03050a' },
  },
  {
    name: 'Neon Violet',
    patch: { palette: ['#7b2fff', '#c93bff', '#ff4de1', '#4d7bff'], background: '#07030f' },
  },
  {
    name: 'Bio Emerald',
    patch: { palette: ['#00ffb0', '#39ff88', '#a6ff4d', '#00e0ff'], background: '#020a07' },
  },
  {
    name: 'Ember Scan',
    patch: { palette: ['#ff5c3d', '#ff9e4d', '#ffe14d', '#ff2f7a'], background: '#0a0402' },
  },
]
