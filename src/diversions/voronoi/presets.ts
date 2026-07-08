import type { VoronoiConfig } from './schema'

// Palette = cell wheel + edge (leading) color.
export const palettePresets: { name: string; patch: Pick<VoronoiConfig, 'palette' | 'edgeColor'> }[] = [
  { name: 'Stained Glass', patch: { palette: ['#1a0a3c', '#7b2fbf', '#c23b6e', '#e8823c', '#f0d060'], edgeColor: '#05070d' } },
  { name: 'Cathedral',     patch: { palette: ['#0a1030', '#243a7a', '#3f6fb8', '#e0c060', '#a8203a'], edgeColor: '#000308' } },
  { name: 'Neon',          patch: { palette: ['#0a0018', '#ff2079', '#00e0ff', '#7a3aff', '#f0ff40'], edgeColor: '#000000' } },
  { name: 'Autumn Leaves', patch: { palette: ['#2a1406', '#8a3a10', '#d8701e', '#e8b030', '#a02818'], edgeColor: '#140a04' } },
  { name: 'Deep Ocean',    patch: { palette: ['#020a14', '#053a4a', '#0e8a8a', '#5adcc0', '#c8f0e0'], edgeColor: '#01050a' } },
]
