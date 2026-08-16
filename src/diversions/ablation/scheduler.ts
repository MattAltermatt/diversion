// New turrets draw their colour from what is EXPOSED right now (spec §5), never
// from the whole picture — that is what makes deadlock structurally impossible.
// A strictly proportional draw starves minority colours (5% of twelve turrets is
// 0.6, i.e. usually absent), so weights are tempered by an exponent first.

/** Weights each band by count^k, renormalised so the weights sum to 1 (or to 0
 *  when nothing is exposed). Exported for tests and any future UI readout. */
export function temperedWeights(hist: Uint32Array, k: number): Float64Array {
  const w = new Float64Array(hist.length)
  let sum = 0
  for (let i = 0; i < hist.length; i++) {
    // NB Math.pow(0, 0) === 1 in JS — an extinct band must be excluded
    // explicitly, or k=0 mints turrets hunting colours that no longer exist.
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

/** The fleet size actually used: everything on the track plus everything in the
 *  queue, floored at `minTotal`.
 *
 *  Those two counts are the controls because they are the two a viewer can COUNT on
 *  screen — turrets riding the track, dots waiting at the gate. The total is the
 *  derived one, and asking for it directly meant reading the queue as a subtraction.
 *
 *  In Mixed, `minTotal` is the number of bands, and the floor is a correctness
 *  requirement rather than balance: nothing but a turret tuned to band `b` ever
 *  destroys a cell of band `b`, so a band that draws zero turrets survives forever,
 *  the picture never reaches zero cells, and the piece hangs permanently — no new
 *  picture, no quiet beat, just a frozen remnant and a track going round. Unison
 *  mints its whole crew onto one lock band and re-picks that band from whatever is
 *  exposed, so it cannot leave a colour uncovered and passes a `minTotal` of 1.
 *
 *  The floor cannot live on either slider's `min`: it depends on `palette.length` and
 *  on `targeting`, both different fields, so it is resolved where all three are
 *  visible. The surplus lands in the QUEUE, never on the track — "Turrets on track"
 *  is the number the viewer counts against the track, so it is never silently
 *  raised out from under them. */
export function resolveFleet(capacity: number, queued: number, minTotal: number): number {
  return Math.max(capacity + queued, minTotal)
}

/** Distributes `fleetSize` turrets across bands in proportion to `total[band]^k`,
 *  by LARGEST REMAINDER so the counts sum exactly. Every band holding at least one
 *  cell is reserved a turret first (see `resolveFleet`); the rest is shared out.
 *
 *  `k` is the same Targeting bias the Unison lock draw uses: 0 gives every band an
 *  equal crew regardless of mass, 1 is strictly proportional (50% of the map blue
 *  means 50% of the turrets blue), above 1 piles onto the biggest band. */
export function allocateFleet(total: Uint32Array, k: number, fleetSize: number): Uint32Array {
  const n = total.length
  const out = new Uint32Array(n)
  const live: number[] = []
  for (let i = 0; i < n; i++) if (total[i] > 0) live.push(i)
  if (live.length === 0 || fleetSize <= 0) return out

  // Too small to cover one each: hand them to the biggest bands. `resolveFleet`
  // makes this unreachable from the running piece, but a direct caller must not get
  // back a silently over-allocated fleet.
  if (fleetSize <= live.length) {
    const byMass = [...live].sort((a, b) => total[b] - total[a] || a - b)
    for (let i = 0; i < fleetSize; i++) out[byMass[i]] = 1
    return out
  }

  for (const i of live) out[i] = 1
  const rest = fleetSize - live.length
  const w = temperedWeights(total, k)
  let wsum = 0
  for (const i of live) wsum += w[i]

  const rem: { band: number; frac: number }[] = []
  for (const i of live) {
    const share = wsum > 0 ? (w[i] / wsum) * rest : rest / live.length
    const whole = Math.floor(share)
    out[i] += whole
    rem.push({ band: i, frac: share - whole })
  }
  let placed = 0
  for (const i of live) placed += out[i]
  // Largest remainder wins the leftovers; ties break toward the earlier band so the
  // result is deterministic and testable.
  rem.sort((a, b) => b.frac - a.frac || a.band - b.band)
  for (let i = 0, left = fleetSize - placed; left > 0; i = (i + 1) % rem.length, left--) {
    out[rem[i].band]++
  }
  return out
}
