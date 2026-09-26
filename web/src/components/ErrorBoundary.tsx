import { Component, type ErrorInfo, type ReactNode } from 'react'

/** Anything thrown, as an Error with readable text. */
export function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

/** Reload the page (injectable so the button can be tested without navigating). */
export function reloadPage(target: Pick<Location, 'reload'> = window.location): void {
  target.reload()
}

export interface ErrorBoundaryProps {
  children: ReactNode
  fallback: (error: Error, reset: () => void) => ReactNode
  onError?: (error: Error, info: ErrorInfo) => void
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * A render error below this point becomes a readable message instead of a
 * blank page -- textbook embeds are often opened on locked-down machines.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: asError(error) }
  }

  // React hands over the raw thrown value -- a string, even null -- whatever
  // the parameter's type says, so it is normalised exactly as the fallback's is.
  componentDidCatch(error: unknown, info: ErrorInfo): void {
    this.props.onError?.(asError(error), info)
  }

  reset = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    return this.state.error === null
      ? this.props.children
      : this.props.fallback(this.state.error, this.reset)
  }
}

/** The failure screen: what failed, the error text, and a way out. */
export function LabFailure({
  title,
  error,
  onRetry,
  onReload = reloadPage,
}: {
  title: string
  error: Error
  onRetry?: () => void
  onReload?: () => void
}) {
  return (
    <div className="qv-fallback" role="alert" data-chrome="">
      <h1>{title}</h1>
      <p>{error.message}</p>
      <div className="qv-fallback-actions">
        {onRetry === undefined ? null : (
          <button type="button" onClick={onRetry}>
            重试
          </button>
        )}
        <button type="button" onClick={() => onReload()}>
          重新载入页面
        </button>
      </div>
    </div>
  )
}
