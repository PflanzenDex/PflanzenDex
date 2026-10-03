---
paths:
  - "app/packages/api/**"
---

# Rules for `packages/api` (Hono HTTP API)

- Call business logic only through `@pflanzendex/core` (AB-2), never through internal core files. Never import web code.
- Writes run through `fuehreAus` with the `Idempotency-Key` header; replay protection lives in table `idempotenz`. Routes do not write to the database around an operation (P-03).
- Error responses have the shape `{ fehler: { code, text, details?, daten? } }` (see `app/README.md`); map domain errors via `fehler-http.ts`. Never leak stack traces or raw exception messages.
- Every request sets the account through auth middleware (Bearer token: signature via JWKS, issuer, audience `pflanzendex-api`) and `mitKonto`. Unauthenticated requests get 401, foreign data stays invisible (P-04).
- Configuration comes from environment variables (`OIDC_ISSUER`, `OIDC_AUDIENCE`, `DATABASE_URL`, `WEB_URSPUNG`); no secrets in code.
- Tests (`*.test.ts`) carry the story ID in the name and cover the error shape and tenant isolation of each new route.
- New or changed routes are documented in `app/README.md`.
