import { Component, type ReactNode } from 'react';
import { reportReactError } from '../../lib/observability';

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

export class TelemetryBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
  };

  // Switch to the fallback screen when a child fails to render.
  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  // Send the error to Faro when logging is enabled.
  componentDidCatch(error: Error): void {
    reportReactError(error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div role="alert" style={{ padding: '24px' }}>
          <h2>Something went wrong</h2>
          <p>Please reload the page and try again.</p>

          <button
            type="button"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </div>
      );
    }

    // Display the application normally when there is no error.
    return this.props.children;
  }
}
