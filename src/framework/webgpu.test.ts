import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getSharedDevice, isWebGPUSupported, __resetSharedDeviceForTests } from './webgpu'

// A controllable mock of navigator.gpu: each case wires requestAdapter / requestDevice
// behavior and can resolve a device's `lost` promise on demand.
type MockDevice = { lost: Promise<unknown>; loseNow: () => void }

function makeDevice(): MockDevice {
  let resolveLost!: (v: unknown) => void
  const lost = new Promise((res) => { resolveLost = res })
  return { lost, loseNow: () => resolveLost({ reason: 'destroyed' }) }
}

let requestAdapter: ReturnType<typeof vi.fn>
let requestDevice: ReturnType<typeof vi.fn>
const origGpu = (navigator as { gpu?: unknown }).gpu

function installGpu(present = true): void {
  Object.defineProperty(navigator, 'gpu', {
    configurable: true,
    value: present ? { requestAdapter } : undefined,
  })
}

beforeEach(() => {
  __resetSharedDeviceForTests()
  requestDevice = vi.fn(async () => makeDevice())
  requestAdapter = vi.fn(async () => ({ requestDevice }))
  installGpu(true)
})

afterEach(() => {
  Object.defineProperty(navigator, 'gpu', { configurable: true, value: origGpu })
  __resetSharedDeviceForTests()
})

describe('isWebGPUSupported', () => {
  it('reflects navigator.gpu presence', () => {
    expect(isWebGPUSupported()).toBe(true)
    installGpu(false)
    expect(isWebGPUSupported()).toBe(false)
  })
})

describe('getSharedDevice — memoization', () => {
  it('returns the SAME device across calls and acquires the adapter only once', async () => {
    const a = await getSharedDevice()
    const b = await getSharedDevice()
    expect(a).toBe(b)
    expect(requestAdapter).toHaveBeenCalledTimes(1)
  })
})

describe('getSharedDevice — reject-then-retry (regression #265)', () => {
  it('does NOT cache a rejection: a later call re-attempts and can succeed', async () => {
    // First attempt: requestDevice rejects (GPU-process hiccup / adapter-lost race).
    requestDevice.mockRejectedValueOnce(new Error('device request failed'))
    await expect(getSharedDevice()).rejects.toThrow('device request failed')
    // The poisoned promise must be cleared → the next call retries instead of
    // handing back the cached rejection forever (the bug: a dark canvas until reload).
    const dev = await getSharedDevice()
    expect(dev).toBeTruthy()
    expect(requestAdapter).toHaveBeenCalledTimes(2)
  })

  it('does NOT cache a null-adapter rejection either', async () => {
    requestAdapter.mockResolvedValueOnce(null)
    await expect(getSharedDevice()).rejects.toThrow(/no GPU adapter/)
    await expect(getSharedDevice()).resolves.toBeTruthy()
    expect(requestAdapter).toHaveBeenCalledTimes(2)
  })

  it('rejects (and stays retryable) when WebGPU is unsupported', async () => {
    installGpu(false)
    await expect(getSharedDevice()).rejects.toThrow(/not supported/)
    installGpu(true)
    await expect(getSharedDevice()).resolves.toBeTruthy()
  })
})

describe('getSharedDevice — device loss clears the cache (identity-guarded)', () => {
  it('a lost device drops the cache so the next call requests a fresh one', async () => {
    const first = makeDevice()
    requestDevice.mockResolvedValueOnce(first)
    const a = await getSharedDevice()
    expect(a).toBe(first)
    first.loseNow()
    await Promise.resolve() // let the device.lost .then microtask run
    await new Promise((r) => setTimeout(r, 0))
    const b = await getSharedDevice()
    expect(b).not.toBe(first)
    expect(requestAdapter).toHaveBeenCalledTimes(2)
  })

  it('a stale loss does not clobber a device acquired via forceNew (identity guard)', async () => {
    const first = makeDevice()
    const second = makeDevice()
    requestDevice.mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    await getSharedDevice()
    const b = await getSharedDevice({ forceNew: true }) // discard first, get second
    expect(b).toBe(second)
    first.loseNow() // the OLD device's loss must NOT clear the newer cached one
    await new Promise((r) => setTimeout(r, 0))
    const c = await getSharedDevice()
    expect(c).toBe(second) // still the forceNew device — not re-requested
  })
})

describe('getSharedDevice — forceNew', () => {
  it('discards the cache and acquires a brand-new device', async () => {
    const a = await getSharedDevice()
    const b = await getSharedDevice({ forceNew: true })
    expect(a).not.toBe(b)
    expect(requestAdapter).toHaveBeenCalledTimes(2)
  })
})
