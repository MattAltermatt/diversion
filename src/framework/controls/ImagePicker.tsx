import { useState, useSyncExternalStore } from 'react'
import type { FieldMeta } from '../fieldMeta'
import { putImage, clearImage, getImage, currentImage, decodeToPixels, subscribe, storeVersion } from '../imageStore'

// The first file input in the codebase. It stores PIXELS in the module-level
// image store and hands the field an ID, so the config stays small enough to
// diff on every slider drag and to hand to the URL codec.
export function ImagePicker({
  value,
  onChange,
  meta,
}: {
  value: string | undefined
  onChange: (v: string | undefined) => void
  meta: FieldMeta
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Re-render when the slot changes. A REHYDRATE after a reload resolves its
  // decode asynchronously, well after this form has mounted — without a
  // subscription the picker would render "none" once and never learn otherwise.
  useSyncExternalStore(subscribe, storeVersion, storeVersion)
  // Fall back to whatever the store holds: the id in `value` cannot survive a
  // reload (the field is `local`, so it never enters the URL), while the pixels
  // can. One slot, so a stored image IS this field's image.
  const held = getImage(value) ?? currentImage()

  const pick = (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError(null)
    const reader = new FileReader()
    reader.onerror = () => { setBusy(false); setError('Could not read that file.') }
    reader.onload = () => {
      decodeToPixels(String(reader.result))
        .then((img) => { putImage(img); onChange(img.id) })
        .catch(() => setError('Could not decode that image.'))
        .finally(() => setBusy(false))
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="ctl">
      <div className="ctl-top">
        <span className="ctl-name">{meta.label}</span>
        <span className="ctl-val">{busy ? 'reading…' : held ? `${held.width}×${held.height}` : 'none'}</span>
      </div>
      {held && <img className="ctl-thumb" src={held.dataUrl} alt="selected image" />}
      {/* Reset the input after every pick. Without it the element keeps the last
          File, so choosing the SAME file again fires no change event — and after
          a Clear that means the image you just removed cannot be put back
          without picking some other file first. */}
      <input
        type="file"
        accept="image/*"
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }}
      />
      {/* Gated on `held`, not on `value`: after a reload an image is on screen
          with no id in the config, and it still has to be clearable. Clearing
          bumps the store's version, which is what makes the canvas drop back to
          contours even when the config itself does not change. */}
      {held && (
        <button type="button" onClick={() => { clearImage(); onChange(undefined) }}>
          Clear image
        </button>
      )}
      {error && <div className="ctl-help">{error}</div>}
      {meta.help && <div className="ctl-help">{meta.help}</div>}
    </div>
  )
}
