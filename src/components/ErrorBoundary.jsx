import { Component } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/**
 * Catches render-time errors anywhere in the tree so a single bad component
 * shows a recoverable message instead of unmounting the whole app (which left
 * a near-black blank page that needed a manual reload).
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep a trace in the console for debugging, but don't crash the page.
    console.error('Caught by ErrorBoundary:', error, info?.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="empty" style={{ margin: '40px auto', maxWidth: 560 }}>
          <AlertTriangle size={30} />
          <h3>Something went wrong</h3>
          <p style={{ maxWidth: 420, margin: '0 auto 18px' }}>
            {String(this.state.error.message || this.state.error)}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn" onClick={this.reset}><RotateCcw size={15} /> Try again</button>
            <button className="btn btn-ghost" onClick={() => window.location.reload()}>Reload</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
