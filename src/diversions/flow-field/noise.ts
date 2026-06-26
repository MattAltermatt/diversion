// Small deterministic value-noise with bilinear interpolation. Good enough for a flow field.
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const smooth = (x: number) => x * x * (3 - 2 * x)

export function makeNoise2D(seed: number): (x: number, y: number) => number {
  // hashed gradient grid → value in [-1, 1]
  const rand = mulberry32(seed)
  const SIZE = 256
  const grid = new Float32Array(SIZE * SIZE)
  for (let i = 0; i < grid.length; i++) grid[i] = rand() * 2 - 1
  const at = (xi: number, yi: number) => grid[((yi & (SIZE - 1)) * SIZE) + (xi & (SIZE - 1))]

  return (x: number, y: number) => {
    const x0 = Math.floor(x), y0 = Math.floor(y)
    const fx = smooth(x - x0), fy = smooth(y - y0)
    const v00 = at(x0, y0), v10 = at(x0 + 1, y0)
    const v01 = at(x0, y0 + 1), v11 = at(x0 + 1, y0 + 1)
    const a = v00 + fx * (v10 - v00)
    const b = v01 + fx * (v11 - v01)
    return a + fy * (b - a)
  }
}
