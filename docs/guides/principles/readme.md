# Principles register

A rule that exists only in a document is a wish. This register records every rule of the project with its **maturity**, so it is visible which rules are only intended and which block a merge (US-QG-06, FR-DEV-04). The validator `app/tools/check/docs/check-principles.mjs` runs in `make gates` as `npm run principles`.

## Format

One file per principle: `docs/guides/principles/prin-<nnn>-<slug>.md` (lower case, the id in upper case in the frontmatter). IDs are never renumbered or reused.

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

Frontmatter fields are all required: `id` (matches the file name prefix), `title`, `maturity`, `spec` (references such as `AB-1`, `P-02`, `FR-QG-05`; list in brackets). The optional field `blocking_from` is described under "Report, then blocking".

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

## Report, then blocking (criterion 2)

A new gate starts as a report: an entry at maturity `checked`, whose failure does not block. The owner sets the day from which it blocks with the optional frontmatter field `blocking_from: YYYY-MM-DD`; the length of the report period is the owner's decision. From that day on the entry must be `gated`:

- The switch PR removes `blocking_from`, raises the maturity to `gated` and makes the check block (its Gate section names the make target or CI job).
- `npm run principles` fails a `gated` entry that still carries the field (PRIN-5).
- `npm run principles` fails an entry that is not `gated` on its day or later (PRIN-6). The day itself counts; "today" is the calendar day in Europe/Berlin.

An entry without the field has no date. Dates are set by the owner, never guessed.

## Quarantine

A blocking job that is red on `dev` itself blocks every pull request until someone decides ad hoc. The quarantine is the rule for that case (US-QG-06): the job is listed in `app/config/gates/baselines/quarantine-baseline.json`, one entry per job of `ci.yml`, with `job`, `since` (the day it was listed), `issue` and `reason`.

- A quarantined job still runs and reports. Its red result is named in `make ci-wait`, in the job summary and in the nightly issue as "quarantined since <date>, #<issue>", but it blocks neither `ci-status` nor `make merge`.
- An entry is added with `make quarantine JOB=<job> ISSUE=<n> REASON="…"` on a branch of its own. The list grows, so the owner merges that pull request (the baseline growth rule, US-QG-07). When `dev` is red, the nightly issue names the job and this command.
- An entry is removed by deleting it and lowering `maxEntries` by one. That is a shrink and needs no owner.
- An entry that names a job which `ci.yml` does not define fails `ci-status`, so a typo cannot hide a red job.
- Maturity states what blocks on `dev` today. While a gate is quarantined it blocks nothing, so its principle entry is set to `checked` in the same pull request, with the Evidence line `Quarantined: since YYYY-MM-DD, #<issue>`. The entry returns to `gated` when the job is off the list.

## Caught lines (criterion 4)

A gate earns its place by what it catches. When a gate or check caught a real failure, the PR that fixes it writes one line into the Evidence section of the principle it guards:

`Caught: YYYY-MM-DD, PR #<n>, <what it caught>`

`YYYY-MM-DD` is the day the failure was caught, `PR #<n>` the pull request that fixed it. The line stands on its own, outside a bullet, and only in Evidence. The validator checks the format, a real calendar day and a day not after today (PRIN-7). A PR that did not fail a check gets no line. The PR template asks for it.

## Quarterly review

`make principles-review` lists every `gated` and `checked` entry without a `Caught:` line of the last three months, with its last catch and its `blocking_from`. Spec 19 (gate health) makes it a quarterly maintainer task. The routine is report only: it prints the list and exits 0, so it never fails CI. For each listed entry the owner keeps it with a reason in its Evidence, or lowers its maturity in a PR of its own.

## What the validator checks

| Rule     | Meaning                                                                       |
| -------- | ----------------------------------------------------------------------------- |
| `PRIN-1` | Frontmatter is complete and `maturity` is one of the four levels.             |
| `PRIN-2` | `id` is unique and the file name starts with it.                              |
| `PRIN-3` | Every section required for the maturity level is present and not empty.       |
| `PRIN-4` | Repo paths (`dir/file`) and `make <target>` in "Checked by" and "Gate" exist. |
| `PRIN-5` | A `gated` entry carries no `blocking_from` (the switch is done).              |
| `PRIN-6` | `blocking_from` is a real date, and from that day on the entry is `gated`.    |
| `PRIN-7` | A `Caught:` line is in Evidence, in the fixed format, and not after today.    |

## Rules for changing the register

- Maturity states what is true on `dev` today. Do not claim a level for a check that is still in an open PR; mention it in Evidence instead.
- Raise the maturity in the same PR that adds the check or gate. Lowering it needs a reason in the PR.
- A gate that found no failure in three months is reviewed for usefulness, not kept blindly: `make principles-review` lists it every quarter (US-QG-06, US-DEV-03).
- Gotchas that cost time belong in `docs/guides/pitfalls/`; when one becomes a gate, add the principle here and link it from the pitfall.

## Entries

One entry per rule. The maturity is what is true on `dev` today. Every gate of `make gates`, every job that `ci-status` requires and every report job of the nightly and scheduled workflows is named by an entry (US-QG-06, criterion 1).

| ID       | Principle                                                                                       | Maturity   |
| -------- | ----------------------------------------------------------------------------------------------- | ---------- |
| PRIN-001 | The core imports no I/O, framework or other package                                             | gated      |
| PRIN-002 | API and web import the core only through its package root                                       | gated      |
| PRIN-003 | Web imports neither the API nor the database package                                            | gated      |
| PRIN-004 | Source files have at most 200 lines                                                             | gated      |
| PRIN-005 | Cyclomatic complexity is at most 15, in the core at most 10                                     | gated      |
| PRIN-006 | Every table is isolated per account (tenant)                                                    | gated      |
| PRIN-007 | Errors carry stable codes of the form domain.reason                                             | gated      |
| PRIN-008 | Spec files and spec IDs are unique                                                              | gated      |
| PRIN-009 | Commit messages follow Conventional Commits                                                     | gated      |
| PRIN-010 | A story is claimed before work starts, so nobody builds it twice                                | checked    |
| PRIN-011 | The file layout is checked and the baseline only shrinks                                        | gated      |
| PRIN-012 | The principles register is valid in its fields, maturity levels and references                  | gated      |
| PRIN-013 | Every gate of the repository has an entry in the principles register                            | measurable |
| PRIN-014 | Lint and the strict type check pass in every package                                            | gated      |
| PRIN-015 | Functions have at most 60 lines, depth 4, 4 parameters and cognitive complexity 30 (15 in core) | gated      |
| PRIN-016 | Existing code-metric violations are listed in a baseline that only shrinks                      | gated      |
| PRIN-017 | No unused exports, files or dependencies                                                        | gated      |
| PRIN-018 | ESLint security rules are errors                                                                | gated      |
| PRIN-019 | CodeQL reports no high or critical security alert on dev and main                               | gated      |
| PRIN-020 | Calendar dates are never cut from a UTC timestamp                                               | gated      |
| PRIN-021 | UI texts come from message tables, known literal texts only shrink                              | gated      |
| PRIN-022 | Inline numbers and enum literals are central constants, known hits only shrink                  | gated      |
| PRIN-023 | Numbers marked in the product specs equal the constants in the code                             | gated      |
| PRIN-024 | Threshold numbers in the definition of done equal the gate configuration                        | gated      |
| PRIN-025 | Migration numbers are unique and new migrations come after the highest number on dev            | gated      |
| PRIN-026 | Every foreign key and every tenant column is covered by an index                                | gated      |
| PRIN-027 | Modules import only through their public interface and along the dependency matrix              | gated      |
| PRIN-028 | Unit, integration and database tests pass in every package and in the check scripts             | gated      |
| PRIN-029 | Test coverage per package never drops below its threshold, thresholds only rise                 | gated      |
| PRIN-030 | A complex function must be tested, CRAP score at most 450 per function                          | gated      |
| PRIN-031 | No new copy-paste group in changed files, at most 1 % duplicated lines overall                  | gated      |
| PRIN-032 | Every done story has a test whose name carries the story ID                                     | gated      |
| PRIN-033 | Spec references resolve and the status counters match the stories                               | gated      |
| PRIN-034 | The reference docs name every API route, core operation and shared component                    | gated      |
| PRIN-035 | Agent skills have a matching name, a trigger, existing paths and a make check                   | gated      |
| PRIN-036 | Markdown is linted and relative links resolve                                                   | gated      |
| PRIN-037 | Code and docs are formatted by Prettier                                                         | gated      |
| PRIN-038 | CI jobs run make targets, not raw npm or node commands                                          | gated      |
| PRIN-039 | No secrets in the repository or in its history                                                  | gated      |
| PRIN-040 | GitHub workflow files are lint-clean                                                            | gated      |
| PRIN-041 | Installed dependencies match the lock file                                                      | gated      |
| PRIN-042 | No known high or critical vulnerability in the dependencies without a dated exception           | gated      |
| PRIN-043 | Container images are scanned for known vulnerabilities (report)                                 | checked    |
| PRIN-044 | Releases come only from a green main, production deploys only from a stable release tag         | gated      |
| PRIN-045 | Version tags come only from the release workflow                                                | checked    |
| PRIN-046 | Merges into dev and main need a pull request and a green ci-status                              | gated      |
| PRIN-047 | Agents merge only into dev, with a green ci-status, a named story and no gate file              | gated      |
| PRIN-048 | Agent sessions cannot skip the gates or change gate files without a human                       | checked    |
| PRIN-049 | Commit messages, staged files and pushes are checked locally before they reach CI               | checked    |
| PRIN-050 | A feat or fix pull request adds a user-facing changelog entry or says why not                   | gated      |
| PRIN-051 | Every issue carries exactly one type label and one epic label                                   | checked    |
| PRIN-052 | The project status of a story follows its pull requests                                         | checked    |
| PRIN-053 | Statements per request do not grow with the data, and no request repeats a statement            | gated      |
| PRIN-054 | Every write route requires the repeat-guard key                                                 | gated      |
| PRIN-055 | Every shared UI component has a story that shows its variants and states                        | gated      |
| PRIN-056 | Every component story passes axe, touch-target, focus and overlay checks in a real browser      | gated      |
| PRIN-057 | Components and pages keep their look unless a change is reviewed                                | gated      |
| PRIN-058 | The UI follows the design-system rules, known deviations only shrink                            | gated      |
| PRIN-059 | The initial JavaScript of the web app stays within its budget                                   | gated      |
| PRIN-060 | Mobile Lighthouse scores and Web Vitals of the start page stay within their limits              | gated      |
| PRIN-061 | The signed-in Heute and Sammlung screens are measured nightly (report)                          | checked    |
| PRIN-062 | Every GET route stays within its load budget at 1,000 specimens (report)                        | checked    |
| PRIN-063 | Core flows work end to end on mobile and desktop before a release                               | gated      |
| PRIN-064 | Every view and layer is checked for accessibility violations and keyboard reachability          | gated      |
| PRIN-065 | Every view and layer fits the window at phone and desktop sizes                                 | gated      |
| PRIN-066 | The full suite runs nightly on dev and opens an issue when it fails                             | checked    |
| PRIN-067 | The repository's supply-chain hygiene is measured by OpenSSF Scorecard (report)                 | checked    |

Not yet in the register: AB-3 to AB-5 (no code to check yet), the P-01 to P-12 mapping of spec 18 beyond the rules above.
