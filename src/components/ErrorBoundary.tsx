import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { logClientError } from "@/lib/gafcore-client-logger";
import { isStaleChunkError, reloadAfterStaleChunkError } from "@/lib/stale-chunk-recovery";

type Props = { children: ReactNode; fallback?: (error: Error, reset: () => void) => ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logClientError("ErrorBoundary", { error, info });
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    const staleChunkError = isStaleChunkError(error);
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
          <h2 className="text-xl font-semibold">Algo salió mal</h2>
          <p className="text-sm text-muted-foreground break-words">
            {staleChunkError
              ? "Hay una version nueva de GafCore. Recarga para entrar con los archivos actualizados."
              : error.message}
          </p>
          <div className="flex justify-center gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                if (reloadAfterStaleChunkError(error, staleChunkError)) return;
                window.location.reload();
              }}
            >
              Recargar
            </Button>
            <Button onClick={this.reset}>Reintentar</Button>
          </div>
        </div>
      </div>
    );
  }
}
