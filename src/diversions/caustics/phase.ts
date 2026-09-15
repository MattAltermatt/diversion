import { NT, type Spectrum } from './spectrum'

const TAU = Math.PI * 2

/** Fill each train's per-frame time terms.
 *
 *  travelling:  h = a*sin(k.p + phi - wt)     -> offset = -wt (wrapped), weight = 1
 *  standing:    h = a*sin(k.p + phi)*cos(wt)  -> offset = 0,              weight = cos(wt)
 *
 *  Both collapse to the SAME one-trig form in the shader,
 *  `grad += a*k*cos(k.p + phi + offset) * weight`, because a standing wave's time
 *  factor is uniform over the surface. Standing therefore costs nothing extra --
 *  which is what makes a pool (a closed basin, whose long modes are seiches with
 *  nodes that stay put) as cheap to render as open water.
 *
 *  The offset is wrapped: an unbounded accumulated phase loses float32 precision
 *  over a multi-hour unattended run, and the motion would quantize. */
export function writePhase(spec: Spectrum, t: number): void {
  for (let i = 0; i < NT; i++) {
    const wt = spec.omega[i] * t
    if (spec.standing[i]) {
      spec.trainsB[i * 4 + 2] = 0
      spec.trainsB[i * 4 + 3] = Math.cos(wt % TAU)
    } else {
      spec.trainsB[i * 4 + 2] = -(wt % TAU)
      spec.trainsB[i * 4 + 3] = 1
    }
  }
}
