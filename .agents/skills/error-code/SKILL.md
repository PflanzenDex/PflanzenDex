---
name: error-code
description: Use when an operation, API route or screen needs a new user-visible failure. Adds a stable error code `<domain>.<reason>` with its German text and the HTTP mapping, so UI and AI translate by code, never by text (FR-QG-11).
---

# Add an error code

1. Choose `<domain>.<reason>`: lowercase letters and underscores only (`FEHLERCODE_FORMAT` in `app/packages/core/src/kern/fehler.ts`), domain = the operation's domain (`standort`, `lichtzone`), reason in German describing the cause (`name_vergeben`, `in_benutzung`). Reuse an existing code if the cause is the same.
2. Add the code with a complete German sentence to `FEHLERTEXTE` in `app/packages/core/src/kern/fehler.ts`. The text says what happened and what the user can do next (P-09). No technical causes, no stack traces, no foreign data.
3. Never rename or delete a code: clients, tests and the AI connection depend on it. To change the meaning, add a new code and stop using the old one.
4. Return it from the operation with `fehlgeschlagen(fehler("<domain>.<reason>"))`; use `details` for field-specific problems and `daten` for facts the UI shows (e.g. which entries use a zone, P-10).
5. Map it to an HTTP status in `STATUS` in `app/packages/api/src/kern/fehler-http.ts` (400 input, 401 not signed in, 403 forbidden, 404 not found, 409 conflict). An unmapped code becomes 500 on purpose.
6. UI and API translate by `code`, never by comparing the text. Show the server text unless the screen needs its own wording; look at `app/packages/web/src/licht/` for how a screen reacts to codes.
7. Tests: the operation test asserts `r.fehler.code` (see `app/packages/core/src/katalog/pruefung.test.ts`), the API test asserts status and `fehler.code`. The format and non-empty text of all codes are already checked in `app/packages/core/src/kern/fehler.test.ts`.

## Check

```bash
make ci
```

Expected: `fehler.test.ts` passes, the typechecker accepts the new code in `STATUS` and in the operation, and the operation and API tests assert the code.
