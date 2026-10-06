# 0009 · Short access tokens instead of introspection or a deny list

- **Status:** accepted (2026-10-05). Assumption, decided by the product owner (issue #203, delegated to the agent under P-01 to P-11).
- **Refines:** E-03 (self-hosted sign-in service), US-ACC-01 ("sign out on all devices")

## Context

The API verifies access tokens (JWT) only locally (signature, issuer, audience). "Sign out on all devices" revokes the sessions in Keycloak, so refresh tokens stop working at once (`invalid_grant`, `Docs/test-logs/acc-01.md`). An access token that was issued before stays valid until it expires. Options: accept this with a short lifetime, shorten the lifetime further, or check every token against Keycloak (introspection) or a deny list.

## Decision

Accept the residual window and keep the access token lifetime at **5 minutes** (`accessTokenLifespan: 300` in the realm export). No introspection and no deny list for now.

- The API stays stateless towards the sign-in service: no extra request per call, no new runtime dependency on Keycloak (P-11, mobile first: latency counts).
- The worst case after "sign out on all devices" is a stolen or forgotten device that can still call the API for at most 5 minutes without being able to renew. The data of the account is private by default and shared only through the existing barriers (P-05); a longer window than 5 minutes would not be acceptable, a shorter one costs refresh traffic for every user.
- The value is guarded by a test (`app/tools/keycloak/realm.test.mjs`): the realm must keep `accessTokenLifespan <= 300` and `revokeRefreshToken: true`.

## Consequences

- The window is a known, documented property (not a bug). The test log wording "not measured" stays accurate; the bound follows from the lifetime.
- Revisit when a story needs immediate revocation (account deletion, operator block, the AI interface E-04 with scopes). Then add introspection for those routes only, or lower the lifetime. Production realm settings (E-03 operation) must carry the same value.
