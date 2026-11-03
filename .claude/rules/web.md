---
paths:
  - "app/packages/web/**"
---

# Rules for `packages/web` (React PWA)

- Mobile first (P-11): design for a phone next to the plant (photo, measure, water, repot), then widen. Touch targets and one-hand use matter more than desktop density.
- All UI texts are German (the only German in the code). No hard-coded English strings in the UI.
- UI texts live in the feature's message table `<feature>/<feature>.de.json` and are read through `texts()` from `shared/lib/text-rules/texts.ts`, never as literals in JSX, user-facing props or toasts (FR-QG-26). The ESLint rule `ui-text/no-literal-text` reports a literal; files still in `app/config/gates/baselines/ui-text-baseline.json` may keep their count until migrated, and the count only shrinks. When you touch such a file, move its texts.
- Import `core` only from the package root `@pflanzendex/core` (AB-2). Never import API or db code; talk to the backend over HTTP only (AB-6).
- Translate errors by their `code` into the German text; never show raw server messages or exception text to the user (P-10).
- Every view says what to do next (P-09): empty states and errors offer an action.
- Unknown values show "unbekannt", never an invented number (P-08).
- Tokens come from OIDC with PKCE; passwords never touch our code (FR-ACC-03). No secrets in `VITE_*` variables.
- Before building a component, check the component inventory in `docs/guides/reference/design-system.md` (section 4.4); a new component in `shared/ui`, `shared/patterns` or `components/shared` gets its row there (`make reference-check`, US-QG-10).
- Tests carry the story ID in the name; components are tested through what the user sees.
- Styling is Tailwind utility classes on components; `styles/tokens.css` (tokens, `@theme`, base layer with preflight) is the only stylesheet. No `*.css` next to components, no legacy class names, no `!` overrides (DS-27, DS-33).
