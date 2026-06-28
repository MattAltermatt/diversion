import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Optional custom fallback. Defaults to a small inline "failed to start" note. */
  fallback?: ReactNode
}

interface State {
  hasError: boolean
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
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep a console trail — the fallback is intentionally terse on-screen.
    console.error('Diversion failed to start:', error, info.componentStack)
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
