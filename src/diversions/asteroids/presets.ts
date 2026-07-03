import type { PresetOption } from '../../framework/types'
import type { AsteroidsConfig } from './schema'

// Scene = composition axis. Every option MUST set the SAME key-set —
// matchPresets assumes equal keys per group (framework rule).
type SceneKeys = Pick<AsteroidsConfig,
  'count' | 'sizeScale' | 'jaggedness' | 'tumble' | 'rimLight'
  | 'sunX' | 'sunY' | 'sunSize' | 'sunGlow' | 'rayCount' | 'rayReach'
  | 'cloudScale' | 'wispiness' | 'contrast' | 'dustLanes'
  | 'panMode' | 'panSpeed' | 'panRange' | 'dust' | 'stars'>

export const scenePresets: { name: string; patch: SceneKeys }[] = [
  { name: 'Asteroid Field', patch: {   // reference match
    count: 20, sizeScale: 1, jaggedness: 0.45, tumble: 0.4, rimLight: 0.65,
    sunX: 0.78, sunY: 0.32, sunSize: 0.38, sunGlow: 0.62, rayCount: 7, rayReach: 0.6,
    cloudScale: 1.1, wispiness: 0.5, contrast: 0.5, dustLanes: 0.7,
    panMode: 'Drift', panSpeed: 0.25, panRange: 0.5, dust: 0.55, stars: 0.5,
  } },
  { name: 'Dense Belt', patch: {       // crowded field of smaller rocks
    count: 44, sizeScale: 0.8, jaggedness: 0.5, tumble: 0.45, rimLight: 0.6,
    sunX: 0.8, sunY: 0.3, sunSize: 0.36, sunGlow: 0.6, rayCount: 6, rayReach: 0.55,
    cloudScale: 1.15, wispiness: 0.55, contrast: 0.5, dustLanes: 0.6,
    panMode: 'Drift', panSpeed: 0.28, panRange: 0.55, dust: 0.6, stars: 0.5,
  } },
  { name: 'Sparse Drift', patch: {     // a few big boulders, calm and open
    count: 8, sizeScale: 1.4, jaggedness: 0.4, tumble: 0.3, rimLight: 0.7,
    sunX: 0.74, sunY: 0.34, sunSize: 0.42, sunGlow: 0.66, rayCount: 8, rayReach: 0.65,
    cloudScale: 0.95, wispiness: 0.45, contrast: 0.45, dustLanes: 0.4,
    panMode: 'Drift', panSpeed: 0.18, panRange: 0.5, dust: 0.3, stars: 0.6,
  } },
  { name: 'Dust Storm', patch: {       // thick veils, dim filtered sun
    count: 22, sizeScale: 0.9, jaggedness: 0.5, tumble: 0.4, rimLight: 0.55,
    sunX: 0.8, sunY: 0.28, sunSize: 0.34, sunGlow: 0.5, rayCount: 4, rayReach: 0.5,
    cloudScale: 1.2, wispiness: 0.6, contrast: 0.55, dustLanes: 0.9,
    panMode: 'Drift', panSpeed: 0.22, panRange: 0.5, dust: 0.7, stars: 0.4,
  } },
]

// Palette = independent color axis (all options share the same color key-set).
export const palettePresets: PresetOption<AsteroidsConfig>[] = [
  { name: 'Homeworld', patch: {
    nebula: ['#1a1440', '#2a1a4a', '#3a2260', '#22407a', '#2e6a8a'],
    sunColor: '#ffcf99', rimColor: '#ffb877', rockColor: '#080610', background: '#0a0a1a',
  } },
  { name: 'Ember', patch: {
    nebula: ['#2a0e10', '#5a1a1e', '#8a3a24', '#b8602a', '#e0a24a'],
    sunColor: '#bfe0ff', rimColor: '#ffd08a', rockColor: '#0c0605', background: '#160806' },
  },
  { name: 'Ice', patch: {
    nebula: ['#0a1e2a', '#124055', '#1e6a7a', '#3aa0a8', '#bfe8e0'],
    sunColor: '#fff2d6', rimColor: '#d8f4ff', rockColor: '#050c10', background: '#06121a' },
  },
  { name: 'Void', patch: {
    nebula: ['#0e0e1a', '#1c1c34', '#2e2e52', '#4a4a78', '#8a8ab0'],
    sunColor: '#e8e0ff', rimColor: '#c8c0ff', rockColor: '#050508', background: '#08080f' },
  },
]
