import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  /** Shown in place of the children when they throw. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Label used in the default fallback, e.g. "chart". */
  label?: string;
}

interface State {
  error: Error | null;
}

/**
 * Stops one failing subtree from unmounting the whole app.
 *
 * React tears the entire tree down on an uncaught render error, so without a
 * boundary a single malformed chart turns the page blank. Must be a class —
 * there is no hook equivalent for componentDidCatch.
 *
 * Scope note: boundaries catch errors thrown during render, in lifecycle, and
 * in effects. They do NOT catch errors in event handlers, in async callbacks,
 * or inside the <script> tags HtmlVisual injects — those run outside React's
 * call stack and surface in the console instead.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] caught", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    const label = this.props.label ?? "section";
    return (
      <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs text-warning">
        <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">This {label} could not be displayed.</p>
          <p className="mt-0.5 font-mono text-2xs break-words text-warning/90">{error.message}</p>
          <button
            onClick={this.reset}
            className="mt-1.5 font-semibold text-warning underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
