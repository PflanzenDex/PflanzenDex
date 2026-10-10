# 0013 · The AI access gets its own module `ai`

- **Status:** accepted by the PO (2026-10-10), revisable. Assumption decided by the product owner under the autonomy rules.
- **Refines:** ADR 0003 (module cut; the register listed the module as `ai-access`, it is renamed `ai` because migration file names are `NNNN_<module>_<name>.sql` and the layout rule allows no hyphen there), E-04 (AI access), E-03 (sign-in service), US-KI-07, FR-KI-04, FR-KI-08, FR-KI-12, FR-KI-13
- **Affects:** `app/config/lint/modules.config.mjs` (table `ai_connection`, epic `KI`), `docs/specs/product/12-ai-assistant.md`

## Context

The keeper's AI client (Claude, ChatGPT, ...) reaches the operations of the app through an open interface (MCP over streamable HTTP, E-04). The sign-in service (Keycloak, spike TE-15) is the OAuth authorization server and issues JWT access tokens (5 minutes, ADR 0009) with the scopes `pflanzen:read`, `pflanzen:draft`, `pflanzen:write` and the interface's URL as audience. Three things cannot live in the sign-in service: Keycloak's consent page only knows "yes" or "no" for all scopes (spike TE-15, open question 5 of `12`); a revocation must take effect on the next call although the token lives up to 5 minutes and a refresh token may still be valid; and the list "Connected AI clients" with name, rights and last use is a product view of the app.

## Decision

A module **`ai`** (`core/src/ai`, `db/src/ai`, `api/src/ai`, `web/src/ai`) with the table `ai_connection` (DM-KI-01; `task`, `draft` and `ai_log` follow with their stories). Dependencies: `kernel`, `account`.

- **The app holds the rights, the token can only narrow them.** A connection is `(account, client_id)` where `client_id` is the `azp` of the token. The effective right of a call is the lower of the right the keeper allowed (`read < drafts < write`) and the highest `pflanzen:*` scope of the token. The first call of a client creates the connection with at most the default `drafts`.
- **Step-up without silent widening.** A token that carries more than the keeper allowed leaves the right as it is, answers `403 insufficient_scope` with the scope to request when the operation needs it, and records a **request** (`requested_rights`) that the keeper sees in the list and confirms with one tap. Only the keeper raises a right. This replaces the deselection on the consent page.
- **Revocation is final until the keeper says otherwise.** A revoked row stays as history (P-10) and blocks the client even with a valid token or refresh token. "Allow again" adds a new row with the default right. At most one active row per client and account (partial unique index).
- **Own audience, no back door.** The AI interface verifies tokens with its own audience (`AI_RESOURCE_URL`, default `http://localhost:3000/mcp`). A token of the web app is rejected there and a token of an AI client is rejected on the keeper's routes, so a connection can never manage connections (FR-KI-10). The interface serves the protected resource metadata (RFC 9728) that points to the sign-in service; the app builds no authorization server (FR-KI-13).
- **Classes in one place.** `AI_OPERATION_CLASSES` in `core` assigns every released operation `read`, `draft`, `write` or `never` (FR-KI-12); the guard of a route takes the right from that class.
- The name of a connection is the optional token claim `client_name`, else the client ID (assumption: a mapper in the realm adds the claim).

## Consequences

- The module register entry `ai` gets the table `ai_connection` and the epic `KI`.
- Reading and writing operations of the later stories (KI-01, KI-02, ...) use `clientAuthentication(options, rightNeeded(op))` and `authorizeClient`; they never create a second path to the data (KI-R1).
- **User tasks** (they need the production sign-in service or real accounts): create the optional realm scopes `pflanzen:read|draft|write`, the audience mapper and the client registration with `resource_url` (spike TE-15 findings 1 to 3, 5, 6); restrict PKCE to S256; a consent page that names client, requested rights and that the keeper's AI provider receives the retrieved data (US-KI-06); optionally a `client_name` mapper; set `AI_RESOURCE_URL`; connect real clients and fix the Keycloak CIMD/DCR gaps (TE-16).
- Revisit when immediate revocation of the token itself is needed (introspection, ADR 0009) or when the sign-in service gets a consent step of its own.
