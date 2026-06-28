import { describe, it, expect, expectTypeOf } from 'vitest'
import { z } from 'zod'
import { defineDiversion, type Diversion, type CtxFor } from './types'

// These assertions are compile-time: if the generic stops threading State or the
// per-kind context, tsc (and this test) fail. Guards #10 against regressing to
// the `state as FlowState` / `ctx as CanvasRenderingContext2D` cast era.
describe('Diversion contract types', () => {
  it('threads State and the per-kind context into every hook (no casts)', () => {
    type Cfg = { v: number }
    type St = { tag: 'flow'; n: number }

    const d: Diversion<Cfg, St, '2d'> = {
      id: 'x',
      title: 'X',
      description: '',
      kind: '2d',
      schema: z.object({ v: z.number().default(0) }),
      setup: (ctx, config, size) => {
        expectTypeOf(ctx).toEqualTypeOf<CanvasRenderingContext2D>()
        expectTypeOf(config).toEqualTypeOf<Cfg>()
        return { tag: 'flow', n: size.width }
      },
      frame: (state, ctx) => {
        expectTypeOf(state).toEqualTypeOf<St>()
        expectTypeOf(ctx).toEqualTypeOf<CanvasRenderingContext2D>()
      },
      update: (state, config) => {
        expectTypeOf(state).toEqualTypeOf<St>()
        expectTypeOf(config).toEqualTypeOf<Cfg>()
        return true
      },
    }

    expectTypeOf(d.kind).toEqualTypeOf<'2d'>()
  })

  it('maps kind to the concrete context type', () => {
    expectTypeOf<CtxFor<'2d'>>().toEqualTypeOf<CanvasRenderingContext2D>()
    expectTypeOf<CtxFor<'webgl'>>().toEqualTypeOf<WebGL2RenderingContext>()
  })
})

describe('defineDiversion', () => {
  const schema = z.object({
    speed: z.number().default(1).meta({ ui: 'number', label: 'Speed' }),
    label: z.string().default('hi').meta({ ui: 'color', label: 'Label' }),
  })

  it('forces Config to be z.infer<typeof schema> in every hook', () => {
    defineDiversion<typeof schema, { n: number }, '2d'>({
      id: 'x',
      title: 'X',
      description: '',
      kind: '2d',
      schema,
      setup: (ctx, config, size) => {
        // The compiler ties config to the schema's inferred output — the whole
        // point of the factory. If they ever diverge, this stops compiling.
        expectTypeOf(config).toEqualTypeOf<z.infer<typeof schema>>()
        expectTypeOf(ctx).toEqualTypeOf<CanvasRenderingContext2D>()
        return { n: config.speed + size.width }
      },
      frame: (state) => {
        expectTypeOf(state).toEqualTypeOf<{ n: number }>()
      },
    })
  })

  it('returns its argument unchanged (identity at runtime)', () => {
    const div = defineDiversion<typeof schema, null, '2d'>({
      id: 'ident',
      title: 'Ident',
      description: '',
      kind: '2d',
      schema,
      setup: () => null,
      frame: () => {},
    })
    expect(div.id).toBe('ident')
    expect(div.schema).toBe(schema)
  })
})
