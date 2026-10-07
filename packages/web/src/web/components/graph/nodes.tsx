import { Handle, Position } from "@xyflow/react";
import { BookOpen, Check } from "lucide-react";

const masteryColor = (m: number) => (m >= 70 ? "#22C55E" : m >= 40 ? "#F59E0B" : "#EF4444");
const masteryLabel = (m: number) => (m >= 70 ? "Mastered" : m >= 40 ? "Learning" : "Needs work");

export function SubjectNode({
  data,
}: {
  data: { label: string; color: string; selected?: boolean; dimmed?: boolean; match?: boolean };
}) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-2xl border px-4 py-3 shadow-soft transition-all duration-200"
      style={{
        background: `linear-gradient(135deg, ${data.color}, ${data.color}cc)`,
        borderColor: data.match ? "#F9FAFB" : data.color,
        boxShadow: data.match ? `0 0 0 2px #F9FAFB, 0 0 28px ${data.color}88` : `0 0 24px ${data.color}55`,
        opacity: data.dimmed ? 0.2 : 1,
      }}
      title={data.label}
    >
      <Handle type="source" position={Position.Bottom} className="!bg-white/60" />
      <Handle type="target" position={Position.Top} className="!bg-white/60" />
      <div className="grid size-8 place-items-center rounded-xl bg-white/20">
        <BookOpen className="size-4 text-white" />
      </div>
      <span className="text-sm font-bold text-white">{data.label}</span>
    </div>
  );
}

export function TopicNode({
  data,
}: {
  data: {
    label: string;
    mastery: number;
    revisionStatus?: string;
    selected?: boolean;
    dimmed?: boolean;
    match?: boolean;
    neighbour?: boolean;
  };
}) {
  const color = masteryColor(data.mastery);
  const ring = data.selected
    ? "0 0 0 2px var(--primary), 0 8px 24px rgba(0,0,0,0.25)"
    : data.match
      ? "0 0 0 2px var(--accent), 0 8px 20px rgba(0,0,0,0.2)"
      : data.neighbour
        ? "0 0 0 1.5px var(--accent)"
        : undefined;

  return (
    <div
      className="min-w-[140px] cursor-pointer rounded-xl border bg-card px-3.5 py-2.5 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
      style={{
        borderColor: data.selected ? "var(--primary)" : "var(--border)",
        boxShadow: ring,
        opacity: data.dimmed ? 0.18 : 1,
      }}
      // Native tooltip is the cheapest way to give every node a hover readout.
      title={`${data.label} — ${data.mastery}% mastery (${masteryLabel(data.mastery)})${
        data.revisionStatus ? ` · ${data.revisionStatus.replace(/_/g, " ")}` : ""
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground" />
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground" />
      <div className="flex items-center gap-2">
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
        <span className="truncate text-sm font-semibold text-card-foreground">{data.label}</span>
        {data.mastery >= 90 && <Check className="size-3 shrink-0 text-success" />}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full transition-all" style={{ width: `${data.mastery}%`, background: color }} />
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">{data.mastery}% mastery</span>
        {data.revisionStatus === "revised" && <span className="text-[10px] text-success">revised</span>}
      </div>
    </div>
  );
}

export const nodeTypes = { subject: SubjectNode, topic: TopicNode };
