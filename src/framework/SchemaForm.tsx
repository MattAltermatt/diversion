import { Fragment, type ComponentType, type ReactNode } from 'react'
import type { ZodObject, ZodType } from 'zod'
import { fields, type FieldMeta } from './fieldMeta'
import { Slider } from './controls/Slider'
import { NumberInput } from './controls/NumberInput'
import { Segmented } from './controls/Segmented'
import { Select } from './controls/Select'
import { Toggle } from './controls/Toggle'
import { Swatch } from './controls/Swatch'
import { ColorList } from './controls/ColorList'
import { Group } from './controls/Group'
import { Subpanel } from './controls/Subpanel'
import { MatrixEditor } from './controls/MatrixEditor'

type AnyObj = Record<string, any>

/** Drill through wrappers (.default()/.optional()/etc.) to the underlying ZodObject. */
function asObject(field: ZodType): ZodObject<any> {
  let cur = field as { shape?: unknown; unwrap?: () => ZodType }
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
    case 'select':
      return Select as ControlComponent
    case 'toggle':
      return Toggle as ControlComponent
    case 'color':
      return Swatch as ControlComponent
    case 'colorList':
      return ColorList as ControlComponent
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
  // Render one field to an element (or null when hidden by showWhen). A field
  // with showWhen renders only when its sibling holds the named value (e.g.
  // gradient controls appear only in gradient mode); the data stays discoverable
  // — switch the controlling field and it returns.
  const renderField = ([key, field, meta]: [string, ZodType, FieldMeta]): ReactNode => {
    if (meta.showWhen) {
      const cur = value[meta.showWhen.field]
      const eq = meta.showWhen.equals
      const shown = Array.isArray(eq) ? eq.includes(cur) : cur === eq
      if (!shown) return null
    }
    if (meta.ui === 'hidden') return null // schema-only field (URL-encoded), no control
    if (meta.ui === 'matrix') {
      // Config-aware control: unlike normal controls (which get only their own
      // field value) it reads sibling fields (colors/palette/symmetry) and writes
      // the whole config back.
      return <MatrixEditor key={key} meta={meta} config={value} onConfigChange={onChange} />
    }
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
  }

  // Bucket fields by their `section` (first-appearance order; fields keep their
  // schema order within a section). Untagged fields share the `undefined` bucket
  // and render loose — so a schema with no sections looks exactly as before.
  const order: Array<string | undefined> = []
  const buckets = new Map<string | undefined, Array<[string, ZodType, FieldMeta]>>()
  for (const entry of fields(schema)) {
    const sec = entry[2].section
    if (!buckets.has(sec)) { buckets.set(sec, []); order.push(sec) }
    buckets.get(sec)!.push(entry)
  }

  return (
    <div className="schema-form">
      {order.map((sec) => {
        const rendered = buckets.get(sec)!.map(renderField)
        if (rendered.every((el) => el === null)) return null // all hidden → drop the section
        if (!sec) return <Fragment key="__loose">{rendered}</Fragment>
        return (
          <Subpanel key={sec} label={sec}>
            {rendered}
          </Subpanel>
        )
      })}
    </div>
  )
}
