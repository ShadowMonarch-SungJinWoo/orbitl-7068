import { useState } from "react";
import { Link } from "wouter";
import { Search, Sun, Moon, Flame, Zap, LogOut, Menu, RefreshCw } from "lucide-react";
import { authClient } from "../../lib/auth";
import { useTheme } from "../theme";
import { useCommandPalette } from "../command-palette";
import { useProfile } from "../../queries/game";
import { useRefreshAll } from "../../lib/use-refresh";
import { ProgressRing } from "../ui/progress-ring";

export function Topbar({ onMenu }: { onMenu?: () => void }) {
  const { theme, toggle } = useTheme();
  const { open } = useCommandPalette();
  const { data: session } = authClient.useSession();
  const profile = useProfile();
  const { refresh, isRefreshing } = useRefreshAll();
  const [menuOpen, setMenuOpen] = useState(false);

  const p = profile.data;
  const pct = p ? Math.round((p.xpIntoLevel / Math.max(1, p.xpForNext)) * 100) : 0;
  const name = session?.user?.name ?? session?.user?.email ?? "Student";
  const initial = name.charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/70 px-4 backdrop-blur-xl md:px-6">
      <button onClick={onMenu} className="rounded-lg p-2 text-muted-foreground hover:bg-muted md:hidden">
        <Menu className="size-5" />
      </button>

      <button
        onClick={open}
        className="group flex h-9 w-full max-w-md items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm text-muted-foreground transition-colors hover:border-ring/50"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search anything...</span>
        <kbd className="hidden items-center gap-0.5 rounded-md border border-border px-1.5 py-0.5 text-[10px] sm:flex">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-2">
        {p && (
          <div className="hidden items-center gap-3 rounded-xl border border-border bg-surface px-3 py-1.5 sm:flex">
            <div className="flex items-center gap-1.5" title={`${p.streak} day streak`}>
              <Flame className="size-4 text-warning" />
              <span className="text-sm font-semibold tabular-nums">{p.streak}</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-1.5" title={`${p.xp} XP`}>
              <Zap className="size-4 text-accent" />
              <span className="text-sm font-semibold tabular-nums">{p.xp}</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <ProgressRing value={pct} size={30} stroke={4} showValue={false} color="var(--primary)" />
            <span className="text-xs font-medium text-muted-foreground">Lv {p.level}</span>
          </div>
        )}

        <button
          onClick={() => void refresh()}
          disabled={isRefreshing}
          className="grid size-9 place-items-center rounded-xl border border-border bg-surface text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
          aria-label="Refresh data"
          title="Refresh data — keeps anything you have in progress"
        >
          <RefreshCw className={`size-[18px] ${isRefreshing ? "animate-spin" : ""}`} />
        </button>

        <button
          onClick={toggle}
          className="grid size-9 place-items-center rounded-xl border border-border bg-surface text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
        </button>

        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="grid size-9 place-items-center rounded-xl gradient-brand text-sm font-semibold text-white shadow-soft"
          >
            {initial}
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-11 z-20 w-52 overflow-hidden rounded-xl border border-border bg-card shadow-soft">
                <div className="border-b border-border p-3">
                  <p className="truncate text-sm font-semibold">{name}</p>
                  <p className="truncate text-xs text-muted-foreground">{session?.user?.email}</p>
                </div>
                <Link
                  to="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="block px-3 py-2.5 text-sm hover:bg-muted"
                >
                  Settings
                </Link>
                <button
                  onClick={() => authClient.signOut()}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-destructive hover:bg-muted"
                >
                  <LogOut className="size-4" /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
