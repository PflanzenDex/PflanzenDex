# 0007 · Component library (shadcn pattern), Storybook catalog, bundle budget

- **Status:** proposed (2026-10-05). The project owner confirms or changes each decision in the review of this ADR's PR; the status of every decision is stated below.
- **Refines:** TE-17 (design system migration), TE-18 (living component catalog); complements ADR [0006](0006-vite-spa-pwa-capacitor.md) (E-21), which decides framework, router and data layer
- **Decision record:** E-22 in `docs/specs/product/16-releases-and-decisions.md`
- **Rules:** `docs/guides/reference/design-system.md` (DS-01, DS-08, DS-15, DS-23, DS-28 and sections 3 and 6), `US-QS-07`

## Context

ADR 0006 settles the platform (Vite SPA and PWA, React Router, TanStack Query). It leaves open how the UI components are built and shown, and what the first-load size may be. Later issues (Storybook setup, stack, primitives, conformance gates) depend on these answers. Today `web` has no primitives: native elements styled per module with plain CSS.

This ADR contains six decisions. Each states status, reason, alternatives and consequences. The numbers in the issue are the project owner's proposals; where a number is not measured it is marked as an assumption (P-08, FR-QG-09).

## Decision 1 · Component library: shadcn/ui pattern on Radix, Vaul and CVA

- **Status:** proposed, owner confirms in the ADR PR review. The choice between Radix and Base UI is made once, here (see alternatives).
- **Decision:** components are owned code in `app/packages/web/src/components/ui` (copied and adapted, not an npm dependency of shadcn). Behavior and accessibility come from Radix UI primitives (the unified `radix-ui` package or `@radix-ui/react-*`), the bottom Sheet from Vaul, variants from `class-variance-authority`, class merging from `cn()` (`clsx` + `tailwind-merge`) in `src/lib/utils.ts`.
- **Reason:** one place for styling; focus handling, ARIA and keyboard behavior come from tested primitives instead of hand-written code; no runtime styling library (styles are Tailwind v4 classes); it fits the placement rules DS-01 and DS-06 and the token rules DS-28 to DS-36.
- **Alternatives:**

| Option                                    | Verdict                                                                                                                                                                 |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base UI instead of Radix                  | Possible and similar in shape. Not chosen as default because the shadcn pattern, its examples and Vaul are Radix-centered. Decided once here; a switch needs a new ADR. |
| A packaged library (MUI, Mantine, Chakra) | Rejected: runtime styling or a theme system that competes with Tailwind tokens, less control over the 44 px targets (DS-15), larger bundle.                             |
| Headless UI                               | Rejected: smaller primitive set, no bottom sheet.                                                                                                                       |
| Hand-written primitives                   | Rejected: accessibility behavior (focus trap, dismissal, roving focus) would have to be built and tested by us.                                                         |

- **Consequences:**
  - Owned code means we maintain it: upstream fixes of copied components are applied by hand, not by `npm update`.
  - **Renovate:** `radix-ui` (or the `@radix-ui/react-*` packages), `vaul`, `class-variance-authority`, `clsx` and `tailwind-merge` become tracked dependencies. Radix primitives are many small packages if the split form is used; the unified package keeps the PR count low. Grouping them in one Renovate group is recommended (see decision 2 for the same idea for Storybook).
  - **knip:** a dependency needs a consumer. The dependencies are added in the same issue that adds the first component using them, never in advance, so knip stays green and no unused dependency is declared.
  - **CI time:** no extra step; the added code goes through the existing lint, typecheck and test steps. Primitive tests (decision 2) add some test time.
  - Primitives stay free of domain terms and of imports from modules (DS-01, enforced by the design system gate).

## Decision 2 · Living catalog: Storybook

- **Status:** proposed, owner confirms in the ADR PR review. If the owner rejects Storybook, Ladle is the fallback.
- **Decision:** Storybook with `@storybook/react-vite` (current major at implementation time) is the living catalog (TE-18).
- **Reason:** `addon-a11y` runs axe per story; the Vitest addon and portable stories let stories double as tests, so design system conformance (touch target, focus, contrast) can run in browser mode; there is a theme and dark toolbar; visual-test tooling integrates with it. This serves QG-U5 and US-QS-07.
- **Alternatives:**

| Option                | Verdict                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ladle                 | Lighter and faster to start, but without a comparable a11y, test and visual ecosystem. Fallback: the conformance gate issue then uses Vitest browser mode directly on the component files. |
| Histoire, custom page | Not chosen: smaller ecosystems, no per-story a11y and test integration.                                                                                                                    |
| No catalog            | Rejected: TE-18 requires every component shown in all variants and states.                                                                                                                 |

- **Consequences:**
  - **Renovate:** Storybook is a large devDependency tree and its packages must move together. Group all `storybook` and `@storybook/*` packages in one Renovate group, so a major upgrade is one PR.
  - **knip:** `.storybook/` and `*.stories.tsx` are entry files for knip (configured in the Storybook setup issue); the addons must be referenced from the Storybook config so none is reported as unused.
  - **CI time:** a `storybook build` step is added to CI, and stories run as tests if the Vitest addon is used. Both add time. The amount is not known and is measured in the setup issue (no number is assumed here); if it hurts, the Storybook build can run only when `components/` or `.storybook/` change.
  - The Storybook build output is not part of the app bundle and does not count against decision 5.

## Decision 3 · Rule: every shared component has stories

- **Status:** proposed, owner confirms in the ADR PR review.
- **Decision:** every component in `components/ui` and `components/shared` has a `*.stories.tsx` file covering all variants and sizes, and the states default, focus, disabled, invalid and loading (where the component has them), each in light and dark.
- **Reason:** the catalog is only trustworthy if it is complete; the states listed are the ones that break most often on a phone and in dark mode, and they are where DS-15 to DS-20 are checked.
- **Alternatives:** stories only for "important" components (rejected: the cut is arbitrary and drifts); stories required by review only (rejected: not enforceable, see AGENTS.md on gates over goodwill).
- **Consequences:**
  - Enforcement is a separate gate issue, not part of this ADR. Until it exists the rule is checked by review.
  - New components cost a stories file; the gate's exception list may only shrink (ratchet, FR-QG-17), like the existing design system baseline.
  - Stories are included in lint, typecheck and format checks; knip treats them as entries (decision 2).

## Decision 4 · `Select` wraps a styled native `<select>`

- **Status:** proposed, owner confirms in the ADR PR review.
- **Decision:** the `Select` primitive in `components/ui` wraps a styled native `<select>`. A Radix Select is added only for a concrete need that a native control cannot meet (for example rich options with icons), by its own issue.
- **Reason:** the native control gives the best phone picker (OS wheel or sheet, one-hand use, P-11), is accessible by default and needs no JavaScript; no dependency is needed.
- **Alternatives:** Radix Select for everything (rejected as default: custom listbox on a phone is worse than the OS picker, more code, more bundle); a combobox library (not needed now).
- **Consequences:**
  - Styling of the open list is limited to what the browser allows; this is accepted.
  - The 44 px target (DS-15) and `text-base` (DS-18) are baked into the wrapper.
  - No new dependency, so no Renovate or knip effect; a later Radix Select is a new issue and a new dependency use.

## Decision 5 · Bundle budget (DS-08)

- **Status:** starting value is an assumption; the measured number is decided in the budget issue and confirmed by the owner there.
- **Decision:** the budget for initial JavaScript (gzipped) is set from a measurement, not in advance. `docs/guides/reference/design-system.md` DS-08 names 170 kB as a starting value; that is an assumption, not a measurement. The budget issue measures the real first load (`make lighthouse`, `vite build` size output), then writes the measured number plus a stated headroom into the budget. Until then no hard limit is enforced on the strength of 170 kB.
- **Reason:** P-08 and FR-QG-09 forbid invented numbers; a limit that was never measured is either always red or meaningless.
- **Alternatives:** fix 170 kB now (rejected: unmeasured); no budget (rejected: DS-08 asks for route-level splitting to be checkable).
- **Consequences:**
  - The component library and Storybook choices do not enlarge the first load by themselves: Storybook is not shipped, and Radix/Vaul are imported per component and split per route (DS-08), which the measurement will show.
  - The gate for the budget is its own issue; it must not be loosened to turn a run green (US-QG-07).
  - **CI time:** the check needs a production build and a measurement; `make lighthouse` already exists, so the cost is the build already done for `make ci`.
  - **Renovate:** a dependency update can move the number; the budget gate makes that visible in the update PR.

## Decision 6 · Dark mode follows the system

- **Status:** proposed, owner confirms in the ADR PR review.
- **Decision:** dark mode keeps `prefers-color-scheme` (today's behavior). Tailwind's `dark:` variant is bound to it with `@custom-variant dark (@media (prefers-color-scheme: dark));`. A manual light/dark toggle is a separate story and not part of this migration.
- **Reason:** it is what the app does today, needs no stored preference and no flash-of-wrong-theme handling, and keeps the migration small.
- **Alternatives:** the `.dark` class sketched in `docs/guides/reference/design-system.md` section 3.1 with a toggle (deferred: it needs a story, a stored setting and a no-flash bootstrap); a `data-theme` attribute (same cost).
- **Consequences:**
  - Tokens are redefined for dark inside `@media (prefers-color-scheme: dark)` instead of under `.dark`; the sketch in `docs/guides/reference/design-system.md` section 3.1 differs in selector only. The stack issue adjusts the sketch when the tokens are implemented; this ADR does not edit `docs/guides/reference/design-system.md`.
  - Storybook shows dark by emulating the media feature (toolbar), which the catalog setup must support, so stories can be checked in both themes (decision 3).
  - If a toggle is added later, the variant is redefined in one place (`@custom-variant`); components keep using `dark:` and tokens.

## Overall consequences

- **Dependencies:** none are added by this ADR. The implementing issues add them (stack, primitives, Storybook setup), each together with its first consumer.
- **Renovate:** two groups are advised, one for Storybook and one for Radix/Vaul/CVA; auto-merge stays off for majors.
- **knip:** every new dependency has a consumer; story and Storybook config files are entries.
- **CI time:** grows by the Storybook build and the story tests; the amount is measured in the setup issue and reported there.
- Unblocks the Storybook setup, the stack and the primitives issues. A different choice later needs a new ADR that supersedes this one.
