// New lasers draw their colour from what is EXPOSED right now (spec §5), never
// from the whole picture — that is what makes deadlock structurally impossible.
// A strictly proportional draw starves minority colours (5% of twelve lasers is
// 0.6, i.e. usually absent), so weights are tempered by an exponent first.

/** Weights each band by count^k, renormalised so the weights sum to 1 (or to 0
 *  when nothing is exposed). Exported for tests and any future UI readout. */
export function temperedWeights(hist: Uint32Array, k: number): Float64Array {
  const w = new Float64Array(hist.length)
  let sum = 0
  for (let i = 0; i < hist.length; i++) {
    // NB Math.pow(0, 0) === 1 in JS — an extinct band must be excluded
    // explicitly, or k=0 mints lasers hunting colours that no longer exist.
    const v = hist[i] === 0 ? 0 : Math.pow(hist[i], k)
    w[i] = v
    sum += v
  }
  if (sum > 0) for (let i = 0; i < w.length; i++) w[i] /= sum
  return w
}

/** Weights each band by count^k, renormalises, and draws one. `k` is the
 *  targeting bias: 0 = flat over exposed bands, 1 = strictly proportional,
 *  >1 = piles onto the dominant band. Returns -1 if nothing is exposed. */
export function temperedPick(hist: Uint32Array, k: number, rand: () => number): number {
  const w = temperedWeights(hist, k)
  let sum = 0
  for (let i = 0; i < w.length; i++) sum += w[i]
  if (sum <= 0) return -1
  let r = rand() * sum
  for (let i = 0; i < w.length; i++) {
    r -= w[i]
    if (r < 0) return i
  }
  for (let i = w.length - 1; i >= 0; i--) if (w[i] > 0) return i // float slop
  return -1
}
