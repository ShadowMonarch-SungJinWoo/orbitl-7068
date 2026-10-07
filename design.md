# OrbitL — Design System

Premium SaaS aesthetic inspired by Notion, Linear, Arc, Stripe, Vercel and Apple.
Dark-mode-first, optional light mode. Calm, dense-but-breathable, fast, "alive".

## Brand

OrbitL — an AI-powered academic operating system. Logo mark: an "OL" monogram where the
O is a planet ringed by an orbit sweeping through to the L, in a violet→blue→cyan gradient
with a small four-point sparkle. Shipped as `/images/orbitl-logo.png` and rendered through
`components/logo.tsx` (`<Logo size={n} />`), which sets it on a subtle translucent tile so
the darker lower arc of the mark stays legible on both dark and light surfaces.
Never re-tint the mark or place it on the brand gradient — it carries its own gradient.

## Color (dark, default)

CSS variables live in `styles.css`. Tailwind maps them via `@theme`.

- Background `#080B1A` — deep midnight navy app canvas
- Surface `#0E1226` — sidebar, top nav, panels
- Card `#141A33` — cards, popovers, inputs
- Ambience: every page root uses `.app-bg`, a fixed layer combining a `#101A3A` indigo glow (top-left), a `#17102D` violet glow (top-right), a soft bottom bloom, a `160deg` navy gradient, and a 56px grid at ~3.8% opacity. Never use bright blue page backgrounds — blue and violet appear only as low-opacity ambience, accents, and gradients.
- Border `rgba(255,255,255,0.08)`
- Primary `#2563EB` (blue) — primary actions, active nav
- Secondary `#4F46E5` (indigo) — gradients, secondary emphasis
- Accent `#06B6D4` (cyan) — highlights, links, focus
- Success `#22C55E`, Warning `#F59E0B`, Error `#EF4444`
- Text `#F9FAFB`, Muted text `#94A3B8`

Signature gradient: `linear-gradient(135deg, #2563EB, #4F46E5 55%, #06B6D4)`.

### Light mode
- Background `#F8FAFC`, Surface `#FFFFFF`, Card `#FFFFFF`, Border `rgba(15,23,42,0.08)`
- Text `#0B1220`, Muted `#64748B`. Same accent hues.

### Mastery scale (knowledge graph + progress)
- Mastered `#22C55E`, Strong `#06B6D4`, Learning `#2563EB`, Weak `#F59E0B`, Untouched `#64748B`

## Typography

- Font: **Inter** (self-hosted via fontsource-style CDN link in index.html; fallback system-ui).
- Display: 32–48px / weight 700 / tight tracking (-0.02em).
- Heading: 20–24px / 600. Body: 14–15px / 400–500. Caption: 12–13px / muted.
- Numbers/stats use tabular-nums.

## Shape & depth

- Radius: cards/panels 16px, buttons/inputs 12px, pills 999px.
- Shadows: soft, low-opacity. `0 1px 2px rgba(0,0,0,.3)` base; `0 8px 30px rgba(0,0,0,.35)` for popovers/modals.
- Glassmorphism on top nav & command palette: `backdrop-blur-xl` + translucent surface + subtle border.

## Layout

- Collapsible left **sidebar** (72px collapsed / 248px expanded): logo, nav (Dashboard, Knowledge Graph, Subjects, Notes, Flashcards, Quizzes, Assignments, Focus, Insights, Groups, Achievements), user block at bottom.
- Sticky **top nav**: page title/breadcrumb, global search trigger (Ctrl+K), streak flame, XP/level chip, theme toggle, avatar.
- Content max-width 1200px, generous padding (24–32px), 12/24px grid gaps.
- Fully responsive: sidebar collapses to icons then to a drawer on mobile.

## Components & UX

- Buttons: primary (gradient), secondary (surface + border), ghost. Hover lift + subtle scale, ripple on click.
- Cards: subtle border, hover raises shadow + 2–4px lift; optional tilt on interactive stat cards.
- Progress rings (SVG) for readiness/mastery; animated on mount.
- Charts via Recharts, themed to palette, animated draw-in.
- Skeleton loaders for every async view. Toasts (custom) top-right, auto-dismiss.
- Command palette (cmdk) via Ctrl+K: fuzzy search across everything + commands, keyboard nav.
- Motion: `motion` (Framer) — staggered page-load reveals, layout transitions, elastic modals, confetti on achievements. Respect `prefers-reduced-motion`.
- Empty states: friendly illustration glyph + one-line copy + primary CTA.

## Accessibility

- Keyboard nav everywhere, visible focus ring (accent), ARIA labels, high-contrast-safe text, reduced-motion support, adjustable base font size in settings.
