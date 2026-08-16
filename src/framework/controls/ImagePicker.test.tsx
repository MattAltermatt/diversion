import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ImagePicker } from './ImagePicker'
import { putImage, clearImage } from '../imageStore'

const meta = { ui: 'image' as const, label: 'Image', help: 'Pick a picture.' }

describe('ImagePicker (#278)', () => {
  beforeEach(() => { clearImage() })

  it('renders the label and help', () => {
    render(<ImagePicker value={undefined} onChange={vi.fn()} meta={meta} />)
    expect(screen.getByText('Image')).toBeTruthy()
    expect(screen.getByText('Pick a picture.')).toBeTruthy()
  })

  it('says so when nothing is picked', () => {
    render(<ImagePicker value={undefined} onChange={vi.fn()} meta={meta} />)
    expect(screen.getByText('none')).toBeTruthy()
  })

  it('shows a thumbnail once the store holds the id', () => {
    putImage({ id: 'a', dataUrl: 'data:image/png;base64,AA', width: 2, height: 1,
               pixels: new Uint8ClampedArray(8) })
    render(<ImagePicker value="a" onChange={vi.fn()} meta={meta} />)
    expect(screen.getByAltText('selected image').getAttribute('src'))
      .toBe('data:image/png;base64,AA')
  })

  it('clear calls onChange(undefined) and empties the store', () => {
    putImage({ id: 'a', dataUrl: 'data:image/png;base64,AA', width: 2, height: 1,
               pixels: new Uint8ClampedArray(8) })
    const onChange = vi.fn()
    render(<ImagePicker value="a" onChange={onChange} meta={meta} />)
    fireEvent.click(screen.getByRole('button', { name: /clear/i }))
    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('offers no clear button when nothing is picked', () => {
    render(<ImagePicker value={undefined} onChange={vi.fn()} meta={meta} />)
    expect(screen.queryByRole('button', { name: /clear/i })).toBeNull()
  })
})

describe('ImagePicker after a reload (#278)', () => {
  beforeEach(() => { clearImage() })

  const stored = (id: string) => putImage({
    id, dataUrl: 'data:image/png;base64,BB', width: 8, height: 4,
    pixels: new Uint8ClampedArray(8 * 4 * 4),
  })

  it('shows the stored image even though the config lost its id', () => {
    // The id is `local`, so it never rides the URL — after a reload the field is
    // undefined while the pixels are still in the store.
    stored('img_restored')
    render(<ImagePicker value={undefined} onChange={vi.fn()} meta={meta} />)
    expect(screen.getByAltText('selected image').getAttribute('src'))
      .toBe('data:image/png;base64,BB')
    expect(screen.getByText('8×4')).toBeTruthy()
  })

  it('offers Clear for a stored image with no id in the config', () => {
    stored('img_restored')
    const onChange = vi.fn()
    render(<ImagePicker value={undefined} onChange={onChange} meta={meta} />)
    fireEvent.click(screen.getByRole('button', { name: /clear/i }))
    expect(onChange).toHaveBeenCalledWith(undefined)
    expect(screen.queryByAltText('selected image')).toBeNull()
  })

  it('still says none when the store is genuinely empty', () => {
    render(<ImagePicker value={undefined} onChange={vi.fn()} meta={meta} />)
    expect(screen.getByText('none')).toBeTruthy()
  })

  it('re-renders when a rehydrate lands after mount', () => {
    render(<ImagePicker value={undefined} onChange={vi.fn()} meta={meta} />)
    expect(screen.getByText('none')).toBeTruthy()
    act(() => { stored('img_late') })
    expect(screen.getByAltText('selected image')).toBeTruthy()
  })
})
