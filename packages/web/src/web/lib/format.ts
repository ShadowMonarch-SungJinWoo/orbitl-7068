export function relativeDue(date: Date | string | null | undefined): { label: string; tone: "muted" | "warning" | "destructive" | "success" } {
  if (!date) return { label: "No due date", tone: "muted" };
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = d.getTime() - Date.now();
  const days = Math.round(diff / 86400000);
  if (diff < 0) return { label: `${Math.abs(days)}d overdue`, tone: "destructive" };
  if (days === 0) return { label: "Due today", tone: "warning" };
  if (days === 1) return { label: "Due tomorrow", tone: "warning" };
  if (days <= 3) return { label: `Due in ${days}d`, tone: "warning" };
  return { label: `Due in ${days}d`, tone: "muted" };
}

export function fmtDate(date: Date | string | null | undefined) {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en", { month: "short", day: "numeric" });
}

export function fmtMinutes(min: number) {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function masteryTone(m: number): "success" | "warning" | "destructive" {
  return m >= 70 ? "success" : m >= 40 ? "warning" : "destructive";
}
