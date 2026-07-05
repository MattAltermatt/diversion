import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Optional custom fallback. Defaults to a small inline "failed to start" note. */
  fallback?: ReactNode
  /** When > 0, auto-remount the child after a failure — up to this many times, with
   *  exponential backoff — before showing the fallback for good. The gallery sets
   *  this: a WebGL tile can fail to start purely because the browser's active-GL-
   *  context budget was momentarily exhausted while scrolling past other GPU tiles,
   *  and it recovers cleanly on a remount once those contexts free. A latched
   *  fallback would strand a tile that is perfectly capable of running. Left unset
   *  (0) the boundary latches on the first error — the right behaviour on the
   *  PlayScreen / ConfigScreen, where a failure is a real, shown condition. */
  maxRetries?: number
}

interface State {
  hasError: boolean
  attempt: number // how many auto-remounts we've spent (bounded by maxRetries)
}

/** Catches a render/setup failure from a single diversion host (e.g. a WebGL
 *  shader that compiles on the author's GPU but not the viewer's) and shows a
 *  small inline fallback for THAT tile only — instead of letting one failing
 *  diversion throw all the way up and white-screen the whole gallery (#124).
 *
 *  Wrap each <AnimationHost> render site (Gallery tile, ConfigScreen preview,
 *  PlayScreen) in its own boundary so the blast radius is one tile. AnimationHost
 *  re-throws setup() failures during render (via a state setter) precisely so
 *  this boundary can catch them. */
export class DiversionErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, attempt: 0 }
  private timer: ReturnType<typeof setTimeout> | null = null

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep a console trail — the fallback is intentionally terse on-screen.
    console.error('Diversion failed to start:', error, info.componentStack)
    if (this.state.attempt < (this.props.maxRetries ?? 0)) {
      // Backoff grows per attempt so a burst of scroll-churn failures spread out and
      // let GL-context pressure drain before the next remount. When the boundary
      // clears hasError, React re-mounts the previously-unmounted child subtree
      // (fresh canvas + setup) — the same path teardown already runs on catch.
      const delay = 300 * 2 ** this.state.attempt
      this.timer = setTimeout(
        () => this.setState((s) => ({ hasError: false, attempt: s.attempt + 1 })),
        delay,
      )
    }
  }

  componentWillUnmount(): void {
    if (this.timer) clearTimeout(this.timer)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="diversion-error" role="status">
            This diversion failed to start
          </div>
        )
      )
    }
    return this.props.children
  }
}
