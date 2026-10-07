import { useState } from "react";
import { Link, useLocation } from "wouter";
import { AnimatePresence, motion } from "motion/react";
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
  X,
} from "lucide-react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { cn } from "@/lib/utils";
import { Logo } from "../logo";

const MOBILE_NAV = [
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

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [loc] = useLocation();

  return (
    <div className="app-bg flex min-h-dvh w-full text-foreground">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setDrawer(true)} />
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {drawer && (
          <motion.div
            className="fixed inset-0 z-50 md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDrawer(false)} />
            <motion.div
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: "spring", stiffness: 300, damping: 32 }}
              className="absolute left-0 top-0 flex h-full w-72 flex-col border-r border-border bg-surface"
            >
              <div className="flex h-16 items-center justify-between px-4">
                <div className="flex items-center gap-2.5">
                  <Logo size={36} />
                  <p className="text-sm font-bold">OrbitL</p>
                </div>
                <button onClick={() => setDrawer(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted">
                  <X className="size-5" />
                </button>
              </div>
              <nav className="flex-1 space-y-1 overflow-y-auto p-3">
                {MOBILE_NAV.map((n) => {
                  const Icon = n.icon;
                  const active = n.to === "/" ? loc === "/" : loc.startsWith(n.to);
                  return (
                    <Link
                      key={n.to}
                      to={n.to}
                      onClick={() => setDrawer(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
                        active ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      <Icon className="size-[18px]" />
                      {n.label}
                    </Link>
                  );
                })}
              </nav>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
