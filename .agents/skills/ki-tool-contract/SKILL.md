---
name: ki-tool-contract
description: Use when a change releases, changes or withdraws an operation for the AI interface (an MCP tool under /mcp, its class in AI_OPERATION_CLASSES, its arguments or its error codes): description, schema, error codes, contract test and rights whitelist (FR-KI-03, FR-KI-10).
---

# AI tool contract

The AI interface is the MCP endpoint `POST /mcp` (`app/packages/api/src/ai/mcp/`). Each tool is a thin adapter over an existing route under `/mcp/*`; the route keeps the guard, the operation, the log and the limit (KI-R1, KI-R8). A tool is a contract the AI client relies on: its name, description, arguments and error codes.

1. Decide the class first. `AI_OPERATION_CLASSES` in `app/packages/core/src/ai/rights.ts` gives every released operation one class (FR-KI-12): `read`, `draft` (the keeper adopts the result in the app), `write` (reversible operations only) or `never` (friends' data, sharing, swaps, account, connections, partners; FR-KI-10). An operation missing from the table is not released. A write that cannot be undone, or that touches third parties, is `never`.
2. If the operation is new, build it in core first with the `add-core-operation` skill (schema, permission check, error codes). The tool never validates or writes data itself (P-03).
3. Route: the tool calls a route under `/mcp/*`, mounted with the client routes in `app/packages/api/src/ai/` (guard in `app/packages/api/src/ai/guard/client-auth.ts`). Reuse the route when the operation already has one.
4. Tool definition: add an `McpTool` (type in `app/packages/api/src/ai/mcp/tools/schema.ts`) to the set of its area: `app/packages/api/src/ai/mcp/tools/sets/account-tools.ts`, `collection-tools.ts` or `research-tools.ts`. The name is snake_case; `description` is short English for the model; `operation` is the key from step 1; `inputSchema` is built with `object({…}, [required])` (`additionalProperties: false`); `readOnly` is true exactly when the class is `read`; `request(args)` returns the route call. A write tool takes `idempotencyKey: IDEMPOTENCY` and passes it on with `keyOf(args)` (US-QS-03; `claim_task` is the example). Add the tool to `MCP_TOOLS` in `app/packages/api/src/ai/mcp/tools/index.ts`; that order is the order of `tools/list`.
5. Schema: state the allowed values and bounds in the input schema as the operation checks them (`minimum`, `maximum`, `enum`, see `research-tools.ts`). `checkArguments` (`schema.ts`) rejects missing, unknown and wrongly typed fields as a tool error, not a protocol error.
6. Error codes: the operation's codes pass through unchanged in `structuredContent` with `isError: true` (`toolError` in `app/packages/api/src/ai/mcp/tool-call.ts`). A new code gets its German text in `ERROR_TEXTS` (the `error-code` skill).
7. Tests, named with the story ID (`spec-to-tests`):
   - `app/packages/api/src/ai/mcp/protocol.test.ts`, describe "FR-KI-12 FR-KI-03 the tools": a released class, a snake_case name, a valid object schema, the argument check and the request built.
   - `app/packages/api/src/ai/mcp/mcp-routes.test.ts`: the `tools/list` test has the exact ordered list of names, so the new name goes there; add two-account and right tests for the call.
   - `app/packages/core/src/ai/rights.test.ts`: the class matches the right.
8. Reference: add the tool with its class to the "Tools" list in `docs/guides/reference/app.md` (section "AI access: the MCP endpoint").

Not built yet, so do not rely on them:

- Versioned descriptions (FR-KI-03): tools carry no version field. Until one exists, change a tool backward compatibly: add optional arguments, never rename or remove one, and ask the owner before a breaking change.
- The answer `ai.not_released` (FR-KI-10): the spec names it for a call to a never released operation; the code does not define it. A `never` operation has no tool at all, and `toolRight` throws for an operation without a released class.
- Fixed example flows (FR-KI-03): no contract test covers them yet.

## Check

```bash
make test
```

Expected: `protocol.test.ts` ("FR-KI-12 FR-KI-03 the tools") and `rights.test.ts` pass; `mcp-routes.test.ts` passes with the new tool name in its ordered list. Without Docker the database tests run only in CI (`make ci`).
