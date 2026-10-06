# 05 – Epic BEH: Treatments (Pests, Diseases, Courses of Treatment)

Goal: treatment dates are planned, their due date becomes visible, and ticking off is a click.

Sources: dashboard block "💊 Behandlungen", card in "🪴 Meine Exemplare", `CLAUDE.md`.

## User stories

### US-BEH-01 · Plan treatment dates · ✅
As a **plant keeper** I want to create dates for a treatment (also several for a repeat course), so that no repetition is forgotten.

Acceptance criteria:
- Form below the block: specimen choice, reason (e.g. "Wollläuse"), agent (optional), date, "Behandlung planen".
- Without reason or without date nothing happens.
- Saving appends `{Grund, Mittel (or null), Datum, Erledigt: false}` to `Behandlungen`.
- A course with three dates arises through three individual entries (today, +1 week, +2 weeks).

### US-BEH-02 · See open dates by urgency · ✅
As a **plant keeper** I want to see open treatments sorted by due date, so that I work through overdue ones first.

Acceptance criteria:
- Table: plant (link), reason, agent (or "—"), due on, status.
- Sorted ascending by date.
- Status: `⚠️ überfällig seit N Tag(en)` (< 0), `🔔 heute fällig` (0), `🔔 in N Tagen` (1–3), otherwise `in N Tagen`.
- If there are no open treatments: "Keine offenen Behandlungen."

### US-BEH-03 · Tick off a date with a click · ✅
As a **plant keeper** I want to tick off a completed treatment with a button.

Acceptance criteria:
- "Erledigt ✔" sets `Erledigt: true` at the position of the entry in the array and disables the button; the row disappears after the block is rebuilt.
- Completed entries remain as history in the frontmatter.

### US-BEH-04 · See an open treatment on the specimen card · ✅
As a **plant keeper** I want to see the next open treatment directly on the card.

Acceptance criteria: see US-BES-06 (next date, overdue/today/in N days, "+N weitere").

## Requirements

| ID | Requirement | Status |
|---|---|---|
| FR-BEH-01 | Format: `Behandlungen: [{Grund: text, Mittel: text\|null, Datum: "YYYY-MM-DD", Erledigt: bool}]`. | ✅ |
| FR-BEH-02 | "Erledigt ✔" addresses the entry via its array index (`idx`) at render time. If the list is changed between render and click (second window), the click hits the wrong entry. | 🟡 (B-08) |
| FR-BEH-03 | The done date is not stored; there is only the bool. | ✅ (limitation) |
| FR-BEH-04 | The form lists all specimens (also cuttings). | ✅ |
| FR-BEH-05 | A treatment creates no push; it becomes visible only when the dashboard is opened. | ⬜ (MON-03) |
