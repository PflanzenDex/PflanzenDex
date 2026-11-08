# docs/guides/reference/design-system.md

Normative ruleset for every UI component and page in this repository. It is the reference for humans and agents when UI is created, changed or refactored. Rules carry IDs (`DS-nn`) so that issues, reviews and the CI check (`npm run design-system` in `app/`, section 6) can point at them.

- **Keywords:** MUST / MUST NOT are enforced (by CI where marked 🔒, otherwise by review). SHOULD is the default unless there is a written reason.
- **Language:** this file and all identifiers are English; user-visible UI text is German (ADR 0004, `.claude/rules/web.md`).
- **Product principles that shape the UI:** P-09 (every view says what to do next), P-08 (unknown values show "unbekannt", never an invented number), P-10 (nothing disappears silently), P-11 (mobile first, one-hand use).

## 0. Platform decision and status

**Target platform: a client-side SPA (Vite + React 19) that is an installable PWA, and later can be wrapped as a native app.** There is no server-side rendering and no React Server Components: the product is private, per-account and interactive, the backend is the separate `api` package (AB-6), and sign-in is OIDC with PKCE in the browser. Native later means wrapping the same build in a shell (Capacitor); a React Native rewrite would not reuse DOM components, only `core` and the API clients, which is why UI-independent logic stays out of components.

This document describes the **target** UI stack. The `web` package does not match it yet:

| Topic              | Target (this document)                                                  | Today (`app/packages/web`)                                                            |
| ------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Framework          | Vite SPA + PWA, React 19, client-side router                            | Vite 8 + React 19 SPA/PWA (matches)                                                   |
| Styling            | Tailwind CSS v4 (`@tailwindcss/vite`), `clsx` + `tailwind-merge`, CVA   | Tailwind v4 with preflight; `styles/tokens.css` is the only stylesheet                |
| Primitives         | shadcn/ui pattern (Vite flavour), Radix / Base UI, owned in `shared/ui` | Owned in `shared/ui` (Button, Input, Select, Checkbox, Dialog, Sheet, Table, Form, …) |
| Forms              | `react-hook-form` + `zod` behind a `Form` primitive                     | `react-hook-form` + `zod` behind the `Form` primitive                                 |
| Layout of the code | `shared/ui`, `shared/patterns`, `<module>/` folders                     | `src/<module>/` with `index.ts` as public interface (`modules.config.mjs`)            |
| Device access      | Only through `src/shared/platform/` adapters                            | Direct browser APIs in components                                                     |

The gap is tracked as issues (label `design-system`), every deviation is listed in `app/config/gates/baselines/quality-ds-baseline.json` and may only shrink (ratchet, section 6); a change that grows it needs a human, a shrink does not (US-QG-07).

**Paths and aliases.** `@/` means `app/packages/web/src/`. A module is a top-level folder of `src/` other than `app`, `components`, `shared` and `styles`; its name and allowed dependencies come from ADR 0003 and `app/config/lint/modules.config.mjs`. This file never defines its own module list.

---

## 1. Architecture & directory rules

### 1.1 Layout

```
src/
├── app/                         # composition root (FR-QG-23 step 3): the only layer that combines several modules
│   ├── main.tsx                 # bootstrap: providers, router, service worker registration
│   ├── routes.tsx               # route table: composes module index.ts exports and shared components (DS-05)
│   ├── sammlung-view.ts
│   ├── frame/                   # AppShell and its parts (app-shell, global-header, mobile-nav-bar, side-nav), the app root (app/)
│   ├── destinations/            # the areas: today-area, collection-area, discover-area, account-area; area-parts/
│   ├── flows/                   # onboarding, unlock, add-plant; index.ts is their public interface
│   ├── legacy-routes/           # redirects of the old addresses
│   ├── stories/                 # page stories (harness, data, screens) and the shell story fixtures
│   └── tests/                   # cross-cutting tests (styles, layout, sammlung, route register)
├── shared/                      # layer-neutral code, imports no module and not app (FR-QG-23 step 2)
│   ├── ui/                      # atomic primitives, NO domain logic (button/, fields/, overlays/, display/)
│   ├── patterns/                # composites: responsive/, states/, elements/, navigation/, display/
│   ├── data/                    # the former kernel: request hooks, features, load frame, time zone
│   ├── platform/                # adapters for device/browser APIs (section 1.3)
│   ├── lib/                     # cn() and other pure helpers (utils.ts)
│   └── testing/                 # shared test setup and the router decorator of stories (story-frame/)
├── styles/
│   └── tokens.css               # design tokens (section 3)
└── <module>/                    # e.g. collection/, care/, light/, wishlist/, pokedex/
    ├── index.ts                 # the ONLY file other code may import (public interface)
    ├── <Name>Page.tsx           # route-level component (default export for lazy loading)
    ├── <name>-card.tsx          # module components, private to the module
    ├── <name>-card.skeleton.tsx
    ├── <module>-api.ts          # HTTP client for this module (AB-6)
    └── schemas.ts               # zod schemas for forms of this module
```

### 1.2 Placement rules

| ID    | Rule                                                                                                                                                                                                                                                                                                                                                       |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DS-01 | `shared/ui` holds atomic, lightly styled primitives only (Button, Input, Label, Textarea, Select, Checkbox, Sheet, Dialog, Table, Skeleton, Badge, Form). It MUST NOT import from `shared/patterns`, from any module, from `core`, or from API code. It knows no domain term (no "specimen", "zone", "wish"). 🔒                                           |
| DS-02 | `shared/patterns` holds composites used by **two or more** modules or by the app shell (GlobalHeader, AppShell, MobileNavBar, ResponsiveModal, ResponsiveTable, EmptyState; the app-shell ones sit in `app/frame` since FR-QG-23 step 3). It MAY import `shared/ui`, `shared/patterns`, `shared/lib`, `shared/platform`. It MUST NOT import any module. 🔒 |
| DS-03 | A module's components live in its folder. They MAY import `shared/ui`, `shared/patterns`, `shared/lib`, `shared/platform` and the module's own files.                                                                                                                                                                                                      |
| DS-04 | A module component MUST NOT be imported from another module. If a second module needs it, move it to `shared/patterns` (if it has no domain rule) or expose data through the module's `index.ts` and let the consumer render it (section 4.1). 🔒                                                                                                          |
| DS-05 | The router (`app/routes.tsx`) composes module `index.ts` exports and shared components. It contains no business logic.                                                                                                                                                                                                                                     |
| DS-06 | Promotion rule: write it in the module first. Move it to `shared` when a **second** module needs it, to `ui` when it has no domain-specific text, data or behavior left. Do not pre-build shared components "just in case".                                                                                                                                |

### 1.3 Client runtime rules (SPA, PWA, native shell)

Everything runs on the client. The rules keep the app fast on a phone, offline-tolerant and portable to a native shell.

| ID    | Rule                                                                                                                                                                                                                                                                                                                                                                               |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DS-07 | No `"use client"` / `"use server"` directives; they are meaningless in a Vite SPA and mark code copied from Next.js examples. 🔒                                                                                                                                                                                                                                                   |
| DS-08 | **Split by route.** Each route-level page is loaded with `React.lazy` (the module's `index.ts` exports the lazy page) behind one `Suspense` boundary with a skeleton, so the first load contains only the shell and the current route. Initial JS: goal 125 kB gzipped, hard limit 140 kB (gate QG-U6, ADR 0018).                                                                  |
| DS-09 | **Data only through the module's `*-api.ts`**, never `fetch` inside a component. Every request has a pending, error and empty state (P-09, P-10). Dates are local calendar date strings (see the `date-and-timezone` skill). Server state is cached by one data layer (decision pending: TanStack Query or equivalent).                                                            |
| DS-10 | **Device and browser APIs only through `src/shared/platform/`** (camera, photo picker, notifications, share, geolocation, storage, haptics, clipboard, service worker). Components call the adapter; the PWA implementation uses the web API, a native shell swaps in the Capacitor plugin. No `navigator.*`, `localStorage`, `sessionStorage` or `Notification` in components. 🔒 |
| DS-11 | **Offline and shell behavior.** Every view handles "offline" explicitly (show cached data with a note, queue writes with a visible state, never a silent failure, P-10). Navigation uses the router (back works, no reliance on browser chrome); no hover-only interactions; respect safe areas (DS-22); no `window.open`/`alert`/`confirm` (use `Dialog`/`Sheet`).                |

Route-level page and lazy export:

```tsx
// collection/index.ts   (public interface)
import { lazy } from "react";
export const CollectionPage = lazy(() => import("./CollectionPage"));
export type { SpecimenView } from "./specimen-view";
```

```tsx
// app/routes.tsx (router excerpt)
<Suspense fallback={<PageSkeleton />}>
  <Routes>
    <Route path="/collection" element={<CollectionPage />} />
  </Routes>
</Suspense>
```

Device access through an adapter (the component never touches the browser API):

```ts
// shared/platform/camera.ts
export type Photo = { blob: Blob; takenAt: string };
export async function takePhoto(): Promise<Photo | undefined> {
  // PWA: <input type="file" accept="image/*" capture="environment"> via a hidden input.
  // Native shell: replaced by the Capacitor Camera plugin behind the same signature.
}
```

---

## 2. Mobile-first core guidelines

### 2.1 Upward-only breakpoints

| ID    | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DS-12 | The unprefixed style is the phone (`< 640px`). Responsive logic scales **up** with `sm:` (640), `md:` (768), `lg:` (1024), `xl:` (1280). `max-*:` variants and `@media (max-width: …)` MUST NOT be used. 🔒                                                                                                                                                                                                                                                                                                                                                                                                       |
| DS-13 | Design and test at 360×640 first. No horizontal page scroll at 320px. Side gutter on mobile is `px-4`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| DS-14 | Do not hide essential actions behind `sm:` or `md:` (`hidden md:block` on the only way to do something is a bug). Hide secondary chrome only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| DS-67 | The app never grows wider than 1920 px: the frame of `AppShell` and of `AuthFrame` carries `mx-auto w-full max-w-480` and the page colour fills the sides; anything fixed to the window edge (the toast stack) keeps to the column edge, `max(1.5rem, calc((100vw - 120rem) / 2 + 1.5rem))`. One cap on the frame, never per page (US-QS-14, US-QS-15, issue 1160).                                                                                                                                                                                                                                               |
| DS-71 | Content that a pane or a layer narrows takes its columns from the width of its container, not the viewport: the box around the grid carries `@container` and the columns use `@lg:`, `@md:` or `@3xl:` (Tailwind container queries, as `CareProfileList` and `FactGrid` do). A viewport `sm:` or `lg:` on such a grid gives two columns in a 350 to 384 px pane from 1024 px (issue 1640). The viewport breakpoints stay for the page frame, the index beside the content and the pane itself (DS-59). Starting value (assumption): a text column in a layer keeps at least 240 px at 1024 to 1920 px (US-QS-15). |

```tsx
// Good: phone baseline, then widen
<div className="flex flex-col gap-3 px-4 sm:flex-row sm:items-center sm:gap-4 lg:px-8" />

// Bad: desktop baseline, then shrink
<div className="flex-row max-sm:flex-col" />
```

### 2.2 Touch and accessibility

| ID    | Rule                                                                                                                                                                                                                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DS-15 | Every interactive control on mobile has a hit area of at least **44×44 px** (`min-h-[44px] min-w-[44px]`). Primitives bake this in (the `touch` size, section 3.3); icon-only buttons use `size="icon"` which is 44×44. A visually smaller glyph may sit inside a 44px target. 🔒 for `shared/ui` |
| DS-16 | Adjacent targets are at least 8px apart (`gap-2`).                                                                                                                                                                                                                                                |
| DS-17 | Icon-only controls carry `aria-label` (German). Decorative icons carry `aria-hidden`.                                                                                                                                                                                                             |
| DS-18 | Inputs use `text-base` (16px) on mobile so iOS does not zoom on focus; `sm:text-sm` is allowed.                                                                                                                                                                                                   |
| DS-19 | Use the right `type`, `inputmode` and `autocomplete` on inputs. Never convey meaning by color alone (add text or icon). Respect `prefers-reduced-motion` (`motion-safe:` for transitions).                                                                                                        |
| DS-20 | Text contrast is at least 4.5:1 (3:1 for large text and UI borders) in light and dark. `style-contrast.test.ts` stays green and is extended to every new token pair.                                                                                                                              |

### 2.3 Viewport handling

| ID    | Rule                                                                                                                                                                                                                                                                                |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DS-21 | Use `h-dvh` / `min-h-dvh` / `max-h-dvh`, never `h-screen`, `min-h-screen` or `100vh`. 🔒                                                                                                                                                                                            |
| DS-22 | Respect safe areas on fixed edges: bottom bars use `pb-[env(safe-area-inset-bottom)]`, and `viewport-fit=cover` is set. Content under a sticky bar gets matching bottom padding in the tall window (from 30 rem of height, DS-25); below it the bars are in the flow and need none. |

```tsx
<div className="flex min-h-dvh flex-col bg-background text-foreground">
  <GlobalHeader />
  <main className="flex-1 px-4 pb-24 md:pb-8">{children}</main>
  <MobileNavBar /> {/* fixed bottom, hidden from md: up */}
</div>
```

### 2.4 Responsive adaptive patterns

| ID    | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DS-23 | **Modals:** below `md` a bottom Sheet (Vaul-based `@/shared/ui/overlays/sheet/sheet`), from `md` a centered Dialog. Modules use `ResponsiveModal`, never a bare `Dialog` for content a phone user must fill in.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| DS-24 | **Tables:** below `md` a stack of cards (one card per row, label/value pairs, the row's main action reachable), from `md` the real `Table`. Both views render from the same column definition so they cannot drift. Use `ResponsiveTable`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| DS-25 | **Navigation (ADR 0011 decision 6):** below `md` a fixed bottom bar with at most 5 slots (the first four destinations plus "Mehr", which opens a sheet with the rest); from `md` a navigation rail (about 80 px, icon with label under it, all destinations); from `xl` a labelled sidebar (248 px, product name on top). Bar, rail and sidebar render the same single list of destinations. The active item is never shown by colour alone (pill or fill, semibold label, `aria-current`). By default the app bar and the bottom bar are in the flow and scroll with the content (US-QS-14, issue 659). From a window of 30 rem of height (starting value, assumption) the variant `tall-window` in `styles/tokens.css` (`min-height: 30rem`, the one definition of that threshold, also used by the sticky decision row of the suggestion deck, #648) makes the app bar sticky and the bottom bar fixed, as before. AppShell writes the measured bar heights as the variables `--header-clearance`, `--bar-clearance` and `--bar-reserve`, which tokens.css applies in the tall window only. |
| DS-26 | Every list/table/detail view defines its empty, loading and error state, and each offers a next action (P-09).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

`ResponsiveModal` sketch (the choice is made with CSS/media query hook, content rendered once):

```tsx
import * as React from "react";
import { useMediaQuery } from "@/lib/use-media-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/overlays/dialog/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/overlays/sheet/sheet";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
};

export function ResponsiveModal({
  open,
  onOpenChange,
  title,
  children,
}: Props) {
  const isDesktop = useMediaQuery("(min-width: 768px)"); // md, upward-only
  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[90dvh] pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}
```

`ResponsiveTable` principle:

```tsx
<ul className="flex flex-col gap-3 md:hidden">{rows.map(row => <li key={row.id}><RowCard row={row} columns={columns} /></li>)}</ul>
<Table className="hidden md:table">{/* same columns */}</Table>
```

---

## 3. Design tokens & styling conventions

### 3.1 Semantic tokens

| ID    | Rule                                                                                                                                                                                                                                    |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DS-27 | Colors, radii, shadows and font sizes come from semantic tokens. Components MUST NOT contain hex/rgb/hsl/oklch literals or Tailwind palette colors (`bg-green-600`, `text-gray-500`) and no arbitrary color values (`bg-[#1f6f3d]`). 🔒 |
| DS-28 | Tokens are CSS variables on `:root`, redefined for dark mode, exposed to Tailwind v4 through `@theme inline`. Use the **name by role** (`primary`), not by hue (`green`).                                                               |
| DS-29 | Spacing uses the Tailwind scale. Arbitrary values (`p-[13px]`) need a comment; the only standing exceptions are `min-h-[44px]`, `min-w-[44px]` and safe-area `env()` values.                                                            |
| DS-30 | Domain colors (light zone 1–4, care phase, etiolation warning) are tokens too (`--zone-1` … `--zone-4`, `--phase-*`, `--warning`), defined in `tokens.css`, never in a module.                                                          |

```css
/* styles/tokens.css */
@import "tailwindcss";

:root {
  --background: oklch(0.99 0.005 120);
  --foreground: oklch(0.2 0.02 150);
  --card: oklch(1 0 0);
  --card-foreground: var(--foreground);
  --popover: var(--card);
  --popover-foreground: var(--foreground);
  --primary: oklch(0.45 0.12 150);
  --primary-foreground: oklch(0.99 0.005 120);
  --secondary: oklch(0.95 0.02 140);
  --secondary-foreground: oklch(0.25 0.04 150);
  --muted: oklch(0.96 0.01 130);
  --muted-foreground: oklch(0.45 0.02 150);
  --accent: oklch(0.94 0.04 130);
  --accent-foreground: oklch(0.25 0.04 150);
  --destructive: oklch(0.5 0.2 27);
  --destructive-foreground: oklch(0.99 0 0);
  --border: oklch(0.9 0.01 130);
  --input: var(--border);
  --ring: oklch(0.55 0.15 150);
}

.dark {
  --background: oklch(0.18 0.01 150);
  --foreground: oklch(0.96 0.005 120);
  /* … every token above is redefined; the contrast test covers each pair */
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
}
```

Since the Greenhouse redesign (ADR 0011, US-QS-14) the values of these tokens, the radius tokens (`radius-control` 14 px, `radius-tile` 16 px, `radius-card` 22 px, `radius-pill`; the Tailwind steps `lg`, `xl`, `2xl` map to control, tile and card), the elevation levels (`shadow-elevation-1`, `shadow-elevation-2`), the motion tokens (`--motion-fast`, `--motion-base`, `--motion-slow`, `ease-enter`, `ease-leave`; 0 ms under `prefers-reduced-motion`) and the type scale (`text-xs` to `text-4xl`, plus `text-label`) live in `styles/tokens.css`; the font is self-hosted Figtree (`font-sans`). The literal values in the sketch above are illustrative. Since ADR 0017 the surfaces, quiet fills, borders, text greys and shadows are neutral; green (`primary`, `ring`, `accent`) marks intent only: the primary button, the outline button (text and border), links, focus, the selected navigation item, tab and chip, and progress. Never use a green token for the page, a card fill, a quiet or ghost button, a divider, body text or a shadow. The boundary of a secondary button is `--input` (US-QS-14, WCAG 1.4.11): it reaches 3:1 on background, card, warning, secondary and muted in both schemes.

Always pair a surface with its foreground: `bg-primary text-primary-foreground`, `bg-card text-card-foreground`, `bg-muted text-muted-foreground`.

### 3.2 The `cn()` helper

```ts
// shared/lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

| ID    | Rule                                                                                                                                                                                            |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DS-31 | Every component that accepts `className` merges it through `cn(base, variants, className)`, caller classes last. No string concatenation or template literals for class names. 🔒               |
| DS-32 | No inline `style={{…}}` for static styling. Dynamic, data-driven values (a chart width, a progress percent) may use a CSS variable: `style={{ "--value": pct }}` with a class that reads it. 🔒 |
| DS-33 | `@apply` only inside `tokens.css` base layers; never to re-create a component. Create a component instead.                                                                                      |

### 3.3 Variants with CVA

| ID    | Rule                                                                                                                                                                                                        |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DS-34 | Every component in `shared/ui` with more than one visual state is built with `class-variance-authority`. Variant logic by `if`/ternary on class strings is not allowed there. 🔒                            |
| DS-35 | Variants are named by intent (`default`, `secondary`, `outline`, `ghost`, `destructive`, `link`) and sizes by role (`sm`, `default`, `lg`, `icon`, `touch`). Always set `defaultVariants`.                  |
| DS-36 | Components forward `ref`, spread remaining props onto the root element and keep native semantics (`<button>` for actions, `<a>`/`Link` for navigation). Radix `asChild` is used instead of re-implementing. |

```tsx
// shared/ui/button/button.tsx
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium " +
    "transition-colors motion-reduce:transition-none " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
    "disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline:
          "border border-border bg-background hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-[44px] px-4 py-2",
        sm: "min-h-[44px] px-3 sm:min-h-9", // still 44px on touch, compact from sm:
        lg: "min-h-[48px] px-6 text-base",
        icon: "min-h-[44px] min-w-[44px]",
        touch: "min-h-[48px] w-full px-4 sm:w-auto",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
```

### 3.4 Focus, contrast, states

| ID    | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DS-37 | Every focusable element shows `focus-visible:ring-2 focus-visible:ring-ring` (plus offset on surfaces). `outline: none` / `outline-none` is only allowed together with that ring. Never remove the focus indicator, with one exception (owner decision 2026-10-30, #1034, US-QS-15, NFR-13): in `styles/tokens.css` only, the selector `:root:not([data-input="keyboard"]) :is(h1, main)[tabindex="-1"]:focus` may set `outline: none`. It covers a heading or the main region that the app focuses after a navigation while the last input was not the keyboard: Chromium draws its ring on such a focus after an earlier key press, even when the navigation was a click. Keyboard input keeps the ring, and controls always keep it. Any other `outline: none` or `outline: 0` fails the check (DS-37 in `check-design-system-rules.mjs`). 🔒 |
| DS-38 | Invalid fields use `aria-invalid` and the `destructive` token (`aria-invalid:border-destructive`), and show an error message linked by `aria-describedby`; color is never the only signal (the existing `invalid-field-style.test.ts` rule).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| DS-39 | Disabled state is `disabled:opacity-50 disabled:pointer-events-none`; do not use disabled to hide a missing explanation: say why (P-09). A disabled outline button keeps its text and border neutral (`disabled:text-muted-foreground disabled:border-border disabled:opacity-100`, as the `Pager` does): half-opacity green fell to about 1.8:1 (issue 1045).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| DS-40 | Keyboard: every overlay traps focus, closes on Esc, and returns focus to its trigger (Radix does this; do not break it with custom wrappers).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

---

## 4. Modulith component library guidelines

### 4.1 Sharing across modules without cycles

The module list and the allowed dependencies are defined once, in ADR 0003 and `app/config/lint/modules.config.mjs`. The UI follows them.

| ID    | Rule                                                                                                                                                                                                                                                                                                                                                              |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DS-41 | Dependency direction for UI: `<module>` → `shared/patterns` → `shared/ui` → `shared/lib`. Never upward, never sideways between modules. `shared/ui` does not import `shared/patterns`; no folder of `shared/` imports a module. 🔒                                                                                                                                |
| DS-42 | A module is consumed only through its `index.ts`. No deep imports (`@/care/specimen-card`). 🔒 (same mechanism as AB-8)                                                                                                                                                                                                                                           |
| DS-43 | If module A must show something owned by module B, B exports a **data function or a slot-friendly component through `index.ts`** and A is allowed to depend on B in `modules.config.mjs`. If that edge is not allowed, A receives the content as `children`/props from a page or from `today` (the aggregation module). Do not add the edge to make a UI compile. |
| DS-44 | A shared component takes **data and callbacks, not domain objects**. `MobileNavBar` receives `items: {href, label, icon}[]`, not a list of modules; `EmptyState` receives `title`, `description`, `action`. If it needs a domain type, it belongs in a module.                                                                                                    |
| DS-45 | No barrel file in `shared/ui` or `shared/patterns` that re-exports whole folders if it hurts tree-shaking or creates import cycles; import by file, or keep the barrel explicit.                                                                                                                                                                                  |
| DS-46 | Cross-module navigation is by route (`href`), not by component import.                                                                                                                                                                                                                                                                                            |

### 4.2 Forms: react-hook-form + zod + `Form` primitive

| ID    | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DS-47 | Forms use `react-hook-form` with `zodResolver`. The schema lives in the module (`schemas.ts`), is the single source for types (`z.infer`), and is **not** the authority for business rules: the server operation validates again (P-03), the client schema only gives fast feedback.                                                                                                                                                                                                                                                                                                                        |
| DS-48 | Fields are built with the `Form` primitives (`FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage`) so label, description, error and `aria-*` are wired automatically. A bare `<input>` outside `shared/ui` is not allowed. The gate also flags the other raw controls (`button`, `select`, `textarea`, `form`, `a` with `onClick` and no real `href`) and an interactive `role` (`tab`, `menuitem`, `option`, ...) on a plain element. A component imported from `shared/ui` (such as `Button`) may take an interactive `role` (Tabs, Menu); it renders a real control. 🔒 |
| DS-49 | Error text is German and comes from the message table by error code (`ERROR_TEXTS`); a server error code is mapped to the field or a form-level message. Never show raw server text (P-10).                                                                                                                                                                                                                                                                                                                                                                                                                 |
| DS-50 | Submit buttons show a pending state and are disabled while submitting; success and failure are both visible (toast or inline), never silent. Unsaved input is not discarded without confirmation.                                                                                                                                                                                                                                                                                                                                                                                                           |
| DS-51 | Dates are local calendar dates as strings (`YYYY-MM-DD`) in forms; see the `date-and-timezone` skill.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

```tsx
// wishlist/schemas.ts
import { z } from "zod";

export const wishSchema = z.object({
  name: z.string().trim().min(1, "Bitte einen Namen angeben").max(120),
  note: z.string().max(500).optional(),
});
export type WishInput = z.infer<typeof wishSchema>;
```

```tsx
// wishlist/wish-form.tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/shared/ui/button/button";
import { Input } from "@/shared/ui/fields/input/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/shared/ui/fields/form/form";
import { wishSchema, type WishInput } from "../schemas";

export function WishForm({
  onSubmit,
}: {
  onSubmit: (v: WishInput) => Promise<void>;
}) {
  const form = useForm<WishInput>({
    resolver: zodResolver(wishSchema),
    defaultValues: { name: "" },
  });
  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
        noValidate
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input autoComplete="off" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          size="touch"
          disabled={form.formState.isSubmitting}
        >
          Speichern
        </Button>
      </form>
    </Form>
  );
}
```

### 4.3 Skeleton loaders (no layout shift)

| ID    | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DS-52 | Every async view has a skeleton that has the **same structure and box sizes** as the loaded mobile layout: same container, same number of rows (or a fixed plausible count), same heights. Cumulative Layout Shift of a cold load stays < 0.1 (assumption, starting value; `quality-limits.json` `layoutShift.maxCls`) at 360x640, 390x844 and 1280x800; the one-screen project measures it per screen (`judge.shift.ts`, `fit.shift.ts`, US-QS-14, issue 1697). The `lighthouse` script measures only the start page (QG-U1).                                                                                                                                                                                                                                                                                                                                                                                                         |
| DS-53 | Skeletons are built from `shared/ui/display/skeleton/skeleton.tsx` and live next to the component they mirror (`specimen-card.skeleton.tsx`). When the real component changes size, the skeleton changes in the same PR.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| DS-54 | Images and media reserve space with `aspect-*` or explicit `width`/`height`. No element is inserted above already visible content after load (banners, error bars use reserved space or an overlay).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| DS-55 | Route-level pages load behind one `Suspense` boundary whose fallback is the page skeleton (DS-08); inside a page, wrap the **smallest** lazy or async part in its own `Suspense`/pending state, so the shell and header render at once.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| DS-56 | Skeletons are `aria-hidden` with a single `role="status"` + visually hidden "Lädt…" text on the container. Animation respects `motion-reduce`. A loading state never shows an invented number (P-08).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| DS-57 | A loading part shows its skeleton (or its status) only after a delay of 200 ms (starting value, assumption, issue 1697): a part that arrives sooner shows nothing, so a fast load does not flash. The skeleton is never held once shown. One loader per region: a region shows its skeleton once, then its content; a nested fallback of the same region repeats the skeleton, never a second text. A spinner (`PlantLoader`) stays only on a control while its write runs and where there is no shape to sketch; the status texts sit centred (D2, D13). The delay is `DelayedSkeleton` (`shared/ui/display/skeleton/`); `PageSkeleton` applies it to its blocks, its heading stands at once (US-QS-14). |

```tsx
// shared/ui/display/skeleton/skeleton.tsx
import { cn } from "@/shared/lib/utils";

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse rounded-md bg-muted motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}
```

```tsx
// collection/specimen-card.skeleton.tsx   (mirrors specimen-card.tsx: p-4, 3 lines, 48px button)
export function SpecimenCardSkeleton() {
  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4"
    >
      <span className="sr-only">Lädt…</span>
      <Skeleton className="h-6 w-2/3" /> {/* h2 */}
      <Skeleton className="h-5 w-1/2" /> {/* next step */}
      <Skeleton className="h-12 w-full sm:w-32" /> {/* touch button */}
    </div>
  );
}
```

#### Inventory of the loading states (issue 1697, state after part 2, 2026-11-08)

Kinds: **own** = a skeleton of the page or part in its shape, **generic** = `PageSkeleton` or a two-card block, **spinner** = `PlantLoader` without a shape, **status** = a centred text without a skeleton, **none** = no loader of its own. The shape of a skeleton that is new in part 2 or part 1 waits for the delay (DS-57). The older own skeletons (`LoadFrame` fallbacks of part 1 and before, such as `HintsPageSkeleton` on a page or `SettingsPageSkeleton`) show at once: their delay is a follow-up, because it changes the status assertions of about 60 test files. Measured layout shift (the gate of issue 1697) is a separate step and is not yet measured.

| Region            | Address or layer                                                  | Loading state now                                                                                                                                                                                                                                                                           | Left open (reason)                                                                             |
| ----------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Entry             | any address while the session is checked                          | own: `Loading` ("Einen Moment, die Anmeldung wird geprüft …", three blocks), before the shell exists                                                                                                                                                                                        | the shell is not known before the session resolves (reported, not solved)                      |
| Heute             | `/today`                                                          | `TodaySkeleton` as route fallback and as the page's skeleton; the page waits for its list and the three counts together and shows that skeleton once, then its content (one region, the counts requested together, the chunks preloaded together); the layers have their shapes (see below) | none                                                                                           |
| Sammlung          | `/collection`, `?view=plants`, `species`, `wishlist`, `equipment` | route: generic `PageSkeleton` with the heading "Sammlung" (the heading stands at once); area fallback generic; each mode has its own skeleton                                                                                                                                               | the shape depends on the mode, which the area knows only after the address is read (follow-up) |
| Entdecken         | `/discover`, `?view=suggestions`, `view=catalog`                  | route: `DiscoverRouteSkeleton` (title, switch, and the shape of the mode the address or the device names); area: `DiscoverModeSkeleton`, the card (`DiscoverPageSkeleton`) or the search (`SpeciesPageSkeleton`)                                                                            | none                                                                                           |
| Freunde           | `/friends`                                                        | route: generic with the heading "Freunde" (`CalmGate` is lazy); `FriendsPageSkeleton` (own)                                                                                                                                                                                                 | the route fallback is generic (follow-up, its page skeleton already has the shape)             |
| Freunde Tausch    | `/friends/exchange`                                               | route: generic; `ExchangePage` own; `friend-offers`, `swap-history` and `swap-requests` now `FriendOffersSkeleton`, `SwapHistorySkeleton`, `SwapRequestsSkeleton`                                                                                                                           | the route fallback is generic (follow-up)                                                      |
| Freunde Matching  | `/friends/match`                                                  | route: generic; `MatchPage` own (`DeckSkeleton`)                                                                                                                                                                                                                                            | the route fallback is generic (follow-up)                                                      |
| Freundes Sammlung | `/friends/:friendId`                                              | route: generic; `FriendCollectionPage` own; `friend-equipment` now `FriendEquipmentSkeleton`                                                                                                                                                                                                | the route fallback is generic (follow-up)                                                      |
| Konto             | `/account/*`                                                      | route: `AccountRouteSkeleton` (title, the index's rows, or the section's shape); each section: `AccountSectionSkeleton` by kind (form, cards, rows; settings keep `SettingsPageSkeleton`); the AI sections, reminders, and the care profile of a species are shaped                         | none                                                                                           |
| Prüfliste         | `/review`                                                         | none at the route (static import); `ReviewPage` own                                                                                                                                                                                                                                         | none                                                                                           |
| Betreiber         | `/operator`                                                       | none at the route; `OperatorPage` own                                                                                                                                                                                                                                                       | none                                                                                           |
| Artenprofil       | `/discover/species/:id`                                           | route: generic; `profile-view` own inside                                                                                                                                                                                                                                                   | the route fallback is generic (follow-up)                                                      |
| Beschriftung      | `/collection/labels`                                              | route: none (static import); `PrintLabelsPage` `PrintLabelsSkeleton` (the list of cards)                                                                                                                                                                                                    | none                                                                                           |
| Import            | `/collection/import`                                              | none of its own (static import, no loader in the file)                                                                                                                                                                                                                                      | none needed                                                                                    |
| Neue Pflanze      | `/collection/new` (`add-plant`)                                   | none of its own                                                                                                                                                                                                                                                                             | none needed                                                                                    |
| Freischalten      | `/unlock/:id`                                                     | `UnlockSkeleton` (title, purpose, button)                                                                                                                                                                                                                                                   | none                                                                                           |
| Topfetikett       | `/label/:id`                                                      | `PotLabelSkeleton` (photo, name, two actions)                                                                                                                                                                                                                                               | none                                                                                           |

Layers. Each layer loads with the page it belongs to, unless its chunk is still on its way: then the window shows the centred status "Fenster wird geladen …" after 300 ms (issue 1575, **status**, no skeleton). That status is kept; it is the window's own. The register of the one-screen gate names the layers by their sheet id.

| Owner page     | Layers (`?sheet=`)                                                            | Loading state now                                                                                                                                                                                                                             |
| -------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Heute          | `treatments`, `watering`, `hints`                                             | `TreatmentsLayerSkeleton` (two open treatments), `WateringLayerSkeleton` (the rows of the watering list), `HintsLayerSkeleton` (the hint cards); the content loads with the page                                                              |
| Heute          | `plan`, `tasks`, `news`, `locked`                                             | `plan` own (`RequestState`); `tasks` reads the page's own request (`NowSkeleton`); `news` `FeedSkeleton` (the feed block); `locked` static                                                                                                    |
| Sammlung       | `view`, `zones`, `archive`, `new-zone`, `new-location`, `reference`           | `view` static; `zones` and `archive` in `RequestState` (`plant-layers`); the direct plant layer (an address to one plant) is `PlantLayerSkeleton`; `reference`, `new-zone` and `new-location` static (their data comes from `LightPage`, own) |
| Sammlung       | `progress`, `milestones`, `filters`, `uncounted`, `cards`, `species`          | `ProgressSkeleton` and `MilestonesSkeleton` (the Pokédex layers), `CollectorCardsSkeleton` (the cards); `filters` and `species` (`SpeciesDetail`) static, their data comes from the Pokédex page                                              |
| Sammlung       | `bought`, `discarded`, `new-wish`, `wishes`, `hints`                          | wishlist page own; the layers themselves static (their data comes from `WishlistPage`); `hints` `HintsPage` own                                                                                                                               |
| Sammlung       | `items`, `costs`, `needs`, `lamps`, `sensors`, `new`                          | equipment page own; the layers static                                                                                                                                                                                                         |
| Entdecken      | `filters`, `propose`                                                          | `filters` static; `propose` own (`SpeciesPage`)                                                                                                                                                                                               |
| Freunde        | `add`, `help`, `friends`, `sharing`, `requests`, `news`                       | friends page own; the layers static                                                                                                                                                                                                           |
| Freunde Tausch | `offer`                                                                       | exchange own                                                                                                                                                                                                                                  |
| Konto          | `profile`, `notifications`, `privacy`, `style`, `wishlist`, `light`           | settings page own (`SettingsPageSkeleton`); `style` `keeper-style` own; the reminder forms `SettingsFormSkeleton`                                                                                                                             |
| Konto          | `earned`, `rhythm`, `year`, `pause`                                           | achievements own (`overview`, `calm-mode`); the layers static                                                                                                                                                                                 |
| Betreiber      | `zahlen`, `einstieg`, `kosten`, `fristen`, `registrierung`, `einladungscodes` | operator page own (`OperatorPageSkeleton`); the layers static                                                                                                                                                                                 |

Chains and what is left. `/today` had a chain of loaders: each count waited for its lazy chunk and its request started only then, and each count showed its own face; now the chunks are preloaded together, the counts start together, and the region shows one skeleton until the counts and the list are there (issue 1697, part 2). The 21 spinners of the reading are shaped (`LoadFrame` and `RequestState` fallbacks); the spinner left is the one of the control "Mehr laden" (`load-more`, a control while its page loads, DS-57, D2). Generic blocks remain in the route fallbacks of "Sammlung", "Freunde", "Freunde Tausch", "Freunde Matching", "Freundes Sammlung" and "Artenprofil", and in the area fallback of "Sammlung" (each listed above with its reason); the `AreaSection` of a section and the layers no longer use the generic blocks.

### 4.4 Component inventory

Every component in `shared/ui`, in the shared patterns (responsive, states, empty-state, navigation) and the app-shell components in `app/frame` that exist today. Look here before you build a new one; a new component gets its row in the same PR (`make reference-check`, rule RF-3, US-QG-10). The path is relative to `app/packages/web/src/`.

| Component          | Path                                                        | Use it for                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`           | `shared/ui/button/`                                         | every button; variants by role, 44 px hit area on touch (DS-15, DS-34, DS-35)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `Badge`            | `shared/ui/display/badge/`                                  | a short, non-interactive status label; text carries the meaning (DS-38)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `Label`            | `shared/ui/display/label/`                                  | the label of a form control (DS-36)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `MoreHelp`         | `shared/ui/display/more-help/`                              | one line of help and the longer text behind "Mehr erfahren" (US-QS-24)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `Skeleton`         | `shared/ui/display/skeleton/`                               | one placeholder block with the size of the content it mirrors; `SkeletonGroup` (DS-52, DS-56)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `DelayedSkeleton`  | `shared/ui/display/skeleton/`                               | a skeleton or status that shows only after the delay of 200 ms (DS-57, US-QS-14, issue 1697); a Suspense fallback wraps its skeleton in it; a skeleton nested in a due one shows at once, so a composed skeleton waits one delay                                                                                                                                                                                                                                                                                                                                                   |
| `Table`            | `shared/ui/display/table/`                                  | semantic table with its parts (`TableRow`, `TableCell`, …); on phones use `ResponsiveTable`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `Checkbox`         | `shared/ui/fields/checkbox/`                                | styled native checkbox, the whole label row is the hit area                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `Form`             | `shared/ui/fields/form/`                                    | the form family on react-hook-form + zod (section 4.2, DS-47, DS-48)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `MoreFields`       | `shared/ui/fields/form/more-fields/`                        | the optional fields of a form behind "Mehr Angaben", closed by default; `FormMoreFields` binds it to a react-hook-form control and it opens by itself while a field inside holds a value or a refusal (DS-64, US-QS-24)                                                                                                                                                                                                                                                                                                                                                            |
| `Field`            | `shared/ui/fields/form/field/`                              | one labelled `Input` or `Select` of a form: the label, the control from the render prop, an optional `description` and the message of the field (DS-47, DS-48); a form field is not built from `FormField` by hand                                                                                                                                                                                                                                                                                                                                                                 |
| `useServerRefusal` | `shared/ui/fields/form/server-refusal.ts`                   | a hook, not a component: hands a server refusal to the fields it names, with the German text of its code (`refusalText`), and moves the focus; the refusal alert takes `ALERT_CLASSES` (DS-49, P-10)                                                                                                                                                                                                                                                                                                                                                                               |
| `Input`            | `shared/ui/fields/input/`                                   | single-line field; `fieldClasses` is the shared look of `Input`, `Textarea` and `Select`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `SearchInput`      | `shared/ui/fields/input/search-input/`                      | the one search field: `Input` type search without the browser's own clear icon and, while it holds text, a ghost button "Suche leeren" (44 x 44 px) that clears it and refocuses the field; `value` and `onClear` required (US-QS-24, issue 1094) `keyHint` shows the key of `/` on desktop while the field is empty and names it for assistive technology (US-QS-11)                                                                                                                                                                                                              |
| `DateField`        | `shared/ui/fields/input/native-fields/date-field/`          | every date: shows `TT.MM.JJJJ`, value stays the local calendar date `YYYY-MM-DD` (US-QS-24, NFR-08); never `type="date"`                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `FileField`        | `shared/ui/fields/input/native-fields/file-field/`          | every file pick: German button "Foto wählen" instead of the native "Choose File" (US-QS-24)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `MonthField`       | `shared/ui/fields/input/native-fields/month-field/`         | a month as a select with German month names, value `YYYY-MM` (US-QS-24)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `Select`           | `shared/ui/fields/select/`                                  | styled native select (ADR 0007)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `Textarea`         | `shared/ui/fields/textarea/`                                | multi-line field                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `Dialog`           | `shared/ui/overlays/dialog/`                                | modal dialog with focus trap; for forms on phones use `ResponsiveModal` (DS-23, DS-40)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `Sheet`            | `shared/ui/overlays/sheet/`                                 | bottom sheet, loaded on demand (DS-08); while the sheet loads it shows a loading status (only while open) or the error view (NFR-12)                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `SheetPanel`       | `shared/ui/overlays/sheet/sheet-panel/`                     | the body of `Sheet`, a separate chunk that `Sheet` loads on demand (DS-08); used only by `Sheet` ; its Vaul slide and overlay run `--motion-slow` (320 ms, `styles/tokens.css`, US-QS-14, F13), and the title draws no browser outline (F15)                                                                                                                                                                                                                                                                                                                                       |
| `EmptyState`       | `shared/patterns/elements/empty-state/`                     | empty or error state of a list or view with the next action (DS-26, P-09); `compact` without the icon tile, below a notice that says most of it                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `SwipeCard`        | `shared/patterns/elements/swipe-card/`                      | a card the keeper swipes or taps away for the decks (US-ENT-01, US-TAU-02): it follows the drag, the stamp fades in, a decision flies it off and a release before the threshold springs it back; `exit` set by a button or a key gives the same flight; `stacked` shows a frame underneath and `under` the next card's content, hidden from assistive technology and inert (US-ENT-01); reduced motion keeps the result (NFR-13); pure logic in `swipe-gesture.ts`, the pointer side in `use-card-gesture.ts`, the haptic and the reduced-motion hook in `shared/platform/device/` |
| `FormNotices`      | `shared/patterns/elements/form-notices/`                    | the notices above a form after a save: the status line of the last save and the alert of a refusal that names no field, which takes the focus (DS-49, P-10)                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `AppShell`         | `app/frame/app-shell/`                                      | the frame of every signed-in page: header, sidebar, bottom bar; a destination makes it one screen with `data-fit-screen` (DS-61)                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `PageHeader`       | `shared/patterns/navigation/page-header/`                   | the header of a sub-page: an icon chevron back to the parent, named "Zurück zu …" (ghost, 44 px), the one h1 and at most one action in one row (US-QS-14, DS-64)                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `FullView`         | `shared/patterns/navigation/full-view/`                     | the frame of a sub-page or full-view page: `PageHeader` first, then the content region below it, no card around the h1 (US-QS-14, US-QS-15, DS-64)                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `GlobalHeader`     | `app/frame/global-header/`                                  | the top bar below `md` (DS-25)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `MobileNavBar`     | `app/frame/mobile-nav-bar/`                                 | the bottom bar, at most 5 slots (DS-25); icons only when a label no longer fits its slot (issue 1107)                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `SideNav`          | `app/frame/side-nav/`                                       | the sidebar from `md`; items with a `group` stand under that heading in the labelled sidebar ("Verwaltung", issue 1093)                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `NavNote`          | `shared/patterns/navigation/nav-note/`                      | the text mark of a destination that is not open yet (US-ONB-05)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `Navigation`       | `shared/patterns/navigation/navigation/`                    | the navigation model: views, link targets and paths, not a visible component                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `ResponsiveModal`  | `shared/patterns/responsive/responsive-modal/`              | content a phone user fills in: bottom sheet below `md`, dialog from `md` (DS-23); a layer focuses its title first (`focusModalTitle`, US-QS-15, issue 1028) ; `onExited` runs once a closed modal has left the page, after its exit animation (US-QS-15, F7)                                                                                                                                                                                                                                                                                                                       |
| `DialogPart`       | `shared/patterns/responsive/…/dialog-part/`                 | the dialog of `ResponsiveModal` from `md`: its trigger stays in place and starts the chunk on pointer, focus or touch; while the chunk loads it shows a loading status (only while open) or the error view; the dialog chunk mounts on the first open (DS-08, NFR-12)                                                                                                                                                                                                                                                                                                              |
| `DialogModal`      | `shared/patterns/responsive/…/dialog-modal/`                | the Radix dialog (focus trap, scroll lock), a lazy chunk that `DialogPart` loads; used only there (DS-08, NFR-12)                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `LayerSheet`       | `shared/patterns/responsive/layer-sheet/`                   | a topic or detail above an overview, bound to `?sheet=<id>`; also `useLayer`, `LayerOpener` (outline, `size="sm"` for a tile) and `LayerHost`, the frame of a destination with layers; `LayerPane` (`layer-host/layer-pane/`) is the pane of an open layer in it (DS-58, DS-59) ; a closing sheet keeps its body until its exit ends, and a layer that another layer replaces leaves at once (US-QS-15, F7); `useExitValue` (exported here) keeps a layer's last value while it closes (F12); the focus returns to the opener also when the address drops the layer (issue 1661)   |
| `LayerPart`        | `shared/patterns/responsive/layer-sheet/layer-part/`        | a row of a list that opens its layer (`LayerOpenRow`: name, value, chevron) and the layer beside it in one grid (`LAYER_SLOT`); its `primaryAction` is the sticky footer (US-QS-15, US-QS-17)                                                                                                                                                                                                                                                                                                                                                                                      |
| `Pager`            | `shared/patterns/responsive/pager/`                         | a list longer than its region as pages, the address holds the first entry on screen, counted from 0 (`?from=n`, `?lfrom=n` in a layer, `LAYER_PARAM`; an old `?page=n` converts once, `OLD_PARTS`), buttons and swipe; `useRowPageSize` gives 4/8/10 compact rows per page (DS-60, US-QS-22)                                                                                                                                                                                                                                                                                       |
| `PagedGroups`      | `shared/patterns/responsive/paged-groups/`                  | groups chosen from a row of chips with their counts when they fit one line below 768 px or up to two lines from 768 px, otherwise from a selection field (`GroupChoices`, `useChipsFit`, `?part=`) and the chosen group as `Pager` pages (US-QS-19, issue 1281); a group may carry its server `count` and `paging` (FR-BES-23, `Pager`)                                                                                                                                                                                                                                            |
| `Paging`           | `shared/patterns/responsive/pager/paging/`                  | server paging of a `Pager` list (FR-BES-23, P-10): `usePagingMore` asks for the next page, `PagingNote` shows the loading text or a failed page with its retry                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `ResponsiveTable`  | `shared/patterns/responsive/responsive-table/`              | a list of rows: cards below `md`, `Table` from `md`, one column definition (DS-24)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `FactGrid`         | `shared/patterns/responsive/…/fact-grid/`                   | known facts as a grid; unknown ones fold into one line with the count and the caller's next step; `unknownInEvery` finds a fact unknown in every row; `missingText` and `FoldNext` (the neutral next step) serve a fold of its own, e.g. the collector card on a short screen (US-QS-24, P-08, P-09, issue 1154)                                                                                                                                                                                                                                                                   |
| `Banner`           | `shared/patterns/states/banner/`                            | a page-level message with icon and text, optional action (DS-34, DS-38)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `PageSkeleton`     | `shared/patterns/states/page-skeleton/`                     | Suspense fallback of a route page (DS-55, DS-56); `heading` shows a destination's h1 while it loads (issue 1097)                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `RouteFallback`    | `app/destinations/area-parts/simple-routes/route-fallback/` | the fallback of a route's Suspense boundary: "Heute", "Entdecken" and "Konto" show the shape of their page, the mode or section the address names; the other routes keep `PageSkeleton` (US-QS-14, issue 1697)                                                                                                                                                                                                                                                                                                                                                                     |
| `PlantLoader`      | `shared/patterns/states/plant-loader/`                      | the growing-sprout loading indicator                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `RequestState`     | `shared/patterns/states/request-state/`                     | the one pattern for pending, error, empty and ready of a request (DS-09, DS-26)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `ToastItem`        | `shared/patterns/states/toast/toast-item/`                  | one toast; durations by kind (P-10)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `ToastProvider`    | `shared/patterns/states/toast/toast-provider/`              | provider for `useToast()`, the confirmation after a write; lies above an open layer (issue 1028)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `ShortcutOverview` | `shared/platform/device/keyboard/shortcut-overview/`        | the overview of the keyboard shortcuts, opened by `?` and by `ShortcutHelpButton` (the help entry in "Was die App kann"): a bottom sheet on a phone, a dialog from `md`; lists the keys of the register, says when they are off, Escape returns the focus (US-QS-11, DS-40, DS-70)                                                                                                                                                                                                                                                                                                 |

### 4.5 Layers and one screen (US-QS-15)

| ID    | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DS-58 | A destination is an overview (summary, next action, at most 6 entries) that fits between app bar and navigation; topics and object details open as layers, never as a long column below. Long lists are paged, not scrolled. It holds at the supported window sizes of US-QS-15 (360×640, 390×844, 768×1024, 1024×768, 1920×1080; above 1920 px the capped frame of DS-67), checked by the one-screen gate QG-U8.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| DS-59 | A layer is `LayerSheet`: open state in `?sheet=<id>`, opened by pushing history (Back closes), a bottom sheet below `md`, a dialog from `md`, a pane beside the content of its `LayerHost` from `lg`. The content column of a `LayerHost` (`layer-sheet/layer-host/`) is at most 720 px and centred, so the pane takes the rest of the frame; the page's width cap of the shell is lifted for a frame (`has-[[data-layer-host]]`), and a caller whose content holds a nested frame may lift the content cap from `lg` (`contentClassName="lg:max-w-none"`, US-QS-15, US-QS-18, #1027). Focus moves to the layer and returns to the opener; Escape closes; the scroll region has `overscroll-contain`. `LayerOpener` gives its button the id `<layer id>-opener` (`layerOpenerId`), so the opener is found again after its layer closed; `LayerSheet` owns the return: on close, and on unmount when the address drops a layer that is mounted only while it is open (also by Back), so no layer needs its own `restoreFocus` (US-QS-15, issue 1661). A closing sheet keeps its body until its exit ends (`ResponsiveModal` `onExited`, US-QS-15, F7); a layer that another layer replaces, and a pane, leave at once. The sheet and its overlay run `--motion-slow` (`styles/tokens.css`, US-QS-14, F13), and the title takes the focus without a browser outline (issue 1649). |
| DS-60 | Paging is `Pager`: `?from=n`, the first entry on screen counted from 0 (FR-BES-23, issue 1492; an entry past the end shows the last page and the address follows, an old `?page=n` converts once), "Zurück" and "Weiter" (44 px; a step moves by one page from the first entry, so the page is never rounded down), "Seite n von m" in a polite live region, swipe as an alternative; a changed filter passes a new `resetKey`. Pages change without sliding. With `fit` (US-QS-19, #1029) a page holds the whole rows (times the columns of a grid) that the free height of the list region takes; the region is flex-filled by its frame and never shorter than one row, the pager sits below it at the bottom of the frame, and a changed page size keeps the first entry and writes no address (`position` in `paging/paging.tsx` counts the pages). A fitted list carries `data-page-fit`; a layer (sheet, dialog, pane) that holds one takes its full height and passes it down as a flex column, so the list has free height to fill (issue 1156).                                                                                                                                                                                                                                                                                                                       |
| DS-61 | A one-screen destination marks its root element with `data-fit-screen`; this is the only mechanism (CSS `:has` in `tokens.css`, no code in the entry bundle, the shell knows no routes): the page does not scroll, `main` scrolls inside itself only when content cannot fit (400 % zoom, 200 % text), with `overscroll-contain`. Heute and Sammlung use it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| DS-62 | A layer has at most one filled primary action (`primaryAction`); others are `outline` buttons, rows or tiles. Help text shows one line; more is behind "Mehr erfahren". Free text longer than its region scrolls in that region only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| DS-63 | Controls carry `touch-action: manipulation` and a token-based tap highlight (base layer). A number and its unit never break apart (`whitespace-nowrap`), counts and measurements use `tabular-nums`. Font sizes are rem-based Tailwind sizes (`text-sm`, `text-base`, …), never a fixed px class such as `text-[15px]`; at 200 % text a row, tile or switch wraps, stacks or scrolls inside its own box instead of cutting its text (US-QS-15, issue 1019; a test scans the sources). A row that scrolls sideways carries `data-scroll-x="row"` and fits at normal text size; the one-screen gate allows its sideways scroll only at 200 % text (issue 1183).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| DS-64 | A sub-page or full-view page starts with one `PageHeader` inside a `FullView` (issue 1031): the back control is an icon-only chevron (`ghost`, 44 px) named after its target ("Zurück zu …", "Zurück zur …"), then the one h1 with the page name and at most one action. No other back navigation (a grey pill, an underlined link, a full-width outline button). A card never surrounds the h1, and the page has exactly one h1 while it loads or fails.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| DS-65 | Button roles follow ADR 0017 (issue 1031): the primary action is `default` (filled green, at most one per layer, DS-62), a secondary action is `outline`, a tertiary action (back, dismiss, skip, "more") is `ghost`. A screen never shows a filled grey `secondary` button beside an outline button.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| DS-66 | A form puts its optional fields behind `MoreFields` (`shared/ui/fields/form/more-fields/`, "Mehr Angaben"): closed by default, it opens by itself while a field inside holds a value or a refusal (a refused field takes the focus), and a group that holds a value cannot be closed, so nothing is hidden silently (P-10). The one filled action of a form sits in a sticky footer; a form section has no heading that repeats the layer title (it takes `aria-label`); notices hold one line, the rest behind "Mehr erfahren" (US-QS-15, US-QS-24, issue 1032).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

### 4.6 Focus, announcements and shortcuts (US-QS-08, US-QS-10, US-QS-11)

| ID    | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DS-68 | A view change moves the focus through `RouteFocus` (`shared/platform/routing/route-focus/`) and nothing else: once the new view has loaded, the focus goes to its main heading, never on the first load, so the skip link comes first (US-QS-08); Back returns it to the control that opened the view (US-QS-09). A layer or a form opened on the same view moves no focus, but `RouteFocus` remembers the control it was opened from, so Back to that view finds it (US-QS-15, issue 1637). `?sheet`, every address part of a pager (`PAGER_PARTS` and the old page numbers of `OLD_PARTS`, such as `?from=6` or `?vfrom=3`, issue 1550) and a navigation with the state `keepFocus` only set the title; the layer and the pager keep their own focus (DS-59, DS-60). New code does not call `focus()` on a heading or on `main` for a view change. A heading focused by script shows no frame after a pointer input (DS-37, US-QS-15). |
| DS-69 | Results and offline states are announced through `useAnnounce()` (`shared/platform/announcer/`), the app's shared polite live region, and the announcement never moves the focus (US-QS-10). A toast has its own polite region for confirmations and an assertive one for errors (`shared/patterns/states/toast/toast-provider/`); an error that blocks an action is also shown in its field (DS-38). A component adds its own `aria-live` only for a text that changes in place, such as a counter or a page label (DS-56, DS-60), never for a result.                                                                                                                                                                                                                                                                                                                                                                                  |
| DS-70 | Keyboard shortcuts come from one central register (US-QS-11). Until the register exists, no shortcut is added. Every shortcut action has a visible control that shows the shortcut. A single-character shortcut can be switched off or changed to one with a modifier and never fires while the focus is in a text field (2.1.4). The register rejects keys that browsers, the operating system and screen readers use, such as Tab, Shift+Tab, Ctrl+L and Alt+arrow; the register test of US-QS-11 checks this, and until it exists review does. Keys a widget handles itself (arrow keys in a menu or tabs, Esc in an overlay, DS-40) stay in the widget and are not in the register.                                                                                                                                                                                                                                                  |

---

## 5. AI implementation checklist (Claude Code, before delivering a component or page)

Run through all six. If an answer is "no", fix it or state the exception and the reason in the PR.

1. **Placement and boundaries.** Is the file in the right layer (`ui` / `shared` / `<module>/`, DS-01…06)? Imports only downward, through `index.ts`, no cross-module component import (DS-41…43)? Does a story/requirement ID in `docs/specs/product/` exist for it?
2. **Client runtime.** Route page lazy-loaded through the module `index.ts`; data only through the module `*-api.ts`; device/browser APIs only through `src/shared/platform/`; offline state handled; no `"use client"` directives (DS-07…11)?
3. **Mobile first.** Unprefixed classes are the phone layout; only `sm:`/`md:`/`lg:`/`xl:` scale up, no `max-*`; `h-dvh` not `h-screen`; checked at 360px and 320px with no horizontal scroll; modal/table/nav use the adaptive patterns (DS-12…25)?
4. **Tokens, variants, focus.** Only semantic tokens (no color literals, no palette classes); `cn()` for classes; CVA for variants in `ui`; visible `focus-visible` ring; 44×44 px targets; `aria-label` on icon buttons; contrast holds in light and dark (DS-15…20, 27…40)?
5. **States and forms.** Loading skeleton with the same box sizes (no CLS), empty state and error state each with a next action (P-09); forms via `react-hook-form` + `zod` + `Form` primitive, German texts by error code, unknown values show "unbekannt" (DS-26, 47…56, P-08)?
6. **Proof.** Tests named with the story ID, written against what the user sees; `npm run design-system` (in `app/`) and `make ci` run and their result reported honestly (pass/fail with output); the DS baseline did not grow (section 6); spec status updated in the same PR.

---

## 6. Enforcement in CI

Rules marked 🔒 are checked by `app/tools/check/code/design-system/check-design-system.mjs`, wired in as `npm run design-system` and part of `make gates` / `make ci` (same pattern as `check-boundaries`, `check-baseline`).

- **Ratchet, not a big bang.** The `web` package violates many rules today (section 0). Known violations are recorded in `app/config/gates/baselines/quality-ds-baseline.json` as `{ rule, file, count }`. The check fails when
  - a violation appears that is **not** in the baseline (new code must comply), or
  - the count for an entry **grows**, or
  - an entry is **stale** (the violation is gone but the entry remains: delete it, so the baseline only shrinks).
- **No weakening.** The rules, the script and the thresholds are gate files (`AGENTS.md`). The baseline is guarded against growth only: an agent may shrink it, a change that grows it needs a human (US-QG-07). An agent never edits any of them to turn a red run green. Changes to a rule go in their own PR with a reason (US-QG-07).
- **Framework adoption rule (DS-57 🔒):** while the web package does not depend on `tailwindcss`, `class-variance-authority`, `clsx`, `tailwind-merge`, `react-hook-form` and `zod`, or lacks `shared/ui` and `shared/lib/utils.ts`, the check reports the missing pieces as baseline entries. They are removed when the migration issues land. It never passes silently for an app that does not use the design system.
- **Findings** are tracked as GitHub issues with the label `design-system` and the rule ID in the title (for example `DS-27: replace color literals in pokedex.css`), one issue per rule and module, so each is a small, claimable task.
