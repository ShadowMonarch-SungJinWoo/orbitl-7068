import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  MarkerType,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { useSearch } from "wouter";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles,
  X,
  Loader2,
  BookOpen,
  Layers,
  ListChecks,
  Network,
  RefreshCw,
  Filter,
  Search,
  Focus,
  Maximize2,
} from "lucide-react";
import { useGraph, useExplainTopic, useUpdateTopic } from "../queries/topics";
import { nodeTypes } from "../components/graph/nodes";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Skeleton } from "../components/ui/skeleton";
import { useToast } from "../components/toast";

type GraphData = ReturnType<typeof useGraph>["data"];

const edgeStyle = {
  hierarchy: { stroke: "var(--border)", strokeWidth: 1.5 },
  related: { stroke: "#06B6D4", strokeWidth: 1.5, strokeDasharray: "5 4" },
  prerequisite: { stroke: "#F59E0B", strokeWidth: 2 },
} as const;

function layout(data: NonNullable<GraphData>): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 120, marginx: 40, marginy: 40 });

  data.nodes.forEach((n) => {
    g.setNode(n.id, { width: n.type === "subject" ? 180 : 160, height: n.type === "subject" ? 56 : 78 });
  });
  data.edges.forEach((e) => {
    if (e.type === "hierarchy") g.setEdge(e.source, e.target);
  });
  dagre.layout(g);

  const nodes: Node[] = data.nodes.map((n) => {
    const pos = g.node(n.id);
    return {
      id: n.id,
      type: n.type,
      position: { x: pos.x - pos.width / 2, y: pos.y - pos.height / 2 },
      data:
        n.type === "subject"
          ? { label: n.label, color: n.color }
          : { label: n.label, mastery: n.mastery, revisionStatus: (n as any).revisionStatus },
    };
  });

  const edges: Edge[] = data.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: e.type === "hierarchy" ? "default" : "smoothstep",
    animated: e.type === "prerequisite",
    style: edgeStyle[e.type],
    markerEnd: e.type !== "hierarchy" ? { type: MarkerType.ArrowClosed, color: edgeStyle[e.type].stroke } : undefined,
  }));

  return { nodes, edges };
}

const MASTERY_FILTERS = [
  { key: "all", label: "All" },
  { key: "weak", label: "Weak" },
  { key: "learning", label: "Learning" },
  { key: "mastered", label: "Mastered" },
] as const;
type MasteryKey = (typeof MASTERY_FILTERS)[number]["key"];

const band = (m: number): Exclude<MasteryKey, "all"> => (m >= 70 ? "mastered" : m >= 40 ? "learning" : "weak");

export default function GraphPage() {
  const { data, isLoading, refetch, isRefetching } = useGraph();
  const search = useSearch();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);
  const [masteryFilter, setMasteryFilter] = useState<MasteryKey>("all");
  const [query, setQuery] = useState("");
  const [isolate, setIsolate] = useState(false);
  const [version, setVersion] = useState(0);
  const flow = useRef<{ fitView: (o?: any) => void } | null>(null);

  useEffect(() => {
    const topicParam = new URLSearchParams(search).get("topic");
    if (topicParam) setSelected(topicParam);
  }, [search]);

  // Default to the first subject so the initial view is legible.
  const defaulted = useRef(false);
  useEffect(() => {
    if (defaulted.current || !data) return;
    defaulted.current = true;
    if (data.subjects.length > 1) setSubjectFilter(data.subjects[0].id);
  }, [data]);

  /** Undirected adjacency, so selecting a concept can light up everything touching it. */
  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const link = (a: string, b: string) => {
      if (!map.has(a)) map.set(a, new Set());
      map.get(a)!.add(b);
    };
    (data?.edges ?? []).forEach((e) => {
      link(e.source, e.target);
      link(e.target, e.source);
    });
    return map;
  }, [data]);

  useEffect(() => {
    if (!data) return;
    const keep = new Set(
      data.nodes
        .filter((n) => {
          if (subjectFilter && n.subjectId !== subjectFilter) return false;
          // Subjects always survive the mastery filter — they are the anchors.
          if (masteryFilter !== "all" && n.type === "topic" && band(n.mastery ?? 0) !== masteryFilter) return false;
          return true;
        })
        .map((n) => n.id),
    );
    const filtered = {
      ...data,
      nodes: data.nodes.filter((n) => keep.has(n.id)),
      edges: data.edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
    };
    const { nodes: n, edges: e } = layout(filtered);
    setNodes(n);
    setEdges(e);
    setVersion((v) => v + 1);
  }, [data, subjectFilter, masteryFilter, setNodes, setEdges]);

  // Selection, search and isolate all resolve to one pass of highlight/dim state so
  // they can never disagree with each other.
  useEffect(() => {
    const sel = selected ? `topic:${selected}` : null;
    const hood = sel ? new Set<string>([sel, ...(adjacency.get(sel) ?? [])]) : null;
    const q = query.trim().toLowerCase();

    setNodes((ns) =>
      ns.map((n) => {
        const label = String((n.data as { label?: string }).label ?? "").toLowerCase();
        const match = !!q && label.includes(q);
        const inHood = !hood || hood.has(n.id);
        const dimmed = (!!q && !match) || (!!hood && !inHood);
        return {
          ...n,
          hidden: isolate && !!hood && !inHood,
          data: { ...n.data, selected: n.id === sel, neighbour: !!hood && inHood && n.id !== sel, dimmed, match },
        };
      }),
    );

    setEdges((es) =>
      es.map((e) => {
        const active = !hood || (hood.has(e.source) && hood.has(e.target));
        return {
          ...e,
          hidden: isolate && !!hood && !active,
          style: { ...e.style, opacity: active ? 1 : 0.12 },
        };
      }),
    );
  }, [selected, query, isolate, adjacency, version, setNodes, setEdges]);

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    if (node.type === "topic") setSelected(node.id.replace("topic:", ""));
    else setSelected(null);
  }, []);

  // Double-click zooms to the concept and its neighbours — the "tell me about this
  // corner of the map" gesture.
  const onNodeDoubleClick = useCallback(
    (_: unknown, node: Node) => {
      const hood = new Set<string>([node.id, ...(adjacency.get(node.id) ?? [])]);
      flow.current?.fitView({ nodes: [...hood].map((id) => ({ id })), duration: 500, padding: 0.3 });
    },
    [adjacency],
  );

  // Escape clears whatever is focused, which is what every canvas UI trains you to expect.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (query) setQuery("");
      else if (selected) setSelected(null);
      else if (isolate) setIsolate(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [query, selected, isolate]);

  const matchCount = query.trim()
    ? nodes.filter((n) => String((n.data as { label?: string }).label ?? "").toLowerCase().includes(query.trim().toLowerCase())).length
    : 0;

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[70vh]" />
      </div>
    );
  }

  return (
    <div className="relative mx-auto flex h-[calc(100dvh-8rem)] max-w-[1600px] flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-surface shadow-soft">
            <Network className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Knowledge Graph</h1>
            <p className="text-sm text-muted-foreground">
              Click a concept to focus it · drag to rearrange · double-click to zoom in
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a concept…"
              className="h-9 w-44 rounded-xl border border-border bg-surface pl-8 pr-7 text-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1">
            {MASTERY_FILTERS.map((m) => (
              <button
                key={m.key}
                onClick={() => setMasteryFilter(m.key)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium ${masteryFilter === m.key ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1">
            <Filter className="ml-1.5 size-3.5 text-muted-foreground" />
            <button
              onClick={() => setSubjectFilter(null)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium ${!subjectFilter ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
            >
              All
            </button>
            {data?.subjects.map((s) => (
              <button
                key={s.id}
                onClick={() => setSubjectFilter(s.id)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium ${subjectFilter === s.id ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
              >
                {s.name}
              </button>
            ))}
          </div>
          <Button
            variant={isolate ? "default" : "outline"}
            size="sm"
            onClick={() => setIsolate((v) => !v)}
            title="Hide everything except the selected concept and its connections"
          >
            <Focus className="size-4" /> Isolate
          </Button>
          <Button variant="outline" size="icon" onClick={() => flow.current?.fitView({ duration: 400, padding: 0.15 })} title="Fit to view">
            <Maximize2 className="size-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isRefetching} title="Reload graph">
            <RefreshCw className={`size-4 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden rounded-2xl border border-border bg-surface/40">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onInit={(instance) => {
            flow.current = instance as unknown as { fitView: (o?: any) => void };
          }}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onPaneClick={() => setSelected(null)}
          nodesDraggable
          nodesConnectable={false}
          elevateNodesOnSelect
          selectionOnDrag
          panOnScroll
          zoomOnDoubleClick={false}
          fitView
          fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
          minZoom={0.15}
          maxZoom={2.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--border)" />
          <Controls className="!rounded-xl !border !border-border !bg-card !shadow-soft [&_button]:!border-border [&_button]:!bg-card [&_button]:!fill-foreground" />
          <MiniMap
            pannable
            zoomable
            className="!rounded-xl !border !border-border !bg-card"
            nodeColor={(n) => (n.type === "subject" ? (n.data as any).color : "var(--muted-foreground)")}
            maskColor="rgba(0,0,0,0.4)"
          />
        </ReactFlow>

        {/* Legend */}
        <div className="absolute left-4 top-4 z-10 flex flex-col gap-1.5 rounded-xl border border-border bg-card/90 p-3 text-xs backdrop-blur">
          <div className="flex items-center gap-2"><span className="h-0.5 w-5 bg-[#F59E0B]" /> Prerequisite</div>
          <div className="flex items-center gap-2"><span className="h-0.5 w-5 border-t border-dashed border-[#06B6D4]" /> Related</div>
          <div className="mt-1 flex items-center gap-2"><span className="size-2.5 rounded-full bg-success" /> Mastered</div>
          <div className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-warning" /> Learning</div>
          <div className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-destructive" /> Weak</div>
        </div>

        {/* Live counts, so filters and search never leave you guessing. */}
        <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2 rounded-xl border border-border bg-card/90 px-3 py-2 text-xs text-muted-foreground backdrop-blur">
          <span>{nodes.filter((n) => !n.hidden).length} nodes</span>
          <span className="h-3 w-px bg-border" />
          <span>{edges.filter((e) => !e.hidden).length} links</span>
          {query.trim() && (
            <>
              <span className="h-3 w-px bg-border" />
              <span className={matchCount ? "text-accent" : "text-destructive"}>{matchCount} match{matchCount === 1 ? "" : "es"}</span>
            </>
          )}
        </div>

        {nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="pointer-events-auto rounded-2xl border border-border bg-card/95 p-6 text-center backdrop-blur">
              <Network className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-semibold">Nothing to show</p>
              <p className="mt-1 text-xs text-muted-foreground">No concept matches these filters.</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-4"
                onClick={() => {
                  setMasteryFilter("all");
                  setSubjectFilter(null);
                  setQuery("");
                }}
              >
                Clear filters
              </Button>
            </div>
          </div>
        )}

        <AnimatePresence>
          {selected && <TopicPanel key={selected} topicId={selected} onClose={() => setSelected(null)} onSelect={setSelected} />}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ---- Side panel ----
import { useTopicDetail } from "../queries/topics";
import { Card, CardContent } from "../components/ui/card";
import { ProgressRing } from "../components/ui/progress-ring";

function TopicPanel({
  topicId,
  onClose,
  onSelect,
}: {
  topicId: string;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const { data, isLoading } = useTopicDetail(topicId);
  const explain = useExplainTopic();
  const updateTopic = useUpdateTopic();
  const { toast } = useToast();
  const [ai, setAi] = useState<{
    simple: string;
    advanced: string;
    examples: string[];
    commonMistakes: string[];
    formulas: string[];
    relatedConcepts: string[];
    prerequisites: string[];
  } | null>(null);
  const [tab, setTab] = useState<"simple" | "advanced" | "examples">("simple");

  useEffect(() => {
    setAi(null);
  }, [topicId]);

  const runExplain = (force = false) => {
    explain.mutate(
      { id: topicId, force },
      {
        onSuccess: (res) => setAi(res as any),
        onError: () => toast({ kind: "error", title: "AI explain failed", description: "Try again in a moment." }),
      },
    );
  };

  return (
    <motion.div
      initial={{ x: 420, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 420, opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 32 }}
      className="absolute right-0 top-0 z-20 flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-border bg-card p-5 shadow-soft"
    >
      <button onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
        <X className="size-4" />
      </button>

      {isLoading || !data ? (
        <div className="space-y-4"><Skeleton className="h-8 w-40" /><Skeleton className="h-24" /><Skeleton className="h-40" /></div>
      ) : (
        <>
          <div className="flex items-start gap-4 pr-8">
            <ProgressRing value={data.topic.mastery} size={72} stroke={7} />
            <div>
              <Badge variant="muted" className="mb-1">{data.subject?.name}</Badge>
              <h2 className="text-xl font-bold leading-tight">{data.topic.name}</h2>
              {data.topic.summary && <p className="mt-1 text-sm text-muted-foreground">{data.topic.summary}</p>}
            </div>
          </div>

          {/* Mastery slider */}
          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground">Mastery</span>
              <span className="font-semibold tabular-nums">{data.topic.mastery}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              defaultValue={data.topic.mastery}
              onMouseUp={(e) => updateTopic.mutate({ id: topicId, mastery: Number((e.target as HTMLInputElement).value) })}
              onTouchEnd={(e) => updateTopic.mutate({ id: topicId, mastery: Number((e.target as HTMLInputElement).value) })}
              className="w-full accent-primary"
            />
          </div>

          {/* Related resources */}
          <div className="mt-5 grid grid-cols-3 gap-2">
            <StatChip icon={BookOpen} label="Notes" value={data.notes.length} />
            <StatChip icon={Layers} label="Cards" value={data.flashcards.length} />
            <StatChip icon={ListChecks} label="Quizzes" value={data.quizzes.length} />
          </div>

          {(data.prerequisites.length > 0 || data.related.length > 0) && (
            <div className="mt-5 space-y-2">
              {data.prerequisites.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-warning">Prerequisites</p>
                  <div className="flex flex-wrap gap-1.5">
                    {data.prerequisites.map((t) => (
                      <button key={t.id} onClick={() => onSelect(t.id)} title={`Jump to ${t.name}`}>
                        <Badge variant="warning" className="cursor-pointer hover:opacity-80">{t.name}</Badge>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {data.related.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-accent">Related</p>
                  <div className="flex flex-wrap gap-1.5">
                    {data.related.map((t) => (
                      <button key={t.id} onClick={() => onSelect(t.id)} title={`Jump to ${t.name}`}>
                        <Badge variant="accent" className="cursor-pointer hover:opacity-80">{t.name}</Badge>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* AI explain */}
          <Card className="mt-5 border-accent/30 bg-accent/5">
            <CardContent className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-accent" />
                  <span className="text-sm font-semibold">Explain with AI</span>
                </div>
                {ai && (
                  <button onClick={() => runExplain(true)} className="text-xs text-muted-foreground hover:text-foreground">
                    <RefreshCw className={`inline size-3 ${explain.isPending ? "animate-spin" : ""}`} /> Regenerate
                  </button>
                )}
              </div>

              {!ai && !explain.isPending && (
                <Button size="sm" className="w-full" onClick={() => runExplain(false)}>
                  <Sparkles className="size-4" /> Break this concept down for me
                </Button>
              )}
              {explain.isPending && (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Thinking through {data.topic.name}...
                </div>
              )}
              {ai && (
                <div>
                  <div className="mb-2 flex gap-1 rounded-lg bg-surface p-1">
                    {(["simple", "advanced", "examples"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`flex-1 rounded-md px-2 py-1 text-xs font-medium capitalize ${tab === t ? "bg-accent/20 text-accent" : "text-muted-foreground"}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  {tab !== "examples" && (
                    <p className="text-sm leading-relaxed text-card-foreground">
                      {tab === "simple" ? ai.simple : ai.advanced}
                    </p>
                  )}
                  {tab === "examples" && (
                    <ul className="space-y-2">
                      {ai.examples.map((ex, i) => (
                        <li key={i} className="rounded-lg bg-surface p-2.5 text-xs leading-relaxed text-card-foreground">{ex}</li>
                      ))}
                    </ul>
                  )}
                  {tab === "advanced" && ai.formulas?.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {ai.formulas.map((f, i) => (
                        <p key={i} className="rounded-lg bg-surface p-2 font-mono text-xs text-accent">{f}</p>
                      ))}
                    </div>
                  )}
                  {ai.commonMistakes?.length > 0 && (
                    <div className="mt-3">
                      <p className="mb-1 text-xs font-medium text-warning">Common mistakes</p>
                      <ul className="space-y-1">
                        {ai.commonMistakes.map((m, i) => (
                          <li key={i} className="flex gap-2 text-xs text-muted-foreground"><span className="text-warning">•</span> {m}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </motion.div>
  );
}

function StatChip({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-border bg-surface p-2.5">
      <Icon className="size-4 text-muted-foreground" />
      <span className="text-base font-bold tabular-nums">{value}</span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}
