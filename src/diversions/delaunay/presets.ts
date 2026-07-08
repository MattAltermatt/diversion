import type { DelaunayMeshConfig } from './schema'

// Palette = facet wheel + background. Triangles are tinted around the wheel by
// their centroid position, drifting slowly over time.
export const palettePresets: { name: string; patch: Pick<DelaunayMeshConfig, 'palette' | 'background'> }[] = [
  { name: 'Crystal',  patch: { palette: ['#0b0f2e', '#1b3a7a', '#2e86ab', '#6fd6d0', '#c9a7eb'], background: '#04050c' } },
  { name: 'Terrain',  patch: { palette: ['#1a2e12', '#3a6b2a', '#7fa040', '#c9a860', '#e8dcc0'], background: '#0a1206' } },
  { name: 'Ember',    patch: { palette: ['#1a0605', '#5a1a12', '#c0421e', '#f0863a', '#ffd27a'], background: '#0a0302' } },
  { name: 'Neon',     patch: { palette: ['#0a0016', '#3a0a6e', '#c020c0', '#20e0d0', '#f0f060'], background: '#03000a' } },
  { name: 'Slate',    patch: { palette: ['#151a24', '#2e3d52', '#5a7290', '#a8bcce'], background: '#0a0d12' } },
]
