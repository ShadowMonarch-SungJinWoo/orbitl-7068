import { useGraph } from "../queries/topics";

/** Shared <select> of all concepts (topics) across subjects. */
export function TopicPicker({
  value,
  onChange,
  placeholder = "Select a concept…",
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const { data } = useGraph();
  const topics = (data?.nodes ?? []).filter((n) => n.type === "topic") as {
    topicId: string;
    label: string;
  }[];
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${className}`}
    >
      <option value="">{placeholder}</option>
      {topics.map((t) => (
        <option key={t.topicId} value={t.topicId}>
          {t.label}
        </option>
      ))}
    </select>
  );
}

export function SubjectSelect({
  value,
  onChange,
  options,
  placeholder = "No subject",
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; name: string }[];
  placeholder?: string;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${className}`}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
