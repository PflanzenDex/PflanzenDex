# 0004 · The whole repository is English

- **Status:** accepted (2026-10-03)
- **Supersedes:** the language split in `CLAUDE.md` (specs and domain code German, tooling English)
- **Refines:** E-05 (code in the same repository), FR-QG-11 (error codes), P-06 (acceptance criteria become tests)

## Context

Until now specs, glossary, domain identifiers (`konto`, `exemplar`, `mitKonto`), database objects and error codes (`exemplar.nicht_gefunden`) were German, while tooling, ADRs and commits were English. Every file that crossed the line had to mix two languages, new contributors and AI agents had to learn a second vocabulary, and the split kept producing half-translated names. The project owner decided to make the whole repository English. The app stays German for its users.

## Decision

- **English everywhere in the repository:** product specs (`docs/specs/product/`), the prototype specs (`docs/specs/prototype/`), test logs, spike records, roadmap, ADRs, runbooks, code identifiers, folder and file names, database objects, error codes, test names, comments, commit messages and PRs.
- **German stays only where users see it:** UI texts (and the message tables behind them, `ERROR_TEXTS`, `web/src/**/*.de.json`), user-entered or user-visible data values (for example the archive reasons `eingegangen`, `verkauft`), and quoted terms of the vault prototype (vault paths such as `02-Areas/…`, original data keys, quotes). The product name "PflanzenDex" stays.
- **Glossary:** Art → Species, Exemplar → Specimen, Steckling → Cutting, Lichtzone → Light zone, Standort → Location, Pflegephase → Care phase, Vergeilung → Etiolation, Gefangen → Caught, Puffer → Buffer, Wunsch → Wish. Epic codes (ACC, BES, LIC, …) and every story, requirement and decision ID stay; IDs are never renumbered.
- **Error codes are renamed once** (`exemplar.nicht_gefunden` → `specimen.not_found`). They are stable identifiers (FR-QG-11) and normally never change; the exception is justified because only `v0.0.0` exists, no client depends on them yet, and a mixed vocabulary would be permanent otherwise.
- **Applied migrations stay as they are.** `0001` to `0011` keep their German file names, object names and checksums (forward only). `0012_english_names.sql` renames every table, column, constraint, index, function, policy and trigger, converts the stored enum values (for example `pflanze` → `plant`) and the session variables (`app.konto_id` → `app.account_id`), and re-creates what depends on them. It is the only file that knows both vocabularies. The module register maps the old migration files and table names (`LEGACY_MIGRATIONS`, `LEGACY_TABLE_NAMES`) so that AB-13 and AB-14 keep working.
- **Dated records** (`docs/records/spikes/`, `docs/records/test-logs/`) are translated too; raw `.txt` logs and `.json` observations stay exactly as recorded, as do the PNG screenshots (their file names are English).
- **The label `spec-lücke`** stays: renaming a GitHub label would break the references of every open ticket.

## Consequences

- Open branches and worktrees from before this change conflict with it in almost every file. Rebase with `git merge dev` is not enough; re-apply the change on top of the new names (the rename was done mechanically with an AST-based dictionary tool, the rules are in this ADR and the glossary above).
- Test databases created before this change must be recreated (`make db-down db-up`) or migrated with `make migrate`; `0012` converts existing data in place.
- Anyone reading old pull requests, issues or the first git history meets German names. `git log --follow` works across the renames.
- New code, specs and docs follow the rule in `CLAUDE.md` ("Language"): English except UI texts and quoted prototype terms; never mix languages within one file.
