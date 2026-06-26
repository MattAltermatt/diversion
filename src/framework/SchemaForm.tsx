import type { ComponentType } from 'react'
import type { ZodObject, ZodTypeAny } from 'zod'
import { fields, type FieldMeta } from './fieldMeta'
import { Slider } from './controls/Slider'
import { NumberInput } from './controls/NumberInput'
import { Segmented } from './controls/Segmented'
import { Toggle } from './controls/Toggle'
import { Swatch } from './controls/Swatch'
import { Group } from './controls/Group'

type AnyObj = Record<string, any>

/** Drill through wrappers (.default()/.optional()/etc.) to the underlying ZodObject. */
function asObject(field: ZodTypeAny): ZodObject<any> {
  let cur = field as { shape?: unknown; unwrap?: () => ZodTypeAny }
  while (!cur.shape && typeof cur.unwrap === 'function') {
    cur = cur.unwrap() as typeof cur
  }
  return cur as unknown as ZodObject<any>
}

type ControlComponent = ComponentType<{
  value: any
  onChange: (v: any) => void
  meta: FieldMeta
}>

function controlFor(ui: FieldMeta['ui']): ControlComponent | null {
  switch (ui) {
    case 'slider':
      return Slider as ControlComponent
    case 'number':
      return NumberInput as ControlComponent
    case 'segmented':
      return Segmented as ControlComponent
    case 'toggle':
      return Toggle as ControlComponent
    case 'color':
      return Swatch as ControlComponent
    default:
      return null
  }
}

export function SchemaForm({
  schema,
  value,
  onChange,
}: {
  schema: ZodObject<any>
  value: AnyObj
  onChange: (next: AnyObj) => void
}) {
  return (
    <div className="schema-form">
      {fields(schema).map(([key, field, meta]) => {
        if (meta.ui === 'group') {
          return (
            <Group key={key} label={meta.label}>
              <SchemaForm
                schema={asObject(field)}
                value={value[key]}
                onChange={(sub) => onChange({ ...value, [key]: sub })}
              />
            </Group>
          )
        }
        const Control = controlFor(meta.ui)
        if (!Control) throw new Error(`SchemaForm: unknown control ui "${meta.ui}" for field "${key}"`)
        return (
          <Control
            key={key}
            meta={meta}
            value={value[key]}
            onChange={(v: any) => onChange({ ...value, [key]: v })}
          />
        )
      })}
    </div>
  )
}
