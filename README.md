# sandbox-app-template

Monorepo: Bun workspaces + Turborepo.

## Commands

The root `package.json` scripts are the external contract — deployment and tooling only ever
call these named verbs. Never rename or remove them; their internals are free to change.

| Command | Purpose |
| --- | --- |
| `bun run dev` / `dev:desktop` / `dev:mobile` | Start dev server per platform |
| `bun run build` | Build all packages |
| `bun run start` | Start (or restart) the production server under pm2 (idempotent) |
| `bun run stop` | Stop the production server |
| `bun run lint` | Releases + conventions + oxlint |
| `bun run typecheck` | Typecheck all packages |
| `bun run db:generate` / `db:migrate` / `db:push` | Database workflows |

Fixed conventions the contract relies on: server listens on `$PORT` (default `4200`), health
endpoint at `/api/health`, secrets in the root `.env`, pm2 app name `web-app`.

Scripts prefixed `internal:` are template maintenance helpers, not part of the contract.

## Project Structure

```
.env                         Secrets (gitignored), loaded via Vite's loadEnv
packages/
  web/                       Unified server (API + web frontend via Vite)
    vite.config.ts           Vite 7 config — loads .env, sets port, registers plugins
    index.html               Frontend HTML entry
    vite/__plugins/
      hono-dev-plugin.ts     Intercepts /api/* in dev, forwards to Hono via SSR
      runable-analytics-plugin.ts
    src/
      api/
        __core/
          app.ts             oRPC base + createApp() Hono mount (/api/rpc/*, /api/health) — core, do not edit
        routes/              Feature routers, one file per feature (max 500 lines each)
        index.ts             Composes feature routers + AppRouter export
        database/
          __client.ts        Database client (Turso/LibSQL) — template-managed
          index.ts           Re-exports db from __client
          schema.ts          Drizzle schema
      web/
        __main.tsx           Bootstrap (mount + Router) — template-managed
        main.tsx             Entry (composition only)
        app.tsx              Root component + Wouter routing
        pages/               Page components
        queries/             Query/mutation options (one file per feature)
        components/          UI components
        hooks/
          use-desktop.ts     Desktop detection
        lib/
          api.ts             Typed API client (oRPC + TanStack Query utils)
          desktop.ts         Electron API types
          utils.ts           Shared utilities
        styles.css           Tailwind CSS entry
  mobile/                    Expo + React Native + expo-router (thin client, no server/db)
    app/                     File-based routing
      (tabs)/                Default themed tab navigator + screens
    constants/theme.ts       Color tokens (light/dark) + Fonts — recolor to brand
    hooks/                   use-colors, use-color-scheme (+ .web)
    queries/                 Data hooks (useX), one file per feature
    lib/
      api.ts                 Typed API client (oRPC → @template/web)
  desktop/                   Electron shell (loads web app from server)
    electron/
      main.ts                Editable main process (window, lifecycle) + managed deep-link attach
      ipc.ts                 Starter IPC handlers (dialog/fs/notification/window) — editable
      preload.ts             contextBridge API + managed-auth bridge
    vite.config.ts           Vite config
```

## Environment Variables

Secrets and credentials live in `.env` at the project root (gitignored). Vite's `loadEnv` loads them into `process.env` at dev/build time (configured in `packages/web/vite.config.ts`). In API code (Hono), use `process.env.YOUR_VAR`. In browser code, only `VITE_`-prefixed vars are exposed via `import.meta.env.VITE_YOUR_VAR`. Drizzle scripts use `bun --env-file=../../.env` to load env vars directly.

## Desktop UI

The desktop app has no separate renderer by default. It loads the web app from `packages/web`; desktop-specific UI should live in `packages/web/src/web/` and be gated with `useDesktop()` / `window.electronAPI`. Keep `packages/desktop` for Electron window setup, menus/tray/shortcuts, IPC handlers, native OS APIs, and packaging. Only add a separate desktop renderer when the product intentionally needs a different desktop-only UI architecture.

## Servers

Dev servers are started and managed automatically — no need to run them manually.

## Database

```sh
cd packages/web
bun run db:push        # Push schema to database
bun run db:generate    # Generate migration files
bun run db:migrate     # Run migrations
```

## Deployment gates (and why `bun run lint` is not one)

Verified against this repo on 2026-09-26.

**What actually gates a deploy:**

| Step | Command | Status |
| --- | --- | --- |
| Build | `bun run build` → `turbo build` → `tsc --noEmit && vite build` | passing, 0 type errors |
| Serve | `bun run start` → `pm2` → `packages/web/src/__server.ts` | passing |
| Tests | `bun run test` | 36 pass, 0 fail |

Type safety **is** enforced at deploy time, because `packages/web`'s `build` script
runs `tsc --noEmit` before `vite build`. A type error fails the build and therefore
the deploy.

**`bun run lint` is not in the deploy path.** Evidence:

- No CI configuration exists in the repo — no `.github/workflows`, `.gitlab-ci.yml`,
  `Dockerfile`, `vercel.json`, `netlify.toml`, `fly.toml`, or `render.yaml`.
- No git hooks and no `prebuild` / `prestart` / `prepare` lifecycle scripts that
  could invoke it indirectly.
- In `turbo.json`, `build` declares `dependsOn: ["^build"]` only. `lint` is a
  separate, independent task that `build` never triggers.
- `lint` appears in `.runable/releases.json` only under a template release's
  `verification_commands` — that is a **template-migration** check, not a
  deployment step.

Publishing, custom domains, and environment configuration are handled by the
Runable platform UI, which builds and serves the app; it does not run this repo's
convention linter.

### The two known `bun run lint` failures are stale-rule false positives

`bun run lint` currently reports 2 errors from `konsistent.json`. Both are
deliberately left unfixed — each rule contradicts the template it is meant to
guard, so "fixing" them would mean breaking working behaviour or editing a
template guard:

1. **`mobile-layout-keeps-template-providers`** requires
   `packages/mobile/app/_layout.tsx` to import `../components/ErrorBoundary`.
   The template only ships `components/__ErrorBoundary.tsx` (hash-protected in
   `.runable/protected-files.json`), and the app skill's own canonical example
   imports `../components/__ErrorBoundary` — which is exactly what the layout
   does. The rule's expected path is stale; the import is correct.

2. **`web-main-uses-template-bootstrap`** requires a static `./__main` import in
   `packages/web/src/web/main.tsx`. That file uses `await import("./__main")`,
   which the rule's static analysis does not count. The dynamic import is
   **required**: `await authClient.managedAuth.handleRedirect()` must complete
   before the app mounts, and a static import would be hoisted and run first,
   breaking the managed sign-in redirect.

If a future pipeline ever does gate on `lint`, fix these in `konsistent.json`
(correct rule 1's path to `__ErrorBoundary`; make rule 2 accept a dynamic import)
rather than changing `_layout.tsx` or `main.tsx`.
