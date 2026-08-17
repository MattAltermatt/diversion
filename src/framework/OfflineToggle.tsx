import { useEffect, useRef, useState } from 'react'
import { readWarmed, writeWarmed, type WarmProgress } from './offlineWarm'

/** Rounded so the label reads as a promise about the download, not a spec. Measured:
 *  137 chunks ≈ 840 kB, neural-ca's weights 1.17 MB, 27 sprites 112 kB. */
const APPROX_MB = 2.1

type Phase =
  | { kind: 'idle' }
  | { kind: 'warming'; progress: WarmProgress }
  | { kind: 'done'; failed: number }
  | { kind: 'error' }

/** "Keep the gallery offline" (#293).
 *
 *  The shell-only precache (#289) boots the app offline but cannot run a piece the
 *  viewer has never opened — someone who installed this to browse on a flight gets 137
 *  dark rectangles. That default is right (precaching everything costs every first
 *  visit 1.7 MB, half of it one piece's weights), so this is the opt-in.
 *
 *  Three things the issue asked for, and each is load-bearing rather than polish:
 *
 *   - **Real progress.** 2.1 MB is ~11 s of saturated downlink on a slow connection.
 *     A silent spinner for that long reads as broken.
 *   - **Cancellable.** Same reason. The AbortSignal reaches every in-flight fetch.
 *   - **An explicit decision about deploys.** Content-hashed filenames all change when
 *     a deploy changes anything, so a warmed copy goes stale and LRU eventually evicts
 *     it. Re-warming silently would repeat a multi-megabyte download on someone's
 *     cellular data without asking. So the fingerprint is stored, and a mismatch turns
 *     the control back into an offer — "Update offline copy" — rather than an action.
 *
 *  The engine is imported lazily on first press: nothing here, and no sprite manifest
 *  fetch, belongs in the entry chunk that #288 spent a cycle shrinking. */
export function OfflineToggle() {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [warmed, setWarmed] = useState<{ fingerprint: string } | null>(null)
  const [current, setCurrent] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    setWarmed(readWarmed())
    return () => abort.current?.abort()
  }, [])

  // Nothing to offer where nothing can store it: no service worker means no durable
  // cache, and the control would promise something it cannot deliver.
  const supported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator
  if (!supported) return null

  const start = async () => {
    const controller = new AbortController()
    abort.current = controller
    setPhase({ kind: 'warming', progress: { done: 0, total: 0, failed: 0 } })
    try {
      const { collectTargets, warmAll } = await import('./offlineWarm')
      const base = import.meta.env.BASE_URL
      const { urls, fingerprint } = await collectTargets(base, controller.signal)
      setCurrent(fingerprint)
      const result = await warmAll(
        urls,
        (progress) => setPhase({ kind: 'warming', progress }),
        controller.signal,
      )
      if (controller.signal.aborted) {
        setPhase({ kind: 'idle' })
        return
      }
      // Record it even with a few failures: the copy is useful, and the alternative is
      // offering the whole download again over one 404.
      writeWarmed(fingerprint)
      setWarmed({ fingerprint })
      setPhase({ kind: 'done', failed: result.failed })
    } catch {
      setPhase({ kind: 'error' })
    }
  }

  const cancel = () => {
    abort.current?.abort()
    setPhase({ kind: 'idle' })
  }

  if (phase.kind === 'warming') {
    const { done, total } = phase.progress
    const pct = total ? Math.round((done / total) * 100) : 0
    return (
      <div className="offline-ctl" aria-live="polite">
        <span className="offline-label">Downloading… {total ? `${done} / ${total}` : ''}</span>
        <span className="offline-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <span className="offline-bar-fill" style={{ width: `${pct}%` }} />
        </span>
        <button type="button" onClick={cancel}>
          Cancel
        </button>
      </div>
    )
  }

  if (phase.kind === 'done') {
    return (
      <div className="offline-ctl" aria-live="polite">
        <span className="offline-label">
          ✓ The whole gallery works offline
          {phase.failed > 0 ? ` (${phase.failed} couldn’t be fetched)` : ''}
        </span>
      </div>
    )
  }

  // A stored fingerprint that no longer matches this build means the copy is stale —
  // but `current` is only known after a run, so on a fresh page load we can only say
  // "already taken". The honest offer is a re-download the viewer chooses.
  const stale = warmed !== null && current !== null && warmed.fingerprint !== current
  const label =
    phase.kind === 'error'
      ? 'Couldn’t download — try again'
      : warmed && !stale
        ? `Update offline copy (~${APPROX_MB} MB)`
        : `⤓ Keep the gallery offline (~${APPROX_MB} MB)`

  return (
    <div className="offline-ctl">
      <button type="button" onClick={start}>
        {label}
      </button>
      <span className="offline-hint">
        Every piece runs with the network off. Without this, only the ones you have
        already watched do.
      </span>
    </div>
  )
}
