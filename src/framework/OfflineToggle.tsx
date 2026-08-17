import { useEffect, useRef, useState } from 'react'
import { currentFingerprint, readWarmed, writeWarmed } from './offlineState'
import type { WarmProgress } from './offlineWarm'

/** Transfer size of everything warmed, measured on the shipped build: 137 diversion
 *  chunks at 0.58 MB gzipped, neural-ca's weights at 0.88 MB, 26 sprites at 0.11 MB.
 *  Stated as the DOWNLOAD, which is what the viewer actually pays — on disk it is
 *  ~2.8 MB, and quoting that number would overstate the ask. */
const APPROX_MB = 1.6

type Phase =
  | { kind: 'idle' }
  | { kind: 'warming'; progress: WarmProgress }
  | { kind: 'done'; failed: number }
  | { kind: 'error'; message: string }

/** Coarse enough that a screen reader is not read 165 progress announcements. */
const ANNOUNCE_EVERY = 10

/** "Keep the gallery offline" (#293).
 *
 *  The shell-only precache (#289) boots the app offline but cannot run a piece the
 *  viewer has never opened — someone who installed this to browse on a flight gets 137
 *  dark rectangles. That default is right (precaching everything costs every first
 *  visit ~1.6 MB, more than half of it one piece's weights), so this is the opt-in.
 *
 *  Four things, each load-bearing rather than polish:
 *
 *   - **Real progress.** ~1.6 MB is ~10 s of saturated downlink on a slow connection.
 *     A silent spinner for that long reads as broken.
 *   - **Cancellable.** Same reason. The AbortSignal reaches every in-flight fetch.
 *   - **An explicit decision about deploys.** Content-hashed filenames all move when a
 *     deploy changes anything, so a warmed copy goes stale and LRU eventually evicts
 *     it. Re-warming silently would repeat a multi-megabyte download on someone's
 *     cellular data. So the fingerprint is stored and compared at MOUNT (no network —
 *     `currentFingerprint` is pure), and a mismatch turns the control into an offer to
 *     update rather than an action.
 *   - **A verified claim.** Everything here rests on the assumption that the service
 *     worker stored what we fetched, and that is false whenever no SW controls the
 *     document — in dev, before `clientsClaim`, or after a quota eviction. The green
 *     tick is printed only once `verifyCached` has found some of it in a real cache,
 *     and only if any diversion chunks were enumerated at all: with an old cached
 *     index.html the asset map is absent, `collectTargets` finds only sprites, and
 *     without this check the control would warm 27 files and claim 137 pieces work. */
export function OfflineToggle() {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [warmed, setWarmed] = useState<{ fingerprint: string } | null>(null)
  const [current, setCurrent] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    setWarmed(readWarmed())
    setCurrent(currentFingerprint())
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
    // Every await below re-checks this: a cancel followed by a fresh press must not
    // let the abandoned run write over the new one's state.
    const mine = () => abort.current === controller && !controller.signal.aborted
    try {
      const { collectTargets, warmAll, verifyCached } = await import('./offlineWarm')
      if (!mine()) return
      const base = import.meta.env.BASE_URL
      const { urls, chunkCount, fingerprint } = await collectTargets(base, controller.signal)
      if (!mine()) return

      if (chunkCount === 0) {
        setPhase({
          kind: 'error',
          message: 'This page is out of date — reload it, then try again.',
        })
        return
      }

      setCurrent(fingerprint)
      const result = await warmAll(
        urls,
        (progress) => {
          if (mine()) setPhase({ kind: 'warming', progress })
        },
        controller.signal,
      )
      if (!mine()) return

      if (!(await verifyCached(urls))) {
        setPhase({
          kind: 'error',
          message: 'Downloaded, but nothing could be stored for offline use.',
        })
        return
      }
      if (!mine()) return

      // Record it even with a few failures: the copy is useful, and the alternative is
      // offering the whole download again over one 404.
      writeWarmed(fingerprint)
      setWarmed({ fingerprint })
      setPhase({ kind: 'done', failed: result.failed })
    } catch {
      if (mine()) setPhase({ kind: 'error', message: 'Couldn’t download.' })
    }
  }

  const cancel = () => {
    abort.current?.abort()
    abort.current = null
    setPhase({ kind: 'idle' })
  }

  // ONE live region for the whole control, present in every phase: a region inserted
  // into the DOM already populated is not reliably announced, so the completion
  // message — the one worth hearing — is the one most likely to be missed.
  const announcement =
    phase.kind === 'warming'
      ? phase.progress.total &&
        (phase.progress.done % ANNOUNCE_EVERY === 0 || phase.progress.done === phase.progress.total)
        ? `Downloading, ${Math.round((phase.progress.done / phase.progress.total) * 100)} percent`
        : ''
      : phase.kind === 'done'
        ? phase.failed > 0
          ? `Saved, but ${phase.failed} files could not be fetched`
          : 'The whole gallery is saved for offline use'
        : phase.kind === 'error'
          ? phase.message
          : ''

  const live = (
    <span className="visually-hidden" role="status" aria-live="polite">
      {announcement}
    </span>
  )

  if (phase.kind === 'warming') {
    const { done, total } = phase.progress
    const pct = total ? Math.round((done / total) * 100) : 0
    return (
      <div className="offline-ctl">
        {live}
        <span className="offline-label">Downloading… {total ? `${done} / ${total}` : ''}</span>
        <span
          className="offline-bar"
          role="progressbar"
          aria-label="Offline download progress"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span className="offline-bar-fill" style={{ width: `${pct}%` }} />
        </span>
        <button type="button" onClick={cancel}>
          Cancel
        </button>
      </div>
    )
  }

  const upToDate = warmed !== null && current !== null && warmed.fingerprint === current
  const stale = warmed !== null && current !== null && warmed.fingerprint !== current

  if (phase.kind === 'done') {
    // Never a green tick over a partial result: "the whole gallery works offline" with
    // 40 files missing is simply false, and the tick is the part that gets scanned.
    return (
      <div className="offline-ctl">
        {live}
        <span className="offline-label">
          {phase.failed > 0
            ? `⚠ Mostly saved — ${phase.failed} files couldn’t be fetched.`
            : '✓ The whole gallery is saved for offline use'}
        </span>
        <button type="button" onClick={start}>
          {phase.failed > 0 ? 'Try again' : 'Download again'}
        </button>
      </div>
    )
  }

  const label =
    phase.kind === 'error'
      ? 'Try again'
      : stale
        ? `⤓ Update offline copy (~${APPROX_MB} MB)`
        : upToDate
          ? 'Download again'
          : `⤓ Keep the gallery offline (~${APPROX_MB} MB)`

  return (
    <div className="offline-ctl">
      {live}
      {phase.kind === 'error' && <span className="offline-label">{phase.message}</span>}
      {upToDate && !stale && phase.kind !== 'error' && (
        <span className="offline-label">✓ Saved for offline use</span>
      )}
      <button type="button" onClick={start}>
        {label}
      </button>
      <span className="offline-hint">
        {stale
          ? 'The gallery has been updated since you saved it.'
          : 'Every piece runs with the network off. Without this, only the ones you have already watched do.'}
      </span>
    </div>
  )
}
