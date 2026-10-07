import { useState } from "react";
import { Flag, Loader2 } from "lucide-react";
import { Modal } from "./ui/modal";
import { Button } from "./ui/button";
import { useToast } from "./toast";
import { useReportContent, type ReportReason, type ReportTarget } from "../queries/moderation";

const REASONS: { value: ReportReason; label: string; hint: string }[] = [
  { value: "spam", label: "Spam or advertising", hint: "Unwanted promotion or repeated junk" },
  { value: "abuse", label: "Hate or slurs", hint: "Attacks on a person or group" },
  { value: "harassment", label: "Harassment", hint: "Targeted bullying or intimidation" },
  { value: "violence", label: "Violence or self-harm", hint: "Threats, or encouraging harm" },
  { value: "sexual", label: "Sexual content", hint: "Explicit material" },
  { value: "other", label: "Something else", hint: "Tell us below" },
];

/**
 * Report control for user-generated content. Content is never deleted by a
 * report — it enters a queue an operator reviews, so a bad-faith report can't
 * remove someone's work.
 */
export function ReportButton({
  targetType,
  targetId,
  className,
  label,
}: {
  targetType: ReportTarget;
  targetId: string;
  className?: string;
  label?: string;
}) {
  const { toast } = useToast();
  const report = useReportContent();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("abuse");
  const [note, setNote] = useState("");

  const submit = () => {
    report.mutate(
      { targetType, targetId, reason, note: note.trim() || undefined },
      {
        onSuccess: (res) => {
          setOpen(false);
          setNote("");
          toast({
            kind: "success",
            title: res.duplicate ? "Already reported" : "Report sent",
            description: res.duplicate
              ? "You've already flagged this — we're on it."
              : "Thanks. A moderator will take a look.",
          });
        },
        onError: (e) => toast({ kind: "error", title: "Couldn't send report", description: e.message }),
      },
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Report this content"
        className={
          className ??
          "inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-error"
        }
      >
        <Flag className="size-3" />
        {label}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Report content"
        description="This goes to a moderator. Nothing is removed automatically."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={report.isPending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={report.isPending} className="gap-2">
              {report.isPending && <Loader2 className="size-4 animate-spin" />} Send report
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          {REASONS.map((r) => (
            <label
              key={r.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                reason === r.value ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
              }`}
            >
              <input
                type="radio"
                name="report-reason"
                className="mt-1 accent-primary"
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
              />
              <span>
                <span className="block text-sm font-medium">{r.label}</span>
                <span className="block text-xs text-muted-foreground">{r.hint}</span>
              </span>
            </label>
          ))}
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Anything else we should know? (optional)"
          className="mt-3 w-full resize-none rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary"
        />
      </Modal>
    </>
  );
}
