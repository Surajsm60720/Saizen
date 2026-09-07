'use client'

import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

type Props = {
  name: string
  children: ReactNode
}

type State = {
  error: Error | null
}

/** Isolates keep-alive panes so a Home/Search crash doesn't blank the whole shell. */
export class PaneErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidUpdate(prevProps: Props) {
    // Remount-equivalent recovery when the routed page identity changes.
    if (prevProps.name !== this.props.name && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[40dvh] flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm font-medium text-foreground">{this.props.name} hit a problem</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            {this.state.error.message || 'Something went wrong in this screen.'}
          </p>
          <Button size="sm" variant="outline" onClick={() => this.setState({ error: null })}>
            Try again
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
