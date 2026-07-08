import { describe, it, expect } from 'vitest'
import { makeTurtle, stepTurtle, type StepCfg } from './turtle'

describe('turtle step — geometry', () => {
  it('advances stepSize along the current heading when turning is off', () => {
    const t = makeTurtle()
    t.heading = 0
    const cfg: StepCfg = { stepSize: 5, turnJitter: 0, turnClamp: 1 }
    const seg = stepTurtle(t, cfg, () => 0.5) // rng irrelevant: turnJitter is 0
    expect(seg.x0).toBe(0)
    expect(seg.y0).toBe(0)
    expect(seg.x1).toBeCloseTo(5, 10) // cos(0) = 1
    expect(seg.y1).toBeCloseTo(0, 10) // sin(0) = 0
    expect(t.x).toBeCloseTo(5, 10)
    expect(t.y).toBeCloseTo(0, 10)
    expect(t.heading).toBe(0) // no turn applied
  })

  it('lands at the expected point for an arbitrary heading', () => {
    const t = makeTurtle()
    t.x = 10
    t.y = -3
    t.heading = Math.PI / 4 // 45°
    const cfg: StepCfg = { stepSize: 4, turnJitter: 0, turnClamp: 1 }
    const seg = stepTurtle(t, cfg, () => 0.5)
    const expectedX = 10 + 4 * Math.cos(Math.PI / 4)
    const expectedY = -3 + 4 * Math.sin(Math.PI / 4)
    expect(seg.x1).toBeCloseTo(expectedX, 10)
    expect(seg.y1).toBeCloseTo(expectedY, 10)
  })

  it('a nonzero turn velocity updates heading before the step is taken', () => {
    const t = makeTurtle()
    t.heading = 0
    t.turnVel = Math.PI / 2 // preset a 90° turn rate; jitter off so it holds constant
    const cfg: StepCfg = { stepSize: 2, turnJitter: 0, turnClamp: 10 }
    const seg = stepTurtle(t, cfg, () => 0.5)
    expect(t.heading).toBeCloseTo(Math.PI / 2, 10) // heading += turnVel
    expect(seg.x1).toBeCloseTo(0, 10) // cos(90°) ≈ 0
    expect(seg.y1).toBeCloseTo(2, 10) // sin(90°) = 1, stepSize 2
    // a second step at the same (unchanged, jitter-off) turnVel keeps turning
    stepTurtle(t, cfg, () => 0.5)
    expect(t.heading).toBeCloseTo(Math.PI, 10)
  })

  it('turnVel drifts by a random amount within ±turnJitter each step', () => {
    const t = makeTurtle()
    const cfg: StepCfg = { stepSize: 1, turnJitter: 0.1, turnClamp: 10 }
    stepTurtle(t, cfg, () => 1) // rng=1 -> delta = (1*2-1)*0.1 = +0.1
    expect(t.turnVel).toBeCloseTo(0.1, 10)
    stepTurtle(t, cfg, () => 0) // rng=0 -> delta = (0*2-1)*0.1 = -0.1
    expect(t.turnVel).toBeCloseTo(0, 10)
  })

  it('clamps |turnVel| to turnClamp', () => {
    const t = makeTurtle()
    const cfg: StepCfg = { stepSize: 1, turnJitter: 1, turnClamp: 0.3 }
    stepTurtle(t, cfg, () => 1) // would push turnVel to +1 without the clamp
    expect(t.turnVel).toBeCloseTo(0.3, 10)
    for (let i = 0; i < 5; i++) stepTurtle(t, cfg, () => 0) // push hard toward -1
    expect(t.turnVel).toBeCloseTo(-0.3, 10)
  })

  it('accumulates pathDist by stepSize each call', () => {
    const t = makeTurtle()
    const cfg: StepCfg = { stepSize: 3, turnJitter: 0, turnClamp: 1 }
    stepTurtle(t, cfg, () => 0.5)
    stepTurtle(t, cfg, () => 0.5)
    expect(t.pathDist).toBeCloseTo(6, 10)
  })
})
