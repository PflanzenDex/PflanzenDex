# 0014 · Achievements get their own module `achievements`

- **Status:** accepted by the PO (2026-10-15), revisable. Assumption decided by the product owner under the autonomy rules.
- **Refines:** ADR 0003 (module cut), `docs/specs/product/20-achievements.md` (DM-ACH-01 to DM-ACH-03, FR-ACH-01 to FR-ACH-10)
- **Affects:** `app/config/lint/modules.config.mjs` (new module `achievements`)

## Context

Epic ACH rewards care and growth. The criteria read data from several modules (collection, care, swap). If `achievements` imported them, it would sit above five modules and every change there would risk the criteria. The criteria are also the part that must stay pure and testable (FR-ACH-01).

## Decision

A new module **`achievements`** (`core/src/achievements`, later `db`, `api`, `web`). The domain logic works on a plain **facts** value (`AchievementFacts`: specimens with dates, measurements, treatment courses, handovers) and imports nothing but the kernel (`achievements -> kernel`). An adapter in the api reads the keeper's own data through the existing ports of the other modules and builds the facts, so no back edge and no cycle can arise.

- Earned state, `earned on`, rhythm, records are derived on every request and never stored (FR-ACH-02). The only table is the per-account "seen" state (DM-ACH-02, US-ACH-03) and the settings (DM-ACH-03, US-ACH-08); they are added with their stories and get the generic tenant test.
- Definitions (id, group, version, criterion) live in code, German texts in the message tables (UI language rule).
- Events keep their own dates (repot date, last tick, handover date); archived specimens stay in the facts, so achievements survive archiving (P-10).

## Consequences

- No compile-time dependency on `collection`, `care` or `swap`; contract tests of the adapter prove the facts match their sources.
- A new achievement is a new definition with a version; existing accounts get it silently as seen (FR-ACH-09).
