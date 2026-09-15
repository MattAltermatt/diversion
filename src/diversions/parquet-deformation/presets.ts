import type { ParquetConfig } from './schema'

type DeformKeys = 'scheme' | 'organicFamily' | 'fractalRule' | 'rampMapping'
  | 'detail' | 'amplitude' | 'field' | 'rampWidth'

// ⚠️ `Lace` is the option that must equal the schema defaults FIELD FOR FIELD, or
// presetSweep's opens-on-a-name gate goes red — and that gate fires from
// codec-keystone-guard the moment this file is written. If any default moves,
// move it here in the same commit.
export const deformationPresets: { name: string; patch: Pick<ParquetConfig, DeformKeys> }[] = [
  { name: 'Lace', patch: { scheme: 'Organic', organicFamily: 'Restless', fractalRule: 'Koch step', rampMapping: 'To the knee', detail: 30, amplitude: 1.7, field: 'Ramp', rampWidth: 14 } },
  { name: 'Knotwork', patch: { scheme: 'Organic', organicFamily: 'Wild', fractalRule: 'Koch step', rampMapping: 'Whole stack', detail: 44, amplitude: 1.7, field: 'Ramp', rampWidth: 7 } },
  { name: 'Rosette', patch: { scheme: 'Organic', organicFamily: 'Calm', fractalRule: 'Koch step', rampMapping: 'To the knee', detail: 34, amplitude: 1.9, field: 'Radial', rampWidth: 11 } },
  { name: 'Huff plate', patch: { scheme: 'Grid keys', organicFamily: 'Restless', fractalRule: 'Koch step', rampMapping: 'To the knee', detail: 26, amplitude: 1, field: 'Ramp', rampWidth: 7 } },
  { name: 'Labyrinth', patch: { scheme: 'Grid keys', organicFamily: 'Restless', fractalRule: 'Koch step', rampMapping: 'To the knee', detail: 40, amplitude: 1, field: 'Diagonal', rampWidth: 11 } },
  { name: 'Dragon', patch: { scheme: 'Fractal', organicFamily: 'Restless', fractalRule: 'Puzzle bump', rampMapping: 'To the knee', detail: 28, amplitude: 1, field: 'Ramp', rampWidth: 9 } },
  { name: 'Snowflake', patch: { scheme: 'Fractal', organicFamily: 'Restless', fractalRule: 'Koch step', rampMapping: 'To the knee', detail: 28, amplitude: 1.3, field: 'Radial', rampWidth: 11 } },
]

// 'Huff plate' is a DEFORMATION, not a plate: the ink-on-cream half of that look
// lives in the Palette group, because presetSweep requires one key-set per group
// and a deformation option cannot carry colours.
export const palettePresets: {
  name: string
  patch: Pick<ParquetConfig, 'tileA' | 'tileB' | 'line' | 'background'>
}[] = [
  { name: 'Slate parquet', patch: { tileA: '#3c556b', tileB: '#d9d3c5', line: '#0d1013', background: '#171a1d' } },
  { name: 'Ink on cream', patch: { tileA: '#ddd1ba', tileB: '#ece3d2', line: '#1b1714', background: '#ece3d2' } },
  { name: 'Kaplan plate', patch: { tileA: '#6d94a6', tileB: '#dfded3', line: '#20272b', background: '#f2f2f0' } },
  { name: 'Stained glass', patch: { tileA: '#1d6f8e', tileB: '#c2521f', line: '#f0ead8', background: '#0a0a0d' } },
  { name: 'Verdigris', patch: { tileA: '#2e5d52', tileB: '#cfd8cc', line: '#0a0f0d', background: '#101614' } },
  { name: 'Mono', patch: { tileA: '#4a4a52', tileB: '#e8e8ee', line: '#0a0a0c', background: '#0a0a0c' } },
]
