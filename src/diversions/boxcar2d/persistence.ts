/**
 * persistence.ts — auto-persist / resume an evolution run (#226).
 *
 * A share-link reproduces seed+config (a *fresh* run); this restores the champions
 * you actually bred. We persist the evolved population + generation + records +
 * trackSeed to localStorage, keyed once, versioned. Resuming re-simulates nothing —
 * the genomes ARE the payload (re-running N generations from the seed would be slow
 * and, since the seed only fixes gen 1, wouldn't reproduce a live run anyway).
 *
 * Everything here is fail-soft: storage may be disabled, full, or hold a stale/
 * corrupt blob from an older build. Every read returns null rather than throwing,
 * every write swallows quota/security errors — persistence is a convenience, never a
 * correctness dependency.
 */
import { boxcar2dSchema, type BoxCar2DConfig } from './schema'
import { MAX_NODES, MAX_WHEELS, N_PAIRS, type Genome } from './genome'

export const RUN_STORAGE_KEY = 'diversion:boxcar2d:run'
const VERSION = 1

/** The resumable snapshot. `bestTimeSec` may be Infinity in memory; on disk it is
 *  stored as null (JSON turns Infinity into null anyway) and rehydrated on load. */
export interface RunBlob {
  config: BoxCar2DConfig
  population: Genome[]
  generation: number
  bestDistMeters: number
  bestTimeSec: number
  trackSeed: number
}

/** Run-shaping config fields: if any differ, a saved population is meaningless
 *  (bred against a different track / population size / mode / goal). Cosmetic fields
 *  (color, speed, showHud) are excluded so tweaking looks never voids a resume. */
export const RUN_SHAPE_FIELDS = [
  'seed', 'population', 'eliteCount', 'mutationRate', 'trackLifespan',
  'mode', 'goalDistance', 'timeCap', 'roughness', 'terrainType',
  'rubbleDensity', 'minProgress', 'progressWindow',
] as const

/** True if two configs describe the SAME run (all run-shaping fields equal). The
 *  resume gate: setup() only restores a saved population when its config matches. */
export function sameRun(a: BoxCar2DConfig, b: BoxCar2DConfig): boolean {
  return RUN_SHAPE_FIELDS.every((f) => a[f] === b[f])
}

/** Auto-persist the current run. Never throws (quota / disabled storage → no-op). */
export function saveRun(blob: RunBlob): void {
  try {
    const onDisk = {
      v: VERSION,
      config: blob.config,
      population: blob.population,
      generation: blob.generation,
      bestDistMeters: blob.bestDistMeters,
      bestTimeSec: Number.isFinite(blob.bestTimeSec) ? blob.bestTimeSec : null,
      trackSeed: blob.trackSeed,
    }
    localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(onDisk))
  } catch {
    // storage full / disabled / private-mode — persistence is best-effort
  }
}

function isGenome(g: unknown): g is Genome {
  if (!g || typeof g !== 'object') return false
  const { nodes, pairs, wheels } = g as Record<string, unknown>
  return (
    Array.isArray(nodes) && nodes.length === MAX_NODES &&
    Array.isArray(pairs) && pairs.length === N_PAIRS &&
    Array.isArray(wheels) && wheels.length === MAX_WHEELS
  )
}

/** Load + validate the saved run, or null if absent / stale / corrupt. Rehydrates
 *  the Infinity best-time and re-parses the config through the schema (a defence
 *  against an older build's shape leaking in). */
export function loadRun(): RunBlob | null {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(RUN_STORAGE_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const d = JSON.parse(raw) as Record<string, unknown>
    if (d.v !== VERSION) return null
    const parsed = boxcar2dSchema.safeParse(d.config)
    if (!parsed.success) return null
    if (!Array.isArray(d.population) || d.population.length === 0 || !d.population.every(isGenome)) return null
    if (typeof d.generation !== 'number' || d.generation < 1) return null
    if (typeof d.trackSeed !== 'number') return null
    return {
      config: parsed.data,
      population: d.population as Genome[],
      generation: d.generation,
      bestDistMeters: typeof d.bestDistMeters === 'number' ? d.bestDistMeters : 0,
      bestTimeSec: typeof d.bestTimeSec === 'number' ? d.bestTimeSec : Infinity,
      trackSeed: d.trackSeed,
    }
  } catch {
    return null
  }
}

/** Discard the saved run (the "New run" button). Never throws. */
export function clearRun(): void {
  try {
    localStorage.removeItem(RUN_STORAGE_KEY)
  } catch {
    // no-op
  }
}
