// panic.ts — civilian fear contagion (#237). A civilian that senses a zombie takes a
// DIRECT fright (louder the closer the zombie); that fear then RIPPLES to nearby
// civilians over successive steps and decays when nothing is scaring it. sim.ts reads
// the fear field to amplify the civilian flee force → an emergent stampede that surges
// hardest through the densest part of the crowd, and civilians who never saw the zombie
// still bolt because the panic reached them. No deliberate clustering — they just flee
// harder, together.
//
// The spread is a one-step diffusion that reads a SNAPSHOT of last step's fear
// (`fearPrev`), so it is order-independent and deterministic regardless of agent index
// order. The snapshot buffer + `screamSrc` are allocated once in createSim (zero
// per-step allocation).
import { DT, CIVILIAN, type Ecosystem } from './sim'

export const SCREAM_THRESH = 0.12 // fear below this is calm — no ripple, no flee boost
const FEAR_DECAY = 1.1 // fear units shed per second when no threat / scream is near
const CONTAGION = 0.85 // fraction of a neighbour's fear caught at zero distance (linear falloff to the radius edge)

/** Advance the fear field one sim-step. Assumes the spatial hash is rebuilt on the
 *  current positions. `screamSrc[i]` is the direct fright (0..1) the steering loop
 *  recorded for civilian i this step from seeing a zombie; it is consumed here. */
export function panicStep(e: Ecosystem, radius: number): void {
  const { fear, fearPrev, screamSrc, faction, alive, px, py, hash, neigh } = e
  const n = e.n
  // Freeze last step's fear so contagion can't feed back on itself within one pass.
  fearPrev.set(fear)
  const r2 = radius * radius
  let anyFear = false // any civilian still afraid at the end → keep the field live next step
  for (let i = 0; i < n; i++) {
    if (!alive[i] || faction[i] !== CIVILIAN) { fear[i] = 0; screamSrc[i] = 0; continue }
    // 1) decay toward calm
    let f = fearPrev[i] - FEAR_DECAY * DT
    if (f < 0) f = 0
    // 2) direct sighting spike (a scream) — instantaneous, dominates decay
    const direct = screamSrc[i]
    if (direct > f) f = direct
    // 3) contagion: catch fear from the most-afraid civilian neighbour within radius
    neigh.length = 0
    hash.neighborsWithin(px, py, i, radius, 24, neigh, faction, CIVILIAN)
    let caught = 0
    for (const j of neigh) {
      const src = fearPrev[j]
      if (src * CONTAGION <= caught || src <= f) continue // can't beat the best so far
      const dx = px[j] - px[i], dy = py[j] - py[i]
      const d2 = dx * dx + dy * dy
      if (d2 > r2) continue
      const c = src * CONTAGION * (1 - Math.sqrt(d2) / radius)
      if (c > caught) caught = c
    }
    if (caught > f) f = caught
    fear[i] = f
    if (f > 0) anyFear = true
    screamSrc[i] = 0 // consumed
  }
  e.anyFear = anyFear
}
