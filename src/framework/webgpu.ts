// webgpu.ts — shared WebGPU device management for kind:'webgpu' diversions.
//
// A GPUDevice is PAGE-LEVEL infrastructure, not diversion-level: one device
// serves every webgpu canvas (some implementations cap concurrent devices, and
// creation is comparatively expensive). So every webgpu diversion configures its
// own GPUCanvasContext against this ONE shared, cached device — never one device
// per canvas/tile. The device is acquired lazily on first use and memoized.
//
// Unlike WebGL's context-loss/restore event pair, WebGPU signals loss via the
// one-shot `device.lost` promise and has no "restore" — recovery means requesting
// a BRAND-NEW device and rebuilding everything against it, which is what
// `forceNew` is for.

let devicePromise: Promise<GPUDevice> | null = null

type DeviceLostListener = (device: GPUDevice) => void
const lostListeners = new Set<DeviceLostListener>()

/** Subscribe to loss of the shared device. Returns an unsubscribe function.
 *
 *  This is the WebGPU counterpart of the `webglcontextlost` DOM event, and it has
 *  to be invented here because WebGPU has none: loss arrives as the device's own
 *  one-shot `lost` promise, which only whoever awaited `getSharedDevice()` can see —
 *  i.e. the diversion, deep inside `setup()`, not the host that owns the loop.
 *
 *  Without it, a GPU-process restart / driver reset / sleep-wake froze all three
 *  webgpu pieces at once (they share this device) on their last frame while the
 *  chrome went on claiming they animated: fps counting up, ⏸ showing, no pause
 *  source set, no error boundary. Per spec, operations on a lost device are silent
 *  no-ops, so there was nothing to see but a frozen canvas — and nothing recovered
 *  it in place, because `forceNew` had zero production callers (#300).
 *
 *  Fires once per lost device, AFTER the cache has been dropped, so a listener that
 *  rebuilds by calling `getSharedDevice()` gets a fresh one. A listener that throws
 *  cannot stop its siblings from being notified — one wedged tile must not strand
 *  the other two. */
export function onSharedDeviceLost(cb: DeviceLostListener): () => void {
  lostListeners.add(cb)
  return () => {
    lostListeners.delete(cb)
  }
}

/** Cheap synchronous capability probe. `navigator.gpu` being present does NOT
 *  guarantee an adapter/device can actually be acquired (that's async and can
 *  still fail on a blocklisted GPU / software renderer) — it only gates whether
 *  it's worth trying. */
export function isWebGPUSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.gpu
}

/** Acquire (or reuse) the ONE shared GPUDevice for the whole page. Rejects if
 *  WebGPU is unsupported or no adapter is available. `forceNew` discards the
 *  cache to recover from a lost device. */
export function getSharedDevice(opts: { forceNew?: boolean } = {}): Promise<GPUDevice> {
  if (opts.forceNew) devicePromise = null
  if (!devicePromise) {
    const pending: Promise<GPUDevice> = (async () => {
      if (!navigator.gpu) throw new Error('WebGPU is not supported in this browser')
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
      if (!adapter) throw new Error('WebGPU: no GPU adapter available')
      const device = await adapter.requestDevice()
      // If the device is ever lost, drop the cache so the next getSharedDevice()
      // (e.g. from a diversion rebuilding) requests a fresh one instead of handing
      // back the dead handle. Guard on identity so a loss can't clear a newer
      // device someone already requested via forceNew.
      void device.lost.then(() => {
        // Inside the identity guard, not beside it: if a NEWER device has already been
        // requested via forceNew, this is a stale corpse and nobody is running on it —
        // telling three healthy tiles to tear down and rebuild would be pure damage.
        if (devicePromise !== pending) return
        devicePromise = null
        // Notify AFTER the cache drop, so a listener rebuilding via getSharedDevice()
        // requests a fresh device rather than being handed back the dead handle.
        // Snapshot the set: a listener commonly unsubscribes from inside its own
        // callback (a host tearing down as it rebuilds).
        for (const cb of [...lostListeners]) {
          try {
            cb(device)
          } catch {
            // A listener's own failure is its problem; the rest still get told.
          }
        }
      })
      return device
    })()
    // If init REJECTS (no adapter, requestDevice failure, GPU-process hiccup, transient
    // blocklist race), drop the cached rejection so the NEXT getSharedDevice() re-attempts
    // instead of handing every future webgpu tile a permanently-poisoned promise (#265).
    // Same identity guard so a newer device requested via forceNew is never clobbered.
    void pending.catch(() => {
      if (devicePromise === pending) devicePromise = null
    })
    devicePromise = pending
  }
  return devicePromise
}

/** Test-only: reset the memoized device (so a mocked navigator.gpu can be swapped
 *  between cases without cross-test bleed). */
export function __resetSharedDeviceForTests(): void {
  devicePromise = null
  // Also drop subscriptions: a leaked one from a previous file would fire a rebuild
  // into a torn-down host and read as a mystery failure in an unrelated suite.
  lostListeners.clear()
}
