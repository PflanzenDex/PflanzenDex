# Principles register

A rule that exists only in a document is a wish. This register records every rule of the project with its **maturity**, so it is visible which rules are only intended and which block a merge (US-QG-06, FR-DEV-04). The validator `app/tools/check/docs/check-principles.mjs` runs in `make gates` as `npm run principles`.

## Format

One file per principle: `Docs/principles/PRIN-<nnn>-<slug>.md`. IDs are never renumbered or reused.

```markdown
---
id: PRIN-001
title: The core imports no I/O, framework or other package
maturity: gated
spec: [AB-1, P-02]
---

## Why it is better

## How it is measured

## Checked by

## Gate

## Evidence
```

Frontmatter fields are all required: `id` (matches the file name prefix), `title`, `maturity`, `spec` (references such as `AB-1`, `P-02`, `FR-QG-05`; list in brackets).

## Maturity ladder

`observed → measurable → checked → gated`. The ladder is cumulative: a level needs all fields of the levels below.

| Maturity     | Meaning                                                                       | Required sections (non-empty) |
| ------------ | ----------------------------------------------------------------------------- | ----------------------------- |
| `observed`   | A rule we follow by convention; nothing measures it.                          | Why it is better              |
| `measurable` | We can say how a violation would be counted.                                  | + How it is measured          |
| `checked`    | A script or test checks it, but a failure does not necessarily block a merge. | + Checked by                  |
| `gated`      | The check runs in CI or a make target and blocks the merge.                   | + Gate, Evidence              |

Section contents:

- **Why it is better:** the benefit, in one or two sentences.
- **How it is measured:** the observable quantity and its target.
- **Checked by:** repo paths of the script and its tests, in backticks.
- **Gate:** the make target or CI job that makes it blocking, in backticks (`make gates`, `.github/workflows/ci.yml`).
- **Evidence:** proof that the gate bites (test names, a past failure caught) and honest limits.

## What the validator checks

| Rule     | Meaning                                                                       |
| -------- | ----------------------------------------------------------------------------- |
| `PRIN-1` | Frontmatter is complete and `maturity` is one of the four levels.             |
| `PRIN-2` | `id` is unique and the file name starts with it.                              |
| `PRIN-3` | Every section required for the maturity level is present and not empty.       |
| `PRIN-4` | Repo paths (`dir/file`) and `make <target>` in "Checked by" and "Gate" exist. |

## Rules for changing the register

- Maturity states what is true on `dev` today. Do not claim a level for a check that is still in an open PR; mention it in Evidence instead.
- Raise the maturity in the same PR that adds the check or gate. Lowering it needs a reason in the PR.
- A gate that found no failure in three months is reviewed for usefulness, not kept blindly (US-QG-06, US-DEV-03).
- Gotchas that cost time belong in `Docs/pitfalls/`; when one becomes a gate, add the principle here and link it from the pitfall.

## Entries

| ID       | Principle                                                | Maturity |
| -------- | -------------------------------------------------------- | -------- |
| PRIN-001 | Core imports no I/O, framework or other package (AB-1)   | gated    |
| PRIN-002 | API and web import core only via the package root (AB-2) | gated    |
| PRIN-003 | Web imports neither API nor database (AB-6)              | gated    |
| PRIN-004 | Files have at most 200 lines                             | gated    |
| PRIN-005 | Complexity at most 15, in core at most 10                | gated    |
| PRIN-006 | Every table is isolated per account                      | gated    |
| PRIN-007 | Stable error codes                                       | checked  |
| PRIN-008 | Spec file numbers and IDs are unique                     | gated    |
| PRIN-009 | Conventional Commits                                     | observed |
| PRIN-010 | A story is claimed before work starts                    | checked  |
| PRIN-011 | The file layout is checked, the baseline only shrinks    | gated    |

Not yet in the register: AB-3 to AB-5 (no code to check yet), the P-01 to P-11 mapping of spec 18 beyond the rules above.
