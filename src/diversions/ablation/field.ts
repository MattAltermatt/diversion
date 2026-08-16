import { makeNoise3D } from '../../framework/rng'

// The picture Ablation eats: fractal value noise sampled at cell resolution and
// quantized into contour bands, one per palette entry. A cell stores a palette
// INDEX, never a colour — matching a turret to a cell is an integer compare, which
// is what lets a turret be drawn in exactly the swatch it hunts.

export interface Field {
  cols: number
  rows: number
  /** Number of contour bands — always the palette's length. */
  bands: number
  /** cols*rows palette indices. */
  idx: Uint8Array
  /** cols*rows liveness flags; 1 = intact, 0 = destroyed. */
  alive: Uint8Array
  aliveCount: number
}

export interface FieldOptions {
  seed: number
  cols: number
  rows: number
  bands: number
  /** Cells per noise feature. Large = a few huge lazy bands; small = crenellated. */
  featureSize: number
  /** 0..1 weighting of the finer octaves. */
  roughness: number
}

export function cellAt(f: Field, col: number, row: number): number {
  return row * f.cols + col
}

const BINS = 4096
const OCTAVES = 3

/** Quantized by QUANTILE, not by equal width. Slicing the value range into equal
 *  slices leaves the extreme bands nearly empty on most seeds — the palette's
 *  first and last colours would barely appear, which would make "palette length
 *  is the band count" a lie. Cutting at equal *counts* guarantees every band is
 *  present and roughly equally massed. Done with a value histogram + cumulative
 *  scan so it stays O(n): at cell size 2 there are a quarter-million cells and
 *  sorting them would be the most expensive thing in setup. */
export function buildField(opts: FieldOptions): Field {
  const { seed, cols, rows, featureSize, roughness } = opts
  const bands = Math.max(1, opts.bands)
  const n = cols * rows
  const noise = makeNoise3D(seed)
  const raw = new Float32Array(n)

  const base = 1 / Math.max(1, featureSize)
  let min = Infinity
  let max = -Infinity
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let v = 0
      let amp = 1
      let freq = base
      for (let o = 0; o < OCTAVES; o++) {
        v += amp * noise(col * freq, row * freq, o * 17.3)
        freq *= 2
        amp *= roughness
      }
      raw[row * cols + col] = v
      if (v < min) min = v
      if (v > max) max = v
    }
  }

  const idx = new Uint8Array(n)
  if (bands > 1) {
    const span = max - min || 1
    const hist = new Uint32Array(BINS)
    const bin = new Uint16Array(n)
    for (let i = 0; i < n; i++) {
      const b = Math.min(BINS - 1, Math.floor(((raw[i] - min) / span) * BINS))
      bin[i] = b
      hist[b]++
    }
    // cut[k] = first bin belonging to band k+1.
    const cut = new Uint16Array(bands - 1)
    let cum = 0
    let k = 0
    for (let b = 0; b < BINS && k < bands - 1; b++) {
      cum += hist[b]
      // `>=` not `>`: the bin that reaches the target belongs to the upper band.
      // With `>` the boundary bin falls to the lower band on every cut, pushing
      // mass systematically downward.
      while (k < bands - 1 && cum >= ((k + 1) * n) / bands) {
        cut[k] = b + 1
        k++
      }
    }
    for (; k < bands - 1; k++) cut[k] = BINS
    for (let i = 0; i < n; i++) {
      const b = bin[i]
      let band = 0
      while (band < bands - 1 && b >= cut[band]) band++
      idx[i] = band
    }
  }

  return { cols, rows, bands, idx, alive: new Uint8Array(n).fill(1), aliveCount: n }
}

/** Wrap a ready-made index grid (an image quantization) as a fresh, fully-alive
 *  Field. The indices are COPIED: the quantizer caches its result so a re-peel can
 *  skip the work, and a Field mutates `alive` in place — aliasing would let one
 *  picture's erosion leak into the next peel of the same image. */
export function buildFieldFromIndices(
  idx: Uint8Array,
  cols: number,
  rows: number,
  bands: number,
  /** cols*rows flags from the quantizer; 0 = void. Omit for a fully opaque
   *  source, where every cell starts alive. */
  coverage?: Uint8Array,
): Field {
  const n = cols * rows
  if (!coverage) {
    return {
      cols,
      rows,
      bands: Math.max(1, bands),
      idx: idx.slice(0, n),
      alive: new Uint8Array(n).fill(1),
      aliveCount: n,
    }
  }
  // A void cell starts DEAD rather than holding a colour. Everything downstream
  // already reasons in terms of `alive` — `buildFront` walks each lane for the
  // outermost survivor, `crew` counts `bandAlive` over live cells only, and the
  // picture completes at `aliveCount === 0` — so a cell that was never alive
  // behaves exactly like one a turret already cleared. That is what makes a beam
  // cross the transparent surround of a sprite and strike the figure beyond it.
  const alive = new Uint8Array(n)
  let aliveCount = 0
  for (let i = 0; i < n; i++) {
    if (coverage[i]) { alive[i] = 1; aliveCount++ }
  }
  return { cols, rows, bands: Math.max(1, bands), idx: idx.slice(0, n), alive, aliveCount }
}
