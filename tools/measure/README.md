# Measuring screens locally

Small Playwright tools to check whether a view, layer or dialog fits the window before you push (US-QG-01, US-QS-15, issue 1199). They read the screens from the register of the one-screen gate (`app/packages/e2e/support/display/screens.json`) and open each one the same way: its path, then its click steps. The CI job `one-screen` (`make one-screen`, QG-U8) stays the reference; these tools are for finding and fixing a screen quickly, one at a time.

| Tool           | What it does                                                                                                                                                                                                               |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `measure.mjs`  | Page ratio, largest inner scroll region, overflow in pixels (the gate allows 1 px), sideways overflow and painted width per screen and window size; light or dark, any text size; optional `results.json` and screenshots. |
| `probe.mjs`    | One screen at one size: every scroll region with its overflow, and for the ones that overflow the tree of their children (top + height, width), so the part that takes the room stands out.                                |
| `subjects.mjs` | Prints the Keycloak subjects of the demo users as `DEMO_SEED_SUBJECTS`, to reseed a database after the shared Keycloak was re-imported.                                                                                    |
| `lib.mjs`      | Shared parts: addresses, register, sign-in, opening a screen with API writes blocked.                                                                                                                                      |

## Setup

1. A worktree with `node_modules` (`make worktree`, `npm ci` in `app/`) and a database seeded like CI: `DEMO_SEED_PROFILE=states` (see "Reseed" below).
2. The app running from that worktree: API and web with the ports of its `.env.worktree`. The web port must be an allowed origin of the shared Keycloak: run `node app/tools/keycloak/web-port.mjs <web port>` from the main checkout.
3. Point the tools at it with `PDX_WEB` and `PDX_API`; without them they read `PFLANZENDEX_DEV_WEB_PORT` and `PFLANZENDEX_DEV_API_PORT` (so `set -a; . ./.env.worktree; set +a` is enough). The demo password is `testtest12` unless `PDX_PASSWORD` says otherwise.

## Examples

```sh
# Every screen of the register at the six sizes of US-QS-15
node tools/measure/measure.mjs --out=/tmp/measure

# Two screens, one size each, dark mode
node tools/measure/measure.mjs --dark today-sheet-hints@360x640 collection-view-equipment-sheet-costs@1024x768

# One screen at the phone sizes, 200 % text (it may scroll inside its region, never the page)
node tools/measure/measure.mjs --sizes=360x640,390x844 --text=200 friends-exchange

# The same screen as another demo account than the register names
node tools/measure/measure.mjs --user=test3 collection-view-wishlist-sheet-bought

# Why does it not fit?
node tools/measure/probe.mjs light-zone-edit@360x640 --shot=/tmp/zone.png
```

A measurement is over the gate's limit when the page or a region overflows by more than 1 px (`pagePx`, `innerPx`) or anything sticks out sideways (`sideways`); `painted` is the horizontal extent the app draws (at most 1920 px and centred from 2560 px wide, issue 1160).

## Reseed after a Keycloak re-import

The realm of the shared Keycloak lives in memory. After `make auth-up` re-creates the container, the demo users get new subjects; signing in then creates empty accounts and every measurement looks different. Reseed the worktree's database with the current subjects (no Keycloak admin password needed):

```sh
set -a; . ./.env.worktree; set +a
SUBJECTS=$(node tools/measure/subjects.mjs)
cd app && DEMO_SEED_SUBJECTS="$SUBJECTS" DEMO_SEED_PROFILE=states PFLANZENDEX_ENV=local \
  PFLANZENDEX_TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:$PFLANZENDEX_TEST_DB_PORT/pflanzendex_test \
  npm run seed:demo -w @pflanzendex/api
```

## Pitfalls

- Run one measurement at a time: parallel runs share the dev servers and the clicks time out.
- A Keycloak session ends after about 20 minutes and the app then lands on `/today`; check the `url` of a result before trusting it.
- Values within a few hundredths of the limit move between runs; the CI job decides.
- The states seed writes a Pokédex tree fixture into an empty `taxon` table (#1164), so the collector cards have content with `TAXONOMY_BUILD=off`, as in CI. A database seeded before that needs the states seed again.
- The tools block every API write, so measuring never changes the demo data.
