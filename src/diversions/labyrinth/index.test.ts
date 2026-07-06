import { describe, it, expect } from 'vitest'
import labyrinth from './index'
import { encodeConfig, decodeConfig } from '../../framework/urlCodec'
import { labyrinthSchema } from './schema'

describe('labyrinth diversion', () => {
  it('declares the webgl contract + two preset axes', () => {
    expect(labyrinth.id).toBe('labyrinth')
    expect(labyrinth.kind).toBe('webgl')
    expect(typeof labyrinth.setup).toBe('function')
    expect(typeof labyrinth.frame).toBe('function')
    expect(labyrinth.presets?.map((g) => g.label)).toEqual(['Density', 'Behavior', 'Palette'])
  })

  it('config survives a URL encode→decode round-trip', () => {
    const cfg = labyrinthSchema.parse({})
    const params = encodeConfig(labyrinthSchema, cfg)
    const back = decodeConfig(labyrinthSchema, params)
    expect(back).toEqual(cfg)
  })

  it('update() reseeds on structural change, live-applies otherwise', () => {
    const cfg = labyrinthSchema.parse({})
    const state = { gl: {} as any, res: null as any, cfg } as any
    // structural → false (caller will teardown+setup)
    expect(labyrinth.update?.(state, { ...cfg, seed: cfg.seed + 1 }, { width: 8, height: 8 })).toBe(false)
    expect(labyrinth.update?.(state, { ...cfg, mazeSize: cfg.mazeSize + 1 }, { width: 8, height: 8 })).toBe(false)
    expect(labyrinth.update?.(state, { ...cfg, agents: cfg.agents + 20000 }, { width: 8, height: 8 })).toBe(false)
    // live param → true
    expect(labyrinth.update?.(state, { ...cfg, sensorAngle: 30 }, { width: 8, height: 8 })).toBe(true)
  })
})
