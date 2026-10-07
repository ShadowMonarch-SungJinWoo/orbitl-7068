import { AlertTriangle, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "./ui/button";

/**
 * Inline notice for a failed AI action, with a retry.
 *
 * The API tags gateway failures with `data.aiUnavailable` (see
 * `api/lib/ai-errors.ts`). Those are transient or operational — out of credits,
 * throttled, provider down — so the right response is a readable explanation and
 * a one-click retry, not a stack trace. Anything untagged is a real bug and is
 * shown as-is so it doesn't get dressed up as a service hiccup.
 */

type MaybeAiError = { message?: string; data?: unknown } | null | undefined;

export function isAiUnavailableError(err: MaybeAiError): boolean {
  const data = err?.data;
  return !!data && typeof data === "object" && (data as { aiUnavailable?: boolean }).aiUnavailable === true;
}

export function AiErrorNotice({
  error,
  onRetry,
  retrying,
  className = "",
}: {
  error: MaybeAiError;
  onRetry: () => void;
  retrying?: boolean;
  className?: string;
}) {
  if (!error) return null;
  const friendly = isAiUnavailableError(error);
  return (
    <div
      role="alert"
      className={`rounded-xl border px-3.5 py-3 text-xs ${
        friendly ? "border-warning/40 bg-warning/10 text-warning" : "border-destructive/40 bg-destructive/10 text-destructive"
      } ${className}`}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{friendly ? "AI is unavailable right now" : "That didn't work"}</p>
          <p className="mt-0.5 leading-relaxed opacity-90">{error.message || "Something went wrong."}</p>
        </div>
      </div>
      <div className="mt-2.5 flex justify-end">
        <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
          {retrying ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />} Retry
        </Button>
      </div>
    </div>
  );
}
