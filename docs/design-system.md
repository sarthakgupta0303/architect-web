# Architect 2.0 — Design System

Source of truth for every color, font, spacing value and component style. Code must reference **tokens** (CSS variables in `styles/tokens.css`, mapped to Tailwind in `tailwind.config.ts`) — never raw hex values.

| Decision | Choice |
|---|---|
| Personality | Pro builder tool — dark-first, calm, dense but friendly (Linear/Vercel class). Works for developers (Code mode) and non-technical builders (Build mode). |
| Brand | Lyzr-style purple on deep navy. Interim palette until exact Lyzr brand hex values are supplied; only `styles/tokens.css` changes when they are. |
| Fonts | Inter (UI), JetBrains Mono (code, terminal, IDs, keys) |
| Default theme | Dark; light theme fully supported (`<html class="dark">` toggled by `next-themes`) |
| Accessibility | WCAG 2.1 AA — all text/background token pairs below ≥ 4.5:1 (verified) |

---

## 1. Color tokens

Tokens are RGB triplets so Tailwind opacity modifiers work (`bg-primary/10`).

### 1.1 Surface and text

| Token | Tailwind | Dark | Light | Use |
|---|---|---|---|---|
| `--color-bg` | `bg-bg` | `#0B0A16` | `#FAFAFD` | Page background |
| `--color-surface` | `bg-surface` | `#141226` | `#FFFFFF` | Cards, panels, modals, inputs |
| `--color-surface-2` | `bg-surface-2` | `#1C1A33` | `#F3F1FA` | Hover rows, nested panels, code blocks, sidebars |
| `--color-border` | `border-border` | `#2A2745` | `#E4E1F0` | Hairlines, input borders, dividers |
| `--color-fg` | `text-fg` | `#EEEDF7` | `#15122B` | Primary text (16.9:1 / 17.5:1) |
| `--color-muted` | `text-muted` | `#A29EC4` | `#5E5A7A` | Secondary text, placeholders, captions (7.7:1 / 6.3:1) |

### 1.2 Brand

| Token | Tailwind | Dark | Light | Use |
|---|---|---|---|---|
| `--color-primary` | `bg-primary` | `#7B3FE4` | `#6D28D9` | Primary buttons, active states, focus rings, selected nodes |
| `--color-primary-fg` | `text-primary-fg` | `#FFFFFF` | `#FFFFFF` | Text on primary (5.7:1 / 7.1:1) |
| `--color-primary-text` | `text-primary-text` | `#B8A1FF` | `#6D28D9` | Brand-colored text/links on bg (9.0:1 / 6.8:1) |
| `--color-accent` | `text-accent` | `#E879F9` | `#C026D3` | Gradient end, highlights, "AI" sparkle icons — never for body text |

Brand gradient (hero headings, logo mark, empty-state illustrations only): `bg-gradient-to-r from-primary-text to-accent`.

### 1.3 Semantic

| Token | Dark | Light | Meaning |
|---|---|---|---|
| `--color-success` | `#4ADE80` | `#15803D` | Live, passed, synced, connected |
| `--color-warning` | `#FBBF24` | `#B45309` | Needs attention, changes to push, missing secret |
| `--color-danger` | `#F87171` | `#B91C1C` | Error, failed, conflict, destructive actions |
| `--color-info` | `#60A5FA` | `#1D4ED8` | Informational banners, running/in-progress |

Semantic colors are used for text/icons and as 10–15% tinted backgrounds (`bg-danger/10 text-danger`). Status is never conveyed by color alone — always pair with an icon or label.

### 1.4 Status mapping (used everywhere a status appears)

| Status | Token | Icon (lucide) | Label |
|---|---|---|---|
| draft | muted | `Circle` | Draft |
| building / running / queued | info | `Loader2` (spinning) | Building… |
| preview | primary-text | `Eye` | Preview |
| live / succeeded / connected / synced | success | `CheckCircle2` | Live |
| needs attention / changes to push | warning | `AlertTriangle` | Needs attention |
| failed / error / conflict | danger | `XCircle` | Failed |

---

## 2. Typography

| Token | Font | Size / line-height | Weight | Tailwind | Use |
|---|---|---|---|---|---|
| display | Inter | 56 / 60 (mobile 36 / 40) | 700, tracking −0.02em | `text-4xl sm:text-6xl font-bold tracking-tight` | Marketing hero only |
| h1 | Inter | 30 / 36 | 600 | `text-3xl font-semibold` | Page titles |
| h2 | Inter | 20 / 28 | 600 | `text-xl font-semibold` | Section titles |
| h3 | Inter | 16 / 24 | 600 | `text-base font-semibold` | Card titles, panel headers |
| body | Inter | 14 / 20 | 400 | `text-sm` | Default app text |
| body-lg | Inter | 16 / 24 | 400 | `text-base` | Marketing, empty states, prompts |
| caption | Inter | 12 / 16 | 500 | `text-xs font-medium` | Labels, badges, metadata |
| code | JetBrains Mono | 13 / 20 | 400 | `font-mono text-[13px]` | Editor, terminal, IDs, keys, env var names |

Fonts load through `next/font` (`Inter`, `JetBrains_Mono`) exposed as `--font-sans` and `--font-mono`. App UI defaults to `text-sm`.

---

## 3. Spacing, radius, elevation, layout

- **Spacing scale** (Tailwind default 4 px base): use only `1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24`. Panel padding `p-4`; card padding `p-5`; page gutters `px-4 sm:px-6`; form field gap `gap-4`; section gap `mt-12`/`mt-20` (marketing).
- **Radius:** `rounded-md` 6 px (inputs inside toolbars, badges), `rounded-lg` 8 px (buttons small, menu items), `rounded-xl` 14 px (inputs, cards in app), `rounded-2xl` 20 px (modals, marketing cards, prompt box), `rounded-full` (pill buttons, chips, avatars).
- **Elevation:** flat by default (borders, not shadows). `shadow-popover` = `0 8px 30px -8px rgb(0 0 0 / 0.5)` for menus/popovers/modals only. Prompt box glow: `shadow-glow` = `0 20px 60px -20px rgb(var(--color-primary) / 0.45)`.
- **Layout zones:**
  - Marketing: max width `max-w-6xl`, centered.
  - App shell: left sidebar 240 px (collapsible to 64 px), content `max-w-7xl` with `px-6 py-8`.
  - Project workspace: top bar 52 px; Build mode chat panel 360 px (min 300, max 520, resizable); inspector drawer 320 px; Code mode activity bar 48 px, explorer 260 px, bottom panel 240 px.
- **Breakpoints:** Tailwind defaults. Dashboard, preview and Studio work from 375 px; the project workspace requires ≥ 1280 px and otherwise shows a read-only notice.

---

## 4. Components

All components live in `components/ui/` (primitives) and use `cn()` for class merging. Every interactive element has a visible focus ring: `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`.

### 4.1 Button (`components/ui/Button.tsx`)

| Variant | Classes (plus shared base) | Use |
|---|---|---|
| primary | `bg-primary text-primary-fg hover:brightness-110` | One per view: main action |
| secondary | `bg-surface-2 text-fg border border-border hover:border-fg/40` | Secondary actions |
| ghost | `text-muted hover:text-fg hover:bg-surface-2` | Toolbars, icon buttons |
| danger | `bg-danger text-white hover:brightness-110` (light) / `bg-danger/15 text-danger` (dark) | Destructive confirm |
| link | `text-primary-text underline-offset-4 hover:underline` | Inline |

Sizes: `sm` h-8 px-3 text-xs rounded-lg · `md` h-10 px-4 text-sm rounded-xl · `lg` h-12 px-6 text-base rounded-full (marketing). Base: `inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none`. `loading` prop replaces the leading icon with a spinning `Loader2` and sets `aria-busy`.

### 4.2 Inputs (`Input`, `Textarea`, `Select`, `Label`, `FieldError`)

- Base: `h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-fg placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30`.
- Error: `border-danger focus:ring-danger/30` and `<FieldError>` below in `text-xs text-danger`, linked with `aria-describedby`.
- Label above field, `text-sm font-medium`, required fields not marked with color only.

### 4.3 Card (`Card`)

`rounded-xl border border-border bg-surface p-5`; interactive cards add `transition hover:border-primary/60 hover:-translate-y-0.5` and are rendered as `<a>`/`<button>`.

### 4.4 Badge / Status pill (`Badge`, `StatusPill`)

`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium` with tone classes `bg-{token}/12 text-{token}`; `StatusPill` uses the §1.4 mapping.

### 4.5 Chip

`rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm text-muted hover:border-primary hover:text-fg`; selected: `border-primary bg-primary/10 text-fg`.

### 4.6 Table

Header `text-xs font-medium uppercase tracking-wide text-muted`, rows `h-12 border-b border-border hover:bg-surface-2`, numbers right-aligned `tabular-nums`, sticky header in scroll containers.

### 4.7 Modal / Dialog, Popover, Toast

- Dialog: overlay `bg-black/60 backdrop-blur-sm`; panel `rounded-2xl border border-border bg-surface p-6 shadow-popover w-full max-w-md` (lg: `max-w-2xl`); focus trapped; `Esc` closes.
- Toast (bottom-right): `rounded-xl border border-border bg-surface-2 px-4 py-3 shadow-popover`; tone icon; auto-dismiss 5 s; undo actions 10 s.

### 4.8 Skeleton, EmptyState, ErrorState

- Skeleton: `animate-pulse rounded-md bg-surface-2` matching final layout dimensions.
- EmptyState: centered, icon in `rounded-2xl bg-primary/10 p-3 text-primary-text`, h3 title, body text-muted (max 48 ch), one primary action.
- ErrorState: `AlertTriangle` in danger tone, plain-language message, "Try again" secondary button; Code mode may show a collapsible technical detail block in mono.

### 4.9 App-specific

- **Prompt composer:** `rounded-2xl border border-border bg-surface p-3 shadow-glow focus-within:border-primary`, textarea `text-base`, bottom row with hint (text-xs muted) and primary submit.
- **Agent node (canvas):** 240 px card `rounded-xl border bg-surface`, header with type icon (`Sparkles` autonomous, `Workflow` workflow, `UserCheck` human approval, `Code2` code agent), name h3, model caption mono, tool chips; selected `border-primary ring-2 ring-primary/30`; entry agent shows `Play` badge; locked shows `Lock` icon.
- **Mode toggle:** segmented control `rounded-lg bg-surface-2 p-0.5`, active segment `bg-surface text-fg shadow-sm`.

---

## 5. Icons

`lucide-react` only. Sizes: 16 px in text/buttons (`size-4`), 20 px in navigation (`size-5`), 24 px in empty states. Stroke width default (2). Decorative icons get `aria-hidden`; icon-only buttons require `aria-label`.

---

## 6. Motion

- Durations: `150ms` (hover, color), `200ms` (popover/menu), `250ms` (dialog, drawer). Easing: `cubic-bezier(0.2, 0, 0, 1)` (`ease-out` token `--ease-standard`).
- No animation on layout-critical content; build checklist ticks animate check icon only.
- Respect `prefers-reduced-motion`: disable transforms and spinners switch to static icon + text.

---

## 7. Accessibility rules

1. Text contrast ≥ 4.5:1 (all token pairs above comply); large text ≥ 3:1.
2. Visible focus on every interactive element; logical tab order; skip link on app shell.
3. Keyboard: `Cmd/Ctrl+K` palette, `Cmd/Ctrl+Enter` submits prompts, `Esc` closes overlays; canvas has an equivalent list view.
4. Live regions: build progress and toasts use `aria-live="polite"`; errors `assertive`.
5. Forms: labels bound to inputs, errors announced and linked via `aria-describedby`.
6. Hit targets ≥ 40 × 40 px on touch layouts.

---

## 8. Voice

- Build mode: plain language, no jargon ("Your app is live"), sentence case, no exclamation marks except success moments.
- Code mode: precise and technical (file paths, commands).
- Buttons are verbs ("Deploy", "Connect GitHub", "Plan my app").
