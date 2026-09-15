import type { PresetOption } from '../../framework/types'
import type { SoapFilmConfig } from './schema'

/** Two independent axes, so two groups — `matchPresets` assumes equal key-sets within a
 *  group and returns the first match, so an interface-regime option and a pace option in
 *  the same group would fight. Every group must also open on a NAMED option against the
 *  shipped defaults (#311), which is why `Mobile` and `Daylight` are byte-identical to
 *  the schema's own values. */
export const filmPresets: PresetOption<SoapFilmConfig>[] = [
  { name: 'Mobile', patch: { mobility: 1, drainRate: 1 } },
  { name: 'Stirred', patch: { mobility: 0.55, drainRate: 0.8 } },
  { name: 'Rigid', patch: { mobility: 0, drainRate: 1 } },
]

export const pacePresets: PresetOption<SoapFilmConfig>[] = [
  { name: 'Museum', patch: { tempo: 1 } },
  { name: 'Brisk', patch: { tempo: 2.4 } },
  { name: 'Crawl', patch: { tempo: 0.4 } },
]

export const lightPresets: PresetOption<SoapFilmConfig>[] = [
  { name: 'Daylight', patch: { illuminant: 'Daylight' } },
  { name: 'Overcast', patch: { illuminant: 'Overcast' } },
  { name: 'Tungsten', patch: { illuminant: 'Tungsten' } },
  { name: 'Studio', patch: { illuminant: 'Studio' } },
]
