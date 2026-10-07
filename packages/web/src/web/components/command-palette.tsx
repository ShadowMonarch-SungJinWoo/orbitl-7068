import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Command } from "cmdk";
import { AnimatePresence, motion } from "motion/react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Network,
  BookOpen,
  StickyNote,
  Layers,
  ListChecks,
  CalendarClock,
  Timer,
  BarChart3,
  Users,
  Trophy,
  MessageSquareHeart,
  Settings,
  FileText,
  Hash,
  Search,
} from "lucide-react";
import { orpc } from "../lib/api";

const CmdContext = createContext<{ open: () => void }>({ open: () => {} });
export const useCommandPalette = () => useContext(CmdContext);

const NAV = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard },
  { label: "Knowledge Graph", to: "/graph", icon: Network },
  { label: "Subjects", to: "/subjects", icon: BookOpen },
  { label: "Notes", to: "/notes", icon: StickyNote },
  { label: "Flashcards", to: "/flashcards", icon: Layers },
  { label: "Quizzes", to: "/quizzes", icon: ListChecks },
  { label: "Assignments", to: "/assignments", icon: CalendarClock },
  { label: "Focus Mode", to: "/focus", icon: Timer },
  { label: "Insights", to: "/insights", icon: BarChart3 },
  { label: "Study Groups", to: "/groups", icon: Users },
  { label: "Achievements", to: "/achievements", icon: Trophy },
  { label: "Reviews", to: "/reviews", icon: MessageSquareHeart },
  { label: "Settings", to: "/settings", icon: Settings },
];

const typeIcon: Record<string, typeof FileText> = {
  subject: BookOpen,
  concept: Hash,
  note: FileText,
  flashcard: Layers,
  quiz: ListChecks,
  assignment: CalendarClock,
};

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const search = useQuery(orpc.insights.searchIndex.queryOptions({ enabled: open }));
  const items = useMemo(() => search.data ?? [], [search.data]);

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  return (
    <CmdContext.Provider value={{ open: () => setOpen(true) }}>
      {children}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[120] flex items-start justify-center p-4 pt-[12vh]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -8 }}
              transition={{ type: "spring", stiffness: 340, damping: 30 }}
              className="relative z-10 w-full max-w-xl"
            >
              <Command
                className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft"
                loop
              >
                <div className="flex items-center gap-2 border-b border-border px-4">
                  <Search className="size-4 text-muted-foreground" />
                  <Command.Input
                    autoFocus
                    placeholder="Search or jump to..."
                    className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                  <kbd className="rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">ESC</kbd>
                </div>
                <Command.List className="max-h-[52vh] overflow-y-auto p-2">
                  <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
                    No results found.
                  </Command.Empty>
                  <Command.Group heading="Navigate" className="mb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
                    {NAV.map((n) => {
                      const Icon = n.icon;
                      return (
                        <Command.Item
                          key={n.to}
                          value={`nav ${n.label}`}
                          onSelect={() => go(n.to)}
                          className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm data-[selected=true]:bg-primary/15 data-[selected=true]:text-primary"
                        >
                          <Icon className="size-4" />
                          {n.label}
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                  {items.length > 0 && (
                    <Command.Group heading="Your library" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
                      {items.map((it) => {
                        const Icon = typeIcon[it.type] ?? FileText;
                        return (
                          <Command.Item
                            key={`${it.type}-${it.id}`}
                            value={`${it.title} ${it.type} ${it.id}`}
                            onSelect={() => go(it.to)}
                            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm data-[selected=true]:bg-primary/15 data-[selected=true]:text-primary"
                          >
                            <Icon className="size-4 text-muted-foreground" />
                            <span className="flex-1 truncate">{it.title}</span>
                            <span className="text-[10px] uppercase text-muted-foreground">{it.type}</span>
                          </Command.Item>
                        );
                      })}
                    </Command.Group>
                  )}
                </Command.List>
              </Command>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </CmdContext.Provider>
  );
}
