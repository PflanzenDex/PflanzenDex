# Hono agent docs, skills and CLI; docker build --check (issue 2514)

As of: 2026-11-26 · Issue 2514 · Enabler (epic DEV) · Evaluation only. Nothing in `.claude/`, `AGENTS.md`, `CLAUDE.md` or the gates changes; no skill is installed; no dependency is added.

## Summary

- **`docker build --check` finds nothing.** Both Dockerfiles pass with "Check complete, no warnings found". There is no defect to fix and no finding that would justify a new gate (E-30).
- **Hono docs for agents work.** `https://hono.dev/llms.txt` answers 200 (5.9 kB, an index that links `llms-full.txt` and `llms-small.txt`). A docs page with `Accept: text/markdown` answers 200 with `text/markdown`.
- **`@hono/cli` does not load our app.** The stable line (0.1.11) has no `routes` command. The `next` line (1.0.0-rc.9) has `routes`, `request`, `batch` and `snapshot`, but both bundle the entry with esbuild, and the bundle of `packages/api` fails (see below). `app.routes` read through `tsx` lists the real routes.
- **Skills (`honojs/skills`, `docker/skills`) conflict with project rules in several places** (list below). Not installed.

## 1. docker build --check

Run from `app/` (the build context) on `origin/dev` at `1de52a43`, Docker in Colima, BuildKit:

```sh
docker build --check -f config/deploy/docker/api.Dockerfile .   # no warnings
docker build --check -f config/deploy/docker/web.Dockerfile .   # no warnings
```

The Dockerfiles are no gate files (`isGateFile` is false for both), so a defect would be fixed in a normal PR. There was none. Notes that are not check hits but differ from the Docker skills: no `# syntax=docker/dockerfile:1` line, no `COPY --link`, no `LABEL org.opencontainers.image.*`, `api.Dockerfile` has one stage (it runs `tsx`, no build step). None of them is a defect here.

## 2. @hono/cli

Run with `npx`, nothing added to a `package.json`; entry files were temporary and are removed.

| Version                     | Result                                                                                                                                                                                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@hono/cli@latest` 0.1.11   | Commands: `docs`, `optimize`, `search`, `request`, `serve`. No `routes`. `request -P /health entry.ts` fails: `ERR_INVALID_URL_SCHEME: The URL must be of scheme file` (from the esbuild bundle `__hono_cli_bundle__.js`).                                                                                                      |
| `@hono/cli@next` 1.0.0-rc.9 | Has `routes`, `request`, `batch`, `snapshot`. On an entry that calls `createApp({ pool, reviewer })`: `routes` fails with `Dynamic require of "events" is not supported`; with `-e sharp -e pg -e web-push -e jose -e @aws-sdk/client-s3` it fails with `The URL must be of scheme file`. `request /health` fails the same way. |

Cause (not traced to the line): the CLI bundles the app and its dependencies into one ESM file, and a dependency uses a file URL that the bundle breaks. `createApp` also registers the API routes only when it gets a `pool` and a `reviewer`, so an entry file is needed in any case (`main.ts` starts the server and does not export the app).

What works without the CLI: `tsx` with an entry that calls `createApp({ pool, reviewer })` (a pool that never connects) and reads `app.routes`: 252 entries, 197 without `ALL` middleware, for example `GET /health`, `GET /account`, `PUT /account/profile`. So the real route list is readable; the CLI adds only the JSON/plain formatting.

Help for reviews and tests: the route list could back a check that every route is documented in `docs/guides/reference/app.md`, but `make reference-check` does that already (US-QG-10). `request` and `batch` need an app without database; ours needs a database for every route behind auth, so the in-process tests (`app.test.ts` and the route tests) stay the way. No benefit found today.

## 3. Conflicts with project rules

Read: `honojs/skills` (`hono`, `hono-jsx`, `hono-void`) and `docker/skills` (`docker-build-strategies`, `docker-project-foundations`; compose, guardrails skimmed). Listed side by side, not settled.

| Tool says                                                                                          | Project rule                                                                                                                          |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Hono: validate with `zValidator` / `sValidator` in the route                                       | P-03: writes go through validating operations in `core`; routes do not validate on their own (`.claude/rules/api.md`)                 |
| Hono: errors as `c.json({ message: ... }, 404)`, `app.onError` returns a message                   | FR-QG-11: `{ error: { code, text, details?, data? } }`, mapped in `error-http.ts`, German texts in `ERROR_TEXTS`                      |
| Hono: `hono/jwt`, `hono/bearer-auth`, `basicAuth` middleware                                       | API rules: Bearer token checked by JWKS (jose), issuer, audience `pflanzendex-api`, then `withAccount`                                |
| Hono: handlers inline in the route, RPC with chained routes and `hc<AppType>`                      | `bindXxx(app, ...)` modules per feature; the web talks to the API over HTTP only (AB-6); `app.route()` grouping is used               |
| Hono: tests with `app.request()` and `expect` without story IDs                                    | Test names carry the story ID (P-06); error shape and tenant isolation tested per route                                               |
| Hono skill: `npm install -D @hono/cli@next` (a release candidate)                                  | Owner decision needed; the rules of the ticket forbid adding the dependency                                                           |
| Hono skill: examples assume `src/index.ts` and Workers `Env` bindings                              | Entry is `src/main.ts` (starts the server); the app is built by `createApp`                                                           |
| Hono skill: Hono v5 (ESM, Node 22.12) notes                                                        | The repo pins `hono` 4.13.19                                                                                                          |
| hono-jsx: server-side JSX in `.tsx`                                                                | The API has no server rendering; UI is `packages/web` (React)                                                                         |
| Hono skill: `/mcp` through `@hono/mcp` (named in the ticket)                                       | Keep the hand-built `/mcp` (ki-tool-contract, FR-KI-03/10)                                                                            |
| Docker: always `# syntax=docker/dockerfile:1`, `COPY --link`, OCI labels, cache mounts             | Dockerfiles are pinned by digest and kept minimal (TE-03, #761); no rule asks for these; digest pin and non-root `USER` already match |
| Docker: multi-stage for every image, runtime stage separate                                        | `api.Dockerfile` has one stage on purpose (no build step, runs `tsx`)                                                                 |
| Docker: `compose.yaml`, files at the project root, `.dockerignore` next to the Dockerfile          | Compose file and Dockerfiles live under `app/config/deploy/`; `.dockerignore` is in `app/` (the build context)                        |
| Docker: `.dockerignore` excludes `*.md`, `docs/`                                                   | Context is `app/`, which has no `docs/`; the ignore list is a project choice                                                          |
| Docker skills: guardrails about `docker system prune` etc.                                         | Project hooks and `make heavy` / `make db-prune` already own destructive commands; to compare before any install                      |
| Both skill sets: installers (`skills add`, plugin marketplace) write into `.claude/` or `.agents/` | Ticket rule: no installer writes there; `.claude/` is a gate area                                                                     |
| Hono skill: `hono init`, `create-hono`                                                             | Would write project files; not run                                                                                                    |

Language: both skill sets are English; they hold no UI text, so no conflict with the German message tables, and no placement rule (layout gate) is touched.

## 4. Proposed line for the API rules (not applied)

For `.claude/rules/api.md` (a gate area; the owner decides and merges):

> - For Hono APIs not covered here, read `https://hono.dev/llms.txt`; fetch a page with `Accept: text/markdown`. The project rules above win over any example there.

## Owner decisions needed

1. **Skills:** install `honojs/skills` or `docker/skills`, and where? Recommendation: no. The Hono skill's validation, error and test advice contradicts P-03 and FR-QG-11, and `hono` CLI does not run here. The Docker skills add little over the Dockerfiles that pass the check.
2. **Docs pointer:** add the line in section 4 to `.claude/rules/api.md`? Recommendation: yes; it costs one line and the "rules above win" clause covers the conflicts.
3. **`docker build --check` as a gate:** Recommendation: no. There is no hit, and E-30 asks for a finding.
4. **`@hono/cli` as dev dependency:** Recommendation: no. It cannot load the app today (section 2); try again at its 1.0 release.
