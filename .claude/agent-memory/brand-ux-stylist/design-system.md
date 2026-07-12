---
name: design-system
description: Complete softball-app design system — tokens, primitives, patterns, inconsistency inventory. Primary reference for all future UI work.
metadata:
  type: project
---

# Softball-app Design System (established 2026-06-09)

## Brand palette (tailwind.config.ts + index.css custom properties)

| Token   | Hex       | Semantic role |
|---------|-----------|---------------|
| ink     | #16191f   | Near-black. Page text, nav, dark surfaces, primary button bg |
| field   | #2f6f4e   | Softball-green. Positive/active states, primary CTA on light surfaces |
| chalk   | #f6f2e8   | Warm off-white. Page background, card tint, input disabled bg |
| clay    | #b5532f   | Terracotta. Destructive, warning, hover on ink bg, focus-ring color |
| steel   | #d5dee5   | Cool gray. Hover overlay on white surfaces |

CSS custom properties added to `:root` in `index.css` for non-Tailwind usage.

## Typography

- Font: Inter (via fontFamily.sans token)
- Text hierarchy used across pages:
  - eyebrow: `text-sm font-bold uppercase tracking-[0.18em] text-{field|clay|ink/65}`
  - h1: `text-4xl font-black` (page titles)
  - h2: `text-2xl font-black` (section headings)
  - h3: `text-xl font-black` (card/subsection headings)
  - body: default size, `text-ink/68` or `text-ink/70` at `leading-7` or `leading-8`
  - helper/meta: `text-sm text-ink/60` or `text-xs text-ink/50`

## Spacing conventions

- Page container: `mx-auto max-w-6xl px-4` (admin pages use max-w-5xl)
- Section top margin: `mt-10` or `mt-12`
- Card padding: `p-5` (md default), `p-6` (lg), `p-4` (sm)
- Form field gap: `gap-4` or `gap-5`

## Elevation / shadows

- `shadow-soft` (alias `shadow-card`): `0 18px 50px rgb(22 25 31 / 0.12)` — standard card/modal
- `hover:shadow-md` upgrade on interactive cards (quick-action links)

## Border radius

- Everything uses `rounded` (4 px). Token `rounded-btn` added as alias.

## Focus ring

- `.focus-ring` utility in index.css: `focus-visible:outline-2 outline-offset-2 outline-clay`
- Applied to ALL interactive elements. Never use browser default or remove outline.

## Primitive components (apps/web/src/components/ui/)

### Button (`Button.tsx`)
Variants: `primary` (ink→clay), `secondary` (bordered), `positive` (field→ink), `destructive` (clay border), `ghost` (text only)
Sizes: `sm` (px-3 py-1.5 text-xs), `md` (px-4 py-2 text-sm), `lg` (px-5 py-3 text-base)
Props: `variant`, `size`, `loading` (shows Loader2 spinner, disables), `iconLeft`, `iconRight`
States: disabled via native `disabled`; loading replaces icon slot; focus-ring always present

### Input + Textarea + FieldWrapper (`Input.tsx`)
Input sizes: `sm/md/lg`; props: `inputSize`, `hasError`, `leadingIcon`, `trailingIcon`
Error state: `border-clay/40`; disabled/readOnly: `bg-chalk`, cursor-not-allowed
FieldWrapper wraps label + children + helperText/errorText in a `flex-col gap-1` column

### Select (`Select.tsx`)
Same size API as Input. `appearance-none` + custom ChevronDown icon at right edge.
Props: `selectSize`, `hasError`

### Card + CardHeader + CardBody + CardFooter (`Card.tsx`)
Variants: `default` (white + shadow-soft), `dark` (ink bg), `outline` (border only), `ghost` (chalk)
Padding: `sm` (p-4), `md` (p-5), `lg` (p-6)
`interactive` prop adds hover-lift + focus-ring (for link cards)
CardHeader takes `icon`, `title`, `action`, `eyebrow` slots

### Badge (`Badge.tsx`)
Variants: `default`, `primary`, `positive`, `positive-solid`, `warning`, `destructive`, `destructive-light`, `info`
Sizes: `sm`, `md`
Maps all the ad-hoc statusBadgeClass() functions scattered across pages

### Alert (`Alert.tsx`)
Variants: `error` (clay), `success` (field), `info` (dashed, chalk bg)
Sizes: `sm` (py-2), `md` (py-3), `lg` (py-5)
Replaces 20+ repetitions of hand-coded banner <p> blocks

## Barrel export

`@/components/ui` — import all six primitives from this path.

## Button variant decision map

| Action intent      | Variant     | Example |
|--------------------|-------------|---------|
| Primary submit     | primary     | "Sign in", "Update password" |
| Back / cancel      | secondary   | "Back to booking", "Cancel" |
| Create / connect   | positive    | "Connect Google", "Add window" |
| Delete / cancel-booking | destructive | "Cancel session" |
| Low-emphasis       | ghost       | Inline nav items, text links styled as buttons |

## Pre-existing inconsistencies found (migration debt)

1. **Border thickness on inputs**: LoginPage + BookingPage use `border-ink/10`; AdminPages use `border-ink/15`. Canonical is `border-ink/15` (the Select/Input primitives use this).

2. **Primary button hover target**: Most pages use `hover:bg-clay`; AdminAvailabilityPage and AdminBookingsPage "Save"/"Create" buttons use `positive` variant (`field` bg → `ink` hover). Both patterns are intentional — `positive` for create/save in green, `primary` for the page-level CTA. Now named variants.

3. **STATUS_STYLES in AdminBookingsPage**: uses `bg-amber-100 text-amber-800` for hold/pending (one-off Tailwind color, not a brand token). Badge `warning` variant maps this but it remains in AdminBookingsPage until migrated.

4. **Disabled button**: Three different disabled recipes — `disabled:bg-ink/40`, `disabled:opacity-60`, `disabled:opacity-50`. Button primitive standardizes to `disabled:bg-{color}/40` for solid variants, `disabled:opacity-50` for bordered/ghost variants.

5. **StatusBadgeClass functions**: Identical logic duplicated in AdminDashboardPage, ClientDashboardPage, and ClientUploadsSection. Replace all three with `<Badge variant={...}>` after primitives are adopted.

6. **Text opacity inconsistency**: body text uses `/68`, `/70`, `/72`, `/75`, `/80` interchangeably. Closest standard value is `text-ink/70` (use) and `text-ink/68` (acceptable alias in Tailwind arbitrary syntax). Not worth a sweep but note for future.

## Screens to migrate to primitives (priority order)

1. **LoginPage** — most button/input ad-hoc classes; high user traffic
2. **BookingPage** — complex form with multiple button variants; highest conversion impact
3. **AdminAvailabilityPage** — 4 inline forms, all with ad-hoc select/input/button classes
4. **AdminBookingsPage** — ActionButton local component + NewBookingForm selects + STATUS_STYLES amber one-off
5. **AdminResourcesPage** — SELECT_CLASS / INPUT_CLASS string constants (good start but not typed)
6. **AdminDashboardPage** — MetricCard / CalendarConnectionCard / QuickAction all re-usable
7. **ClientDashboardPage** — UpcomingCard is very close to Card primitive already
8. **ResetPasswordPage** — trivial form, quick win
9. **AdminClientsPage** — search input + skill filter buttons
10. **AdminAuditLogPage**, **AdminClientDetailPage**, **AdminUploadsPage** — lower priority

**Why:** The primitive components provide typed, tested, accessible defaults. Migrating removes ~300+ lines of duplicated class strings and makes future design-system changes (e.g. switching border radius to 6px) a one-token update in tailwind.config.ts.
