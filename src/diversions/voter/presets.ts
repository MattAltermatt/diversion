import type { VoterConfig } from './schema'

// Palette presets patch the whole `palette` array — its length sets k (the opinion
// count), so a preset can also change how many opinions compete. 'Sunset' equals the
// schema default so the picker shows it selected on a fresh load.
export const palettePresets: Array<{ name: string; patch: Partial<VoterConfig> }> = [
  { name: 'Sunset', patch: { palette: ['#ff5d73', '#ffb84d', '#f4e04d', '#6bdc7d', '#4ddbe0', '#5d8bff', '#b06bff'] } },
  { name: 'Duel', patch: { palette: ['#ff4d6d', '#4dd0e1', '#ffd166'] } },
  { name: 'Rainbow', patch: { palette: ['#ff4d4d', '#ff9f4d', '#ffe14d', '#7ee06a', '#4dd6c0', '#4d9dff', '#9a6bff', '#ff6bd6'] } },
  { name: 'Ice', patch: { palette: ['#d8f4ff', '#a8e0f5', '#7cc8ee', '#4fa9e0', '#2f7fc9', '#1e5aa8'] } },
]
