import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import { Button } from "./ui/button";
import { Logo } from "./logo";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Catches render-time crashes so a single bad component can never leave the user
 * staring at a blank white page. Recovery is offered in place (re-mount the tree)
 * before falling back to a full reload.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surfaced in the browser console and any attached logging pipeline.
    console.error("[OrbitL] render error:", error, info.componentStack);

    // Ship it to the server error log so a crash nobody reports is still visible
    // on the ops dashboard. Fire-and-forget: a failed report must never turn a
    // recoverable render error into a second crash.
    void fetch("/api/errors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: error.message || error.name || "Unknown render error",
        stack: [error.stack, info.componentStack].filter(Boolean).join("\n\n"),
        path: window.location.pathname + window.location.search,
      }),
      keepalive: true,
    }).catch(() => {});
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="app-bg grid min-h-dvh place-items-center p-6 text-foreground">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card/80 p-8 backdrop-blur">
          <div className="flex items-center gap-2.5">
            <Logo size={32} />
            <span className="font-bold">OrbitL</span>
          </div>

          <div className="mt-6 grid size-12 place-items-center rounded-2xl bg-error/10">
            <AlertTriangle className="size-6 text-error" />
          </div>

          <h1 className="mt-4 text-xl font-bold">Something broke on this screen</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            That's on us, not you. Your data is safe — nothing was lost. Try loading this screen again, or head
            back to the dashboard.
          </p>

          {import.meta.env.DEV && (
            <pre className="mt-4 max-h-40 overflow-auto rounded-xl bg-muted p-3 text-xs text-muted-foreground">
              {error.message}
            </pre>
          )}

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Button onClick={this.reset} className="flex-1 gap-2">
              <RotateCcw className="size-4" /> Try again
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                window.location.href = "/";
              }}
              className="flex-1 gap-2"
            >
              <Home className="size-4" /> Go to dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
