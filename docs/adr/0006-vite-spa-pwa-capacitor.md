# 0006 · Web stays a Vite SPA and PWA; Capacitor is the native path

- **Status:** accepted (2026-10-05, project owner)
- **Refines:** E-06 (PWA or native app: "PWA first"), TE-17 (design system migration)
- **Decision record:** E-21 in `docs/specs/product/16-releases-and-decisions.md`
- **Rules:** `docs/guides/design-system.md` sections 0 and 1.3 (DS-07 to DS-11)

## Context

The design system migration (TE-17) needs a settled platform before components, routing and data fetching are built on it. Two ideas were open: moving `web` to a server-rendering framework (Next.js with React Server Components), and the native question left by E-06. Facts that frame the choice:

- The product is private and per account (P-04, P-05). There is no public, indexable page that would profit from server rendering.
- The backend is the separate `api` package. `web` talks to the database only over HTTP (AB-6).
- Sign-in is OIDC with PKCE in the browser (E-03, Keycloak).
- The app is a mobile-first, installable PWA that must handle offline explicitly (DS-11, P-10).
- `web` is already a Vite 8 + React 19 SPA/PWA.

## Decision

1. **Web is a client-side SPA and installable PWA** (Vite + React 19). No Next.js, no React Server Components, no server-side rendering. `"use client"` / `"use server"` directives are forbidden (DS-07).
2. **Native later means Capacitor.** The same build is wrapped in a Capacitor shell. Device and browser APIs are reached only through `src/platform/` adapters (DS-10); the PWA adapter uses the web API, the native shell swaps in the Capacitor plugin. Nothing is built for the shell now beyond keeping that seam clean.
3. **A React Native rewrite is the fallback, not the plan.** If Capacitor proves insufficient, a rewrite would not reuse DOM components. It would reuse only `core` (no I/O, AB-1) and the API clients. Consequence for today: UI-independent logic stays out of components.
4. **Client router: React Router in declarative mode** (`<BrowserRouter>`, `<Routes>`, `<Route>`). Not framework mode, no loaders or actions, no server features. Routes are the unit of code splitting (DS-08) and navigation uses the router so that back works inside a shell (DS-11).
5. **Data layer: TanStack Query** (`@tanstack/react-query`) as the single cache for server state (DS-09). Components never call `fetch`; they use hooks over the module's `*-api.ts`. Every query shows pending, error and empty states. The offline behavior (cached data with a note, queued writes with a visible state) is built on its cache and mutation handling.

## Why not Next.js

- **No benefit from SSR/RSC:** the content is private and per account, so there is nothing for crawlers and no shared HTML to cache at an edge.
- **Duplicated backend:** Route Handlers and server actions would create a second server next to `api` and blur AB-6 and the validating operations (P-03). Tenant isolation (P-04) would have to be proven in two places.
- **Auth fit:** OIDC with PKCE is a browser flow against Keycloak; a server session layer in the web tier adds a moving part without a requirement.
- **PWA and offline:** an installable, offline-tolerant shell is simplest as static assets plus a service worker. A Node runtime in the web tier is extra operations on self-hosted hardware (R-11).
- **Native path:** Capacitor wraps static assets. A server-rendered app would need either a remote-URL shell or a second client.
- **Cost of switching:** the existing `web` package is already a Vite SPA; moving would be rework with no product gain.

## Alternatives considered

| Option                        | Verdict                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js (App Router, RSC)     | Rejected, reasons above.                                                                                                                                |
| React Native / Expo now       | Rejected for now: a second UI codebase before the product is validated. Kept as fallback (item 3).                                                      |
| Router: TanStack Router       | Not chosen: the declarative React Router covers the needs without framework mode.                                                                       |
| Data: SWR, hand-written hooks | Not chosen: TanStack Query gives the cache, retry and mutation semantics DS-09 asks for ("or equivalent" stays open only if a concrete defect appears). |

## Consequences

- `docs/guides/design-system.md` section 1.3 (DS-09 "decision pending") is settled by this ADR; the follow-up issues implement it (router and data layer setup).
- The dependencies `react-router` and `@tanstack/react-query` are added by the implementing issues, not by this ADR.
- The component library, the Storybook catalog and the bundle budget are not decided here; they are decided in issue 332 (TE-18).
- Any later switch to SSR or to React Native needs a new ADR that supersedes this one.
