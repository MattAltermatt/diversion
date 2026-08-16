import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useLocation, useNavigationType, Link } from 'react-router-dom'
import { getDiversion } from '../framework/registry'
import { AnimationHost } from '../framework/AnimationHost'
import { DiversionErrorBoundary } from '../framework/DiversionErrorBoundary'
import { decodeConfig, applyFreshLoadRandomization, encodeConfig } from '../framework/urlCodec'
import { CopyLinkButton } from '../framework/CopyLinkButton'
import {
  RUNNING,
  hasWakeLock,
  samePauseSources,
  shouldHoldWakeLock,
  type PauseSources,
} from '../framework/pauseModel'

export function PlayScreen() {
  const { slug } = useParams()
  const { search } = useLocation()
  // 'POP' = a direct load / reload / bookmark / back-forward; 'PUSH' = an in-app link
  // (e.g. the Config screen's Play button). Persistence resumes only on POP so that
  // clicking "Play" after tweaking the config always shows the just-configured world,
  // while a plain reload brings a bred run back. Captured at mount (constant here).
  const navType = useNavigationType()
  const diversion = getDiversion(slug!)

  // Parse config ONCE from the URL; frozen for the session. Source the query
  // string from the router (useLocation) rather than window.location.search so
  // it stays consistent with the rest of the browser-router-driven app (React
  // Router's createBrowserRouter, with the query string as a normal `?...` suffix).
  const config = useMemo(
    () => {
      if (!diversion) return null
      const params = new URLSearchParams(search)
      // Persistence resume (#226): on a direct load / reload (POP, not an in-app Play
      // click), a diversion may resume a saved session. A returned config is mounted
      // verbatim (the diversion's setup() restores its own runtime); the hook gates on
      // the explicit-seed / direct rules. Persistence *arming* is the effect below.
      const resumed = diversion.resumeConfig?.(params, navType === 'POP')
      if (resumed) return resumed
      const decoded = decodeConfig(diversion.schema, params)
      // Any flagged field (seed) the URL omits → roll fresh, so a seedless link is a
      // new run every visit. An explicit ?seed=N (testing) is honored & reproduces.
      return applyFreshLoadRandomization(diversion.schema, decoded, params)
    },
    // Frozen for the session: re-decode only when the diversion changes, not on
    // every search edit. `search` is the mount-time snapshot by intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [diversion],
  )

  // The world currently on screen. Starts as the mount config; auto-restart reports
  // a fresh one via onLiveConfigChange each time it reseeds. Drives copy-link-with-seed.
  const [liveConfig, setLiveConfig] = useState<unknown>(config)

  // A seedless URL may persist/resume; an explicit ?seed is a fixed reproducible run
  // that must not touch the resume slot. (Mount-time snapshot; `search` is frozen.)
  const seedless = useMemo(() => !new URLSearchParams(search).has('seed'), [search])

  // Arm persistence (#226) for THIS Play mount, and disarm on unmount. This is the
  // only place that arms it, so a Config-screen preview or Gallery thumbnail — which
  // mount the diversion but never arm — can never auto-save over a bred run. The
  // cleanup fires when navigating away in-app (SPA, no page reload), closing the
  // window in which a sticky flag used to leak into the next screen.
  useEffect(() => {
    if (!diversion || !config) return
    diversion.armPersistence?.(seedless ? config : null)
    return () => diversion.armPersistence?.(null)
  }, [diversion, config, seedless])

  // Auto-hide the chrome (back link + bar) after a few idle seconds — screensaver feel.
  //
  // `pointerdown` is load-bearing, not a nicety: idle sets `pointer-events: none` on
  // both chrome layers, so if a touch can't wake them there is no way back. A tap used
  // to recover only via a synthesized compatibility `mousemove`, and a *drag* emits none
  // at all — so dragging on a diversion with `onPointer` stranded you. In a browser tab
  // that was survivable (browser back exists); under `display: standalone` on iOS there
  // is no back button, so touch-wake is a prerequisite for shipping the manifest.
  //
  // The idle delay is longer on a coarse pointer: 2.5s is hostile on a phone, where
  // re-summoning the chrome costs a deliberate tap rather than an incidental mouse nudge.
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
    const delay = coarse ? 5000 : 2500
    let timer = 0
    const wake = () => {
      setIdle(false)
      clearTimeout(timer)
      timer = window.setTimeout(() => setIdle(true), delay)
    }
    window.addEventListener('mousemove', wake)
    window.addEventListener('keydown', wake)
    window.addEventListener('pointerdown', wake)
    wake() // arm the timer on mount
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mousemove', wake)
      window.removeEventListener('keydown', wake)
      window.removeEventListener('pointerdown', wake)
    }
  }, [])

  // ── Screen Wake Lock (#284) ───────────────────────────────────────────────
  //
  // A phone propped on a shelf sleeps in ~30s, which defeats the whole premise of
  // an ambient gallery. This lives HERE and never in AnimationHost: the host mounts
  // on every one of the 137 gallery tiles, so a per-host lock would hold the screen
  // awake while merely browsing. PlayScreen is already the route that owns
  // whole-session concerns (resumeConfig / armPersistence), so the precedent exists.
  //
  // Availability is probed once: on a browser without the API the toggle is not
  // rendered at all, rather than rendering a control that presses and silently does
  // nothing (which is exactly the defect `requestFullscreen` has on iPhone).
  const wakeLockSupported = useMemo(() => hasWakeLock(navigator), [])
  const [wakeLockOn, setWakeLockOn] = useState(false)

  // The host's live pause sources, reported through the read-only seam. Starts at
  // RUNNING (nothing freezing) and is overwritten by the host's first sync, which
  // fires in its mount effect — child effects run before this parent's.
  const [pause, setPause] = useState<PauseSources>(RUNNING)
  const onPauseSourcesChange = useCallback((s: PauseSources) => {
    setPause((prev) => (samePauseSources(prev, s) ? prev : s))
  }, [])

  // Hold iff the viewer asked AND the animation is actually moving. Because
  // `hidden` is one of the pause sources, this is ALSO the re-request seam: the
  // platform drops the lock on tab-hide, the host's existing `visibilitychange`
  // listener flips `hidden`, and this effect re-runs — first releasing (a no-op on
  // an already-released sentinel), then re-requesting when the tab comes back. No
  // second `visibilitychange` listener is added; the one in AnimationHost belongs
  // to the pause model and this rides it.
  const holdWakeLock = shouldHoldWakeLock({
    requested: wakeLockOn,
    supported: wakeLockSupported,
    pause,
  })
  useEffect(() => {
    if (!holdWakeLock) return
    let cancelled = false
    let sentinel: WakeLockSentinel | null = null
    // The platform may release the lock on its own (tab-hide, low battery). Drop the
    // reference so the cleanup doesn't call release() on a corpse.
    const onRelease = () => {
      sentinel = null
    }
    // request() rejects with NotAllowedError on a hidden document, on low battery,
    // and under a blocking Permissions Policy — none of which is exceptional, and
    // none of which the viewer can act on. Fail soft and silent, every call: the
    // toggle simply stays on and the next pause/visibility change retries.
    try {
      navigator.wakeLock
        .request('screen')
        .then((s) => {
          if (cancelled) {
            // Resolved after this effect was torn down — release immediately rather
            // than stranding a lock nothing holds a reference to.
            s.release().catch(() => {})
            return
          }
          sentinel = s
          s.addEventListener('release', onRelease)
        })
        .catch(() => {})
    } catch {
      /* a shimmed/hostile navigator.wakeLock that throws synchronously */
    }
    return () => {
      cancelled = true
      const held = sentinel
      sentinel = null
      if (!held) return
      held.removeEventListener('release', onRelease)
      try {
        held.release().catch(() => {})
      } catch {
        /* already released by the platform */
      }
    }
  }, [holdWakeLock])

  if (!diversion || !config) return <div className="empty">Unknown diversion.</div>

  // Back link + copy link mirror the incoming URL verbatim. Because seed is never
  // encoded, a seedless link stays seedless (a "new world every visit" share link),
  // while an explicit ?seed=N is preserved so a testing link still reproduces.
  const qs = search
  // Pin the live world: a FULL snapshot including the seed, so the link reopens this
  // exact world (not a new one). Falls back to the mount config before the first report.
  const pinnedQs = `?${encodeConfig(diversion.schema, (liveConfig ?? config) as never, { includePinned: true }).toString()}`

  return (
    <div className={`play-screen ${idle ? 'idle' : ''}`}>
      <div className="play-chrome">
        <Link to={{ pathname: `/d/${diversion.id}`, search: qs }} className="play-back">
          ← config
        </Link>
        <CopyLinkButton href={`/d/${diversion.id}/play${qs}`} className="play-copy" />
        <CopyLinkButton
          href={`/d/${diversion.id}/play${pinnedQs}`}
          className="play-copy"
          icon="📌"
          label="Copy this world"
          copiedIcon="✓"
          copiedLabel="World copied"
        />
        {diversion.clearPersistedRun && seedless && (
          <button
            className="play-copy"
            title="Discard the saved run and start a brand-new one"
            // Narrow viewports hide .cb-txt, and content-derived naming would
            // leave this button called "new" — see CopyLinkButton.
            aria-label="New run"
            onClick={() => {
              // Discard the saved run, then reload. Only shown on a seedless URL, so the
              // fresh mount rolls a new seed and starts a brand-new run (an explicit
              // ?seed would reload the same world and isn't persisting anyway). Reload
              // keeps any base path intact.
              diversion.clearPersistedRun!()
              window.location.reload()
            }}
          >
            <span className="cb-ico">🆕</span> <span className="cb-txt">New run</span>
          </button>
        )}
      </div>
      <DiversionErrorBoundary>
        <AnimationHost
          diversion={diversion}
          config={config}
          fullscreenable
          onLiveConfigChange={setLiveConfig}
          onPauseSourcesChange={onPauseSourcesChange}
          barExtra={
            wakeLockSupported && (
              <button
                className="wake-lock"
                aria-pressed={wakeLockOn}
                aria-label={wakeLockOn ? 'Let the screen sleep' : 'Keep the screen awake'}
                title={
                  wakeLockOn
                    ? 'Keeping the screen awake — tap to let it sleep'
                    : 'Keep the screen awake while this plays (uses more battery)'
                }
                onClick={() => setWakeLockOn((v) => !v)}
              >
                {wakeLockOn ? '💡' : '💤'}
              </button>
            )
          }
        />
      </DiversionErrorBoundary>
    </div>
  )
}
