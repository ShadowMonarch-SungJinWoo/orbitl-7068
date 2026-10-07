import { Link, useLocation } from "wouter";
import { motion } from "motion/react";
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
  ShieldCheck,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "../logo";
import { useAdminWhoami } from "../../queries/admin";

const NAV = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard },
  { label: "Knowledge Graph", to: "/graph", icon: Network, flag: true },
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
];

function isActive(loc: string, to: string) {
  if (to === "/") return loc === "/";
  return loc === to || loc.startsWith(to + "/");
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const [loc] = useLocation();
  // The server answers NOT_FOUND to non-admins, so a successful call is the
  // only thing that reveals the operations entry.
  const { data: admin } = useAdminWhoami();

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 248 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="sticky top-0 z-30 hidden h-dvh shrink-0 flex-col border-r border-border bg-surface/60 backdrop-blur-xl md:flex"
    >
      <div className="flex h-16 items-center gap-2.5 px-4">
        <Logo size={36} />
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight">OrbitL</p>
            <p className="truncate text-[10px] text-muted-foreground">Your learning OS</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {NAV.map((n) => {
          const Icon = n.icon;
          const active = isActive(loc, n.to);
          return (
            <Link
              key={n.to}
              to={n.to}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                collapsed && "justify-center px-0",
              )}
            >
              {active && (
                <motion.span
                  layoutId="side-active"
                  className="absolute inset-0 rounded-xl bg-primary/12"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <Icon className="relative size-[18px] shrink-0" />
              {!collapsed && <span className="relative truncate">{n.label}</span>}
              {!collapsed && n.flag && (
                <span className="relative ml-auto rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-semibold text-accent">
                  CORE
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        {admin?.admin && (
          <Link
            to="/admin"
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              isActive(loc, "/admin")
                ? "bg-primary/12 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
              collapsed && "justify-center px-0",
            )}
          >
            <ShieldCheck className="size-[18px] shrink-0" />
            {!collapsed && "Operations"}
          </Link>
        )}
        <Link
          to="/settings"
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            collapsed && "justify-center px-0",
          )}
        >
          <Settings className="size-[18px] shrink-0" />
          {!collapsed && "Settings"}
        </Link>
        <button
          onClick={onToggle}
          className={cn(
            "mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            collapsed && "justify-center px-0",
          )}
        >
          <ChevronLeft className={cn("size-[18px] shrink-0 transition-transform", collapsed && "rotate-180")} />
          {!collapsed && "Collapse"}
        </button>
      </div>
    </motion.aside>
  );
}
