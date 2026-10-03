---
paths:
  - "app/packages/web/**"
---

# Rules for `packages/web` (React PWA)

- Mobile first (P-11): design for a phone next to the plant (photo, measure, water, repot), then widen. Touch targets and one-hand use matter more than desktop density.
- All UI texts are German and use glossary terms. No hard-coded English strings in the UI.
- Import `core` only from the package root `@pflanzendex/core` (AB-2). Never import API or db code; talk to the backend over HTTP only (AB-6).
- Translate errors by their `code` into the German text; never show raw server messages or exception text to the user (P-10).
- Every view says what to do next (P-09): empty states and errors offer an action.
- Unknown values show "unbekannt", never an invented number (P-08).
- Tokens come from OIDC with PKCE; passwords never touch our code (FR-ACC-03). No secrets in `VITE_*` variables.
- Tests carry the story ID in the name; components are tested through what the user sees.
