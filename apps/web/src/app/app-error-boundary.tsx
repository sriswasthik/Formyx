import { Component, type ErrorInfo, type ReactNode } from 'react';
import { CrashScreen } from './crash-screen';

interface State {
  failed: boolean;
  error: unknown;
}

/**
 * The last line of defence: errors outside any route (routes have their own error page) show a
 * friendly screen with a way out instead of a blank page.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false, error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { failed: true, error };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    // Kept for the browser console and error monitoring; people see the screen below.
    // eslint-disable-next-line no-console -- the one place an unexpected crash is reported
    console.error('Formyx crashed', error, info.componentStack);
  }

  override render() {
    return this.state.failed ? <CrashScreen error={this.state.error} /> : this.props.children;
  }
}
