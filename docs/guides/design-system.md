# docs/guides/design-system.md

Normative ruleset for every UI component and page in this repository. It is the reference for humans and agents when UI is created, changed or refactored. Rules carry IDs (`DS-nn`) so that issues, reviews and the CI check (`npm run design-system` in `app/`, section 6) can point at them.

- **Keywords:** MUST / MUST NOT are enforced (by CI where marked 🔒, otherwise by review). SHOULD is the default unless there is a written reason.
- **Language:** this file and all identifiers are English; user-visible UI text is German (ADR 0004, `.claude/rules/web.md`).
- **Product principles that shape the UI:** P-09 (every view says what to do next), P-08 (unknown values show "unbekannt", never an invented number), P-10 (nothing disappears silently), P-11 (mobile first, one-hand use).

## 0. Platform decision and status

**Target platform: a client-side SPA (Vite + React 19) that is an installable PWA, and later can be wrapped as a native app.** There is no server-side rendering and no React Server Components: the product is private, per-account and interactive, the backend is the separate `api` package (AB-6), and sign-in is OIDC with PKCE in the browser. Native later means wrapping the same build in a shell (Capacitor); a React Native rewrite would not reuse DOM components, only `core` and the API clients, which is why UI-independent logic stays out of components.

This document describes the **target** UI stack. The `web` package does not match it yet:

| Topic              | Target (this document)                                                      | Today (`app/packages/web`)                                                                |
| ------------------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Framework          | Vite SPA + PWA, React 19, client-side router                                | Vite 8 + React 19 SPA/PWA (matches)                                                       |
| Styling            | Tailwind CSS v4 (`@tailwindcss/vite`), `clsx` + `tailwind-merge`, CVA       | Tailwind v4 with preflight; `styles/tokens.css` is the only stylesheet                    |
| Primitives         | shadcn/ui pattern (Vite flavour), Radix / Base UI, owned in `components/ui` | Owned in `components/ui` (Button, Input, Select, Checkbox, Dialog, Sheet, Table, Form, …) |
| Forms              | `react-hook-form` + `zod` behind a `Form` primitive                         | `react-hook-form` + `zod` behind the `Form` primitive                                     |
| Layout of the code | `components/ui`, `components/shared`, `<module>/` folders                   | `src/<module>/` with `index.ts` as public interface (`modules.config.mjs`)                |
| Device access      | Only through `src/platform/` adapters                                       | Direct browser APIs in components                                                         |

The gap is tracked as issues (label `design-system`), every deviation is listed in `app/quality-ds-baseline.json` and may only shrink (ratchet, section 6).

**Paths and aliases.** `@/` means `app/packages/web/src/`. A module is a top-level folder of `src/` other than `components`, `lib`, `platform` and `styles`; its name and allowed dependencies come from ADR 0003 and `app/modules.config.mjs`. This file never defines its own module list.

---

## 1. Architecture & directory rules

### 1.1 Layout

```
src/
├── main.tsx                     # bootstrap: providers, router, service worker registration
├── components/
│   ├── ui/                      # atomic primitives, NO domain logic
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── dialog.tsx
│   │   ├── sheet.tsx
│   │   ├── table.tsx
│   │   ├── form.tsx
│   │   └── skeleton.tsx
│   └── shared/                  # cross-module composites, still no domain rules
│       ├── app-shell.tsx
│       ├── global-header.tsx
│       ├── mobile-nav-bar.tsx
│       ├── responsive-modal.tsx
│       ├── responsive-table.tsx
│       └── empty-state.tsx
├── platform/                    # adapters for device/browser APIs (section 1.3)
│   ├── camera.ts  notifications.ts  share.ts  storage.ts  geolocation.ts
├── lib/
│   └── utils.ts                 # cn() and other pure helpers
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

| ID    | Rule                                                                                                                                                                                                                                                                                                                   |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DS-01 | `components/ui` holds atomic, lightly styled primitives only (Button, Input, Label, Textarea, Select, Checkbox, Sheet, Dialog, Table, Skeleton, Badge, Form). It MUST NOT import from `components/shared`, from any module, from `core`, or from API code. It knows no domain term (no "specimen", "zone", "wish"). 🔒 |
| DS-02 | `components/shared` holds composites used by **two or more** modules or by the app shell (GlobalHeader, AppShell, MobileNavBar, ResponsiveModal, ResponsiveTable, EmptyState). It MAY import `components/ui`, `components/shared`, `lib`, `platform`. It MUST NOT import any module. 🔒                                |
| DS-03 | A module's components live in its folder. They MAY import `components/ui`, `components/shared`, `lib`, `platform` and the module's own files.                                                                                                                                                                          |
| DS-04 | A module component MUST NOT be imported from another module. If a second module needs it, move it to `components/shared` (if it has no domain rule) or expose data through the module's `index.ts` and let the consumer render it (section 4.1). 🔒                                                                    |
| DS-05 | The router (in `main.tsx` or `routes.tsx`) composes module `index.ts` exports and shared components. It contains no business logic.                                                                                                                                                                                    |
| DS-06 | Promotion rule: write it in the module first. Move it to `shared` when a **second** module needs it, to `ui` when it has no domain-specific text, data or behavior left. Do not pre-build shared components "just in case".                                                                                            |

### 1.3 Client runtime rules (SPA, PWA, native shell)

Everything runs on the client. The rules keep the app fast on a phone, offline-tolerant and portable to a native shell.

| ID    | Rule                                                                                                                                                                                                                                                                                                                                                                        |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DS-07 | No `"use client"` / `"use server"` directives; they are meaningless in a Vite SPA and mark code copied from Next.js examples. 🔒                                                                                                                                                                                                                                            |
| DS-08 | **Split by route.** Each route-level page is loaded with `React.lazy` (the module's `index.ts` exports the lazy page) behind one `Suspense` boundary with a skeleton, so the first load contains only the shell and the current route. Initial JS budget: starting value 170 kB gzipped (assumption, checked with `lighthouse`).                                            |
| DS-09 | **Data only through the module's `*-api.ts`**, never `fetch` inside a component. Every request has a pending, error and empty state (P-09, P-10). Dates are local calendar date strings (see the `date-and-timezone` skill). Server state is cached by one data layer (decision pending: TanStack Query or equivalent).                                                     |
| DS-10 | **Device and browser APIs only through `src/platform/`** (camera, photo picker, notifications, share, geolocation, storage, haptics, clipboard, service worker). Components call the adapter; the PWA implementation uses the web API, a native shell swaps in the Capacitor plugin. No `navigator.*`, `localStorage`, `sessionStorage` or `Notification` in components. 🔒 |
| DS-11 | **Offline and shell behavior.** Every view handles "offline" explicitly (show cached data with a note, queue writes with a visible state, never a silent failure, P-10). Navigation uses the router (back works, no reliance on browser chrome); no hover-only interactions; respect safe areas (DS-22); no `window.open`/`alert`/`confirm` (use `Dialog`/`Sheet`).         |

Route-level page and lazy export:

```tsx
// collection/index.ts   (public interface)
import { lazy } from "react";
export const CollectionPage = lazy(() => import("./CollectionPage"));
export type { SpecimenView } from "./specimen-view";
```

```tsx
// main.tsx (router excerpt)
<Suspense fallback={<PageSkeleton />}>
  <Routes>
    <Route path="/collection" element={<CollectionPage />} />
  </Routes>
</Suspense>
```

Device access through an adapter (the component never touches the browser API):

```ts
// platform/camera.ts
export type Photo = { blob: Blob; takenAt: string };
export async function takePhoto(): Promise<Photo | undefined> {
  // PWA: <input type="file" accept="image/*" capture="environment"> via a hidden input.
  // Native shell: replaced by the Capacitor Camera plugin behind the same signature.
}
```

---

## 2. Mobile-first core guidelines

### 2.1 Upward-only breakpoints

| ID    | Rule                                                                                                                                                                                                        |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DS-12 | The unprefixed style is the phone (`< 640px`). Responsive logic scales **up** with `sm:` (640), `md:` (768), `lg:` (1024), `xl:` (1280). `max-*:` variants and `@media (max-width: …)` MUST NOT be used. 🔒 |
| DS-13 | Design and test at 360×640 first. No horizontal page scroll at 320px. Side gutter on mobile is `px-4`.                                                                                                      |
| DS-14 | Do not hide essential actions behind `sm:` or `md:` (`hidden md:block` on the only way to do something is a bug). Hide secondary chrome only.                                                               |

```tsx
// Good: phone baseline, then widen
<div className="flex flex-col gap-3 px-4 sm:flex-row sm:items-center sm:gap-4 lg:px-8" />

// Bad: desktop baseline, then shrink
<div className="flex-row max-sm:flex-col" />
```

### 2.2 Touch and accessibility

| ID    | Rule                                                                                                                                                                                                                                                                                                  |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DS-15 | Every interactive control on mobile has a hit area of at least **44×44 px** (`min-h-[44px] min-w-[44px]`). Primitives bake this in (the `touch` size, section 3.3); icon-only buttons use `size="icon"` which is 44×44. A visually smaller glyph may sit inside a 44px target. 🔒 for `components/ui` |
| DS-16 | Adjacent targets are at least 8px apart (`gap-2`).                                                                                                                                                                                                                                                    |
| DS-17 | Icon-only controls carry `aria-label` (German). Decorative icons carry `aria-hidden`.                                                                                                                                                                                                                 |
| DS-18 | Inputs use `text-base` (16px) on mobile so iOS does not zoom on focus; `sm:text-sm` is allowed.                                                                                                                                                                                                       |
| DS-19 | Use the right `type`, `inputmode` and `autocomplete` on inputs. Never convey meaning by color alone (add text or icon). Respect `prefers-reduced-motion` (`motion-safe:` for transitions).                                                                                                            |
| DS-20 | Text contrast is at least 4.5:1 (3:1 for large text and UI borders) in light and dark. `style-contrast.test.ts` stays green and is extended to every new token pair.                                                                                                                                  |

### 2.3 Viewport handling

| ID    | Rule                                                                                                                                                                             |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DS-21 | Use `h-dvh` / `min-h-dvh` / `max-h-dvh`, never `h-screen`, `min-h-screen` or `100vh`. 🔒                                                                                         |
| DS-22 | Respect safe areas on fixed edges: bottom bars use `pb-[env(safe-area-inset-bottom)]`, and `viewport-fit=cover` is set. Content under a sticky bar gets matching bottom padding. |

```tsx
<div className="flex min-h-dvh flex-col bg-background text-foreground">
  <GlobalHeader />
  <main className="flex-1 px-4 pb-24 md:pb-8">{children}</main>
  <MobileNavBar /> {/* fixed bottom, hidden from md: up */}
</div>
```

### 2.4 Responsive adaptive patterns

| ID    | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DS-23 | **Modals:** below `md` a bottom Sheet (Vaul-based `@/components/ui/overlays/sheet/sheet`), from `md` a centered Dialog. Modules use `ResponsiveModal`, never a bare `Dialog` for content a phone user must fill in.                                                                                                                                                                                                                                                                         |
| DS-24 | **Tables:** below `md` a stack of cards (one card per row, label/value pairs, the row's main action reachable), from `md` the real `Table`. Both views render from the same column definition so they cannot drift. Use `ResponsiveTable`.                                                                                                                                                                                                                                                  |
| DS-25 | **Navigation (ADR 0011 decision 6):** below `md` a fixed bottom bar with at most 5 slots (the first four destinations plus "Mehr", which opens a sheet with the rest); from `md` a navigation rail (about 80 px, icon with label under it, all destinations); from `xl` a labelled sidebar (248 px, product name on top). Bar, rail and sidebar render the same single list of destinations. The active item is never shown by colour alone (pill or fill, semibold label, `aria-current`). |
| DS-26 | Every list/table/detail view defines its empty, loading and error state, and each offers a next action (P-09).                                                                                                                                                                                                                                                                                                                                                                              |

`ResponsiveModal` sketch (the choice is made with CSS/media query hook, content rendered once):

```tsx
import * as React from "react";
import { useMediaQuery } from "@/lib/use-media-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/overlays/dialog/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/overlays/sheet/sheet";

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

Since the Greenhouse redesign (ADR 0011, US-QS-14) the values of these tokens, the radius tokens (`radius-control` 14 px, `radius-tile` 16 px, `radius-card` 22 px, `radius-pill`; the Tailwind steps `lg`, `xl`, `2xl` map to control, tile and card), the elevation levels (`shadow-elevation-1`, `shadow-elevation-2`), the motion tokens (`--motion-fast`, `--motion-base`, `--motion-slow`, `ease-enter`, `ease-leave`; 0 ms under `prefers-reduced-motion`) and the type scale (`text-xs` to `text-4xl`, plus `text-label`) live in `styles/tokens.css`; the font is self-hosted Figtree (`font-sans`). The literal values in the sketch above are illustrative.

Always pair a surface with its foreground: `bg-primary text-primary-foreground`, `bg-card text-card-foreground`, `bg-muted text-muted-foreground`.

### 3.2 The `cn()` helper

```ts
// lib/utils.ts
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
| DS-34 | Every component in `components/ui` with more than one visual state is built with `class-variance-authority`. Variant logic by `if`/ternary on class strings is not allowed there. 🔒                        |
| DS-35 | Variants are named by intent (`default`, `secondary`, `outline`, `ghost`, `destructive`, `link`) and sizes by role (`sm`, `default`, `lg`, `icon`, `touch`). Always set `defaultVariants`.                  |
| DS-36 | Components forward `ref`, spread remaining props onto the root element and keep native semantics (`<button>` for actions, `<a>`/`Link` for navigation). Radix `asChild` is used instead of re-implementing. |

```tsx
// components/ui/button/button.tsx
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

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

| ID    | Rule                                                                                                                                                                                                                                         |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DS-37 | Every focusable element shows `focus-visible:ring-2 focus-visible:ring-ring` (plus offset on surfaces). `outline: none` / `outline-none` is only allowed together with that ring. Never remove the focus indicator. 🔒                       |
| DS-38 | Invalid fields use `aria-invalid` and the `destructive` token (`aria-invalid:border-destructive`), and show an error message linked by `aria-describedby`; color is never the only signal (the existing `invalid-field-style.test.ts` rule). |
| DS-39 | Disabled state is `disabled:opacity-50 disabled:pointer-events-none`; do not use disabled to hide a missing explanation: say why (P-09).                                                                                                     |
| DS-40 | Keyboard: every overlay traps focus, closes on Esc, and returns focus to its trigger (Radix does this; do not break it with custom wrappers).                                                                                                |

---

## 4. Modulith component library guidelines

### 4.1 Sharing across modules without cycles

The module list and the allowed dependencies are defined once, in ADR 0003 and `app/modules.config.mjs`. The UI follows them.

| ID    | Rule                                                                                                                                                                                                                                                                                                                                                              |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DS-41 | Dependency direction for UI: `<module>` → `components/shared` → `components/ui` → `lib`. Never upward, never sideways between modules. `ui` does not import `shared`; `shared` does not import modules. 🔒                                                                                                                                                        |
| DS-42 | A module is consumed only through its `index.ts`. No deep imports (`@/care/specimen-card`). 🔒 (same mechanism as AB-8)                                                                                                                                                                                                                                           |
| DS-43 | If module A must show something owned by module B, B exports a **data function or a slot-friendly component through `index.ts`** and A is allowed to depend on B in `modules.config.mjs`. If that edge is not allowed, A receives the content as `children`/props from a page or from `today` (the aggregation module). Do not add the edge to make a UI compile. |
| DS-44 | A shared component takes **data and callbacks, not domain objects**. `MobileNavBar` receives `items: {href, label, icon}[]`, not a list of modules; `EmptyState` receives `title`, `description`, `action`. If it needs a domain type, it belongs in a module.                                                                                                    |
| DS-45 | No barrel file in `components/ui` or `shared` that re-exports whole folders if it hurts tree-shaking or creates import cycles; import by file, or keep the barrel explicit.                                                                                                                                                                                       |
| DS-46 | Cross-module navigation is by route (`href`), not by component import.                                                                                                                                                                                                                                                                                            |

### 4.2 Forms: react-hook-form + zod + `Form` primitive

| ID    | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DS-47 | Forms use `react-hook-form` with `zodResolver`. The schema lives in the module (`schemas.ts`), is the single source for types (`z.infer`), and is **not** the authority for business rules: the server operation validates again (P-03), the client schema only gives fast feedback.                                                                                                                                                                                                                                                                                                                                |
| DS-48 | Fields are built with the `Form` primitives (`FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage`) so label, description, error and `aria-*` are wired automatically. A bare `<input>` outside `components/ui` is not allowed. The gate also flags the other raw controls (`button`, `select`, `textarea`, `form`, `a` with `onClick` and no real `href`) and an interactive `role` (`tab`, `menuitem`, `option`, ...) on a plain element. A component imported from `components/ui` (such as `Button`) may take an interactive `role` (Tabs, Menu); it renders a real control. 🔒 |
| DS-49 | Error text is German and comes from the message table by error code (`ERROR_TEXTS`); a server error code is mapped to the field or a form-level message. Never show raw server text (P-10).                                                                                                                                                                                                                                                                                                                                                                                                                         |
| DS-50 | Submit buttons show a pending state and are disabled while submitting; success and failure are both visible (toast or inline), never silent. Unsaved input is not discarded without confirmation.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| DS-51 | Dates are local calendar dates as strings (`YYYY-MM-DD`) in forms; see the `date-and-timezone` skill.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

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
import { Button } from "@/components/ui/button/button";
import { Input } from "@/components/ui/fields/input/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/fields/form/form";
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

| ID    | Rule                                                                                                                                                                                                                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DS-52 | Every async view has a skeleton that has the **same structure and box sizes** as the loaded mobile layout: same container, same number of rows (or a fixed plausible count), same heights. Cumulative Layout Shift stays < 0.1 (assumption, starting value; measured by the `lighthouse` script). |
| DS-53 | Skeletons are built from `components/ui/display/skeleton/skeleton.tsx` and live next to the component they mirror (`specimen-card.skeleton.tsx`). When the real component changes size, the skeleton changes in the same PR.                                                                      |
| DS-54 | Images and media reserve space with `aspect-*` or explicit `width`/`height`. No element is inserted above already visible content after load (banners, error bars use reserved space or an overlay).                                                                                              |
| DS-55 | Route-level pages load behind one `Suspense` boundary whose fallback is the page skeleton (DS-08); inside a page, wrap the **smallest** lazy or async part in its own `Suspense`/pending state, so the shell and header render at once.                                                           |
| DS-56 | Skeletons are `aria-hidden` with a single `role="status"` + visually hidden "Lädt…" text on the container. Animation respects `motion-reduce`. A loading state never shows an invented number (P-08).                                                                                             |

```tsx
// components/ui/display/skeleton/skeleton.tsx
import { cn } from "@/lib/utils";

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

---

## 5. AI implementation checklist (Claude Code, before delivering a component or page)

Run through all six. If an answer is "no", fix it or state the exception and the reason in the PR.

1. **Placement and boundaries.** Is the file in the right layer (`ui` / `shared` / `<module>/`, DS-01…06)? Imports only downward, through `index.ts`, no cross-module component import (DS-41…43)? Does a story/requirement ID in `docs/specs/product/` exist for it?
2. **Client runtime.** Route page lazy-loaded through the module `index.ts`; data only through the module `*-api.ts`; device/browser APIs only through `src/platform/`; offline state handled; no `"use client"` directives (DS-07…11)?
3. **Mobile first.** Unprefixed classes are the phone layout; only `sm:`/`md:`/`lg:`/`xl:` scale up, no `max-*`; `h-dvh` not `h-screen`; checked at 360px and 320px with no horizontal scroll; modal/table/nav use the adaptive patterns (DS-12…25)?
4. **Tokens, variants, focus.** Only semantic tokens (no color literals, no palette classes); `cn()` for classes; CVA for variants in `ui`; visible `focus-visible` ring; 44×44 px targets; `aria-label` on icon buttons; contrast holds in light and dark (DS-15…20, 27…40)?
5. **States and forms.** Loading skeleton with the same box sizes (no CLS), empty state and error state each with a next action (P-09); forms via `react-hook-form` + `zod` + `Form` primitive, German texts by error code, unknown values show "unbekannt" (DS-26, 47…56, P-08)?
6. **Proof.** Tests named with the story ID, written against what the user sees; `npm run design-system` (in `app/`) and `make ci` run and their result reported honestly (pass/fail with output); the DS baseline did not grow (section 6); spec status updated in the same PR.

---

## 6. Enforcement in CI

Rules marked 🔒 are checked by `app/tools/check/code/design-system/check-design-system.mjs`, wired in as `npm run design-system` and part of `make gates` / `make ci` (same pattern as `check-boundaries`, `check-baseline`).

- **Ratchet, not a big bang.** The `web` package violates many rules today (section 0). Known violations are recorded in `app/quality-ds-baseline.json` as `{ rule, file, count }`. The check fails when
  - a violation appears that is **not** in the baseline (new code must comply), or
  - the count for an entry **grows**, or
  - an entry is **stale** (the violation is gone but the entry remains: delete it, so the baseline only shrinks).
- **No weakening.** The baseline, the rules, the script and the thresholds are gate files (`AGENTS.md`). An agent never edits them to turn a red run green. Changes to a rule go in their own PR with a reason (US-QG-07).
- **Framework adoption rule (DS-57 🔒):** while the web package does not depend on `tailwindcss`, `class-variance-authority`, `clsx`, `tailwind-merge`, `react-hook-form` and `zod`, or lacks `components/ui` and `lib/utils.ts`, the check reports the missing pieces as baseline entries. They are removed when the migration issues land. It never passes silently for an app that does not use the design system.
- **Findings** are tracked as GitHub issues with the label `design-system` and the rule ID in the title (for example `DS-27: replace color literals in pokedex.css`), one issue per rule and module, so each is a small, claimable task.
