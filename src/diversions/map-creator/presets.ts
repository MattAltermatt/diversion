import type { MapCreatorConfig } from './schema'

// The color/appearance preset axis (schema-UX-canon #256) — one PresetGroup
// labeled 'Palette'. Each option patches the whole `palette` group (top-level
// spread rule) with all 8 semantic-role swatches, so matchPresets' equal-key-set
// assumption holds and a manual edit correctly falls back to "Custom".

type PaletteFields = Pick<MapCreatorConfig, 'palette'>

export const palettePresets: { name: string; patch: PaletteFields }[] = [
  { name: 'Antique Parchment', patch: { palette: {
    sea: '#8fb0ba', beach: '#e0c98a', desert: '#d8b876', grassland: '#9fae66',
    forest: '#5f7a4a', mountain: '#8a7a68', snow: '#eef0e6', ink: '#3b2b1a',
  } } },
  { name: 'Sea Chart', patch: { palette: {
    sea: '#4a6f8a', beach: '#d9c48f', desert: '#c9a86a', grassland: '#7d9463',
    forest: '#4a6042', mountain: '#6f6558', snow: '#eef1ea', ink: '#1c2b3a',
  } } },
  { name: 'Emerald Isles', patch: { palette: {
    sea: '#6fa8a0', beach: '#e3cf94', desert: '#c7b06a', grassland: '#7fae55',
    forest: '#3f6b3a', mountain: '#7a7562', snow: '#f0f2e8', ink: '#2b3a1f',
  } } },
  { name: 'Dune Realm', patch: { palette: {
    sea: '#8bb0ad', beach: '#e8cf98', desert: '#dba85f', grassland: '#b3a35c',
    forest: '#6b7a45', mountain: '#8f7458', snow: '#f2ead6', ink: '#4a3018',
  } } },
  { name: 'Frozen North', patch: { palette: {
    sea: '#7f9fb0', beach: '#dbe3e0', desert: '#c9c6b0', grassland: '#8fae9a',
    forest: '#4f6b5f', mountain: '#7d8892', snow: '#f5f7fa', ink: '#2c3a44',
  } } },
]
