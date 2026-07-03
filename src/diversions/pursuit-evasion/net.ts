// net.ts — a tiny fixed-topology multilayer perceptron (one hidden layer, tanh)
// plus the genetic operators that evolve its weights. Pure and framework-agnostic;
// deterministic given a seeded rng. Every brain in a population shares the same
// (nIn, nHid, nOut) shape, so the dims live in the population, not the brain — a
// brain is just its four weight/bias arrays. This is the substrate for the
// neuroevolution diversions (pursuit-evasion, and later foragers/camouflage).

export interface Brain {
  w1: Float32Array // nHid × nIn
  b1: Float32Array // nHid
  w2: Float32Array // nOut × nHid
  b2: Float32Array // nOut
}

export interface NetDims { nIn: number; nHid: number; nOut: number }

export function randomBrain(d: NetDims, rng: () => number): Brain {
  const rnd = () => rng() * 2 - 1
  const fill = (a: Float32Array) => { for (let i = 0; i < a.length; i++) a[i] = rnd(); return a }
  return {
    w1: fill(new Float32Array(d.nHid * d.nIn)),
    b1: fill(new Float32Array(d.nHid)),
    w2: fill(new Float32Array(d.nOut * d.nHid)),
    b2: fill(new Float32Array(d.nOut)),
  }
}

/** Forward pass. `hid`/`out` are caller-owned scratch buffers (nHid / nOut) so the
 *  hot loop allocates nothing. Hidden + output both use tanh. */
export function forward(b: Brain, d: NetDims, inp: Float32Array, hid: Float32Array, out: Float32Array): void {
  const { nIn, nHid, nOut } = d
  for (let j = 0; j < nHid; j++) {
    let s = b.b1[j]
    const base = j * nIn
    for (let i = 0; i < nIn; i++) s += b.w1[base + i] * inp[i]
    hid[j] = Math.tanh(s)
  }
  for (let k = 0; k < nOut; k++) {
    let s = b.b2[k]
    const base = k * nHid
    for (let j = 0; j < nHid; j++) s += b.w2[base + j] * hid[j]
    out[k] = Math.tanh(s)
  }
}

/** Uniform per-weight crossover — one rng draw per weight. */
export function crossover(a: Brain, b: Brain, rng: () => number): Brain {
  const mix = (x: Float32Array, y: Float32Array) => {
    const o = new Float32Array(x.length)
    for (let i = 0; i < x.length; i++) o[i] = rng() < 0.5 ? x[i] : y[i]
    return o
  }
  return { w1: mix(a.w1, b.w1), b1: mix(a.b1, b.b1), w2: mix(a.w2, b.w2), b2: mix(a.b2, b.b2) }
}

/** Per-weight gaussian-ish jitter (uniform noise) with probability `rate`. Weights
 *  are unbounded (tanh squashes activations), so no clamp is needed. */
export function mutate(a: Brain, rate: number, scale: number, rng: () => number): Brain {
  const jit = (x: Float32Array) => {
    const o = new Float32Array(x.length)
    for (let i = 0; i < x.length; i++) o[i] = rng() < rate ? x[i] + (rng() * 2 - 1) * scale : x[i]
    return o
  }
  return { w1: jit(a.w1), b1: jit(a.b1), w2: jit(a.w2), b2: jit(a.b2) }
}

export function cloneBrain(a: Brain): Brain {
  return { w1: a.w1.slice(), b1: a.b1.slice(), w2: a.w2.slice(), b2: a.b2.slice() }
}
