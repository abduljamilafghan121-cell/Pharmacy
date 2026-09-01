import { Component, type ReactNode, type ReactElement } from 'react'
import { getTheme, serif } from '../theme'
import { useUiStore } from '../store/uiStore'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

/**
 * Catches render errors from the active screen so a single bad screen can't
 * unmount the whole app (blank window, no title bar, no way back). It wraps
 * only the screen itself — the sidebar and title bar stay alive above it, so
 * the user can navigate away — and offers a recovery button back to dashboard.
 */
class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: unknown): void {
    console.error('Screen crashed:', error)
  }

  private reset = (): void => {
    useUiStore.getState().setScreen('dashboard')
    this.setState({ hasError: false })
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children
    return <ErrorFallback onReset={this.reset} />
  }
}

function ErrorFallback({ onReset }: { onReset: () => void }): ReactElement {
  const { dark } = useUiStore()
  const theme = getTheme(dark)
  return (
    <div
      className="h-full w-full flex items-center justify-center p-6"
      style={{ background: theme.bg }}
    >
      <div
        className="max-w-sm w-full text-center rounded-2xl p-8"
        style={{ background: theme.card, border: `1px solid ${theme.borderStrong}` }}
      >
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
          style={{ background: theme.primarySoft, color: theme.primary }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h2 style={{ ...serif, color: theme.text }} className="text-xl font-bold mb-2">
          Something went wrong
        </h2>
        <p style={{ color: theme.muted }} className="text-sm mb-6">
          This screen hit an unexpected error. Your data is safe — you can head
          back to the dashboard. If this keeps happening, please contact support.
        </p>
        <button
          onClick={onReset}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: theme.primary }}
        >
          Back to dashboard
        </button>
      </div>
    </div>
  )
}

export default ErrorBoundary
