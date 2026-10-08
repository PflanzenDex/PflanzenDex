# Security

PflanzenDex stores its users' locations, photos and home surroundings (R-05). We take reports seriously.

## Reporting a vulnerability

Please do **not** open a public issue. Report it privately via
[GitHub: report a vulnerability](https://github.com/PflanzenDex/PflanzenDex/security/advisories/new).

Helpful details: affected component or endpoint, steps to reproduce, possible impact. We confirm receipt within 7 days (starting value, an assumption) and follow up with an assessment.

## Scope

The code on `main` and `dev` and the hosted instance. Out of scope: spike code under `docs/records/spikes/` (local experiments with throwaway credentials).

## Checks already in place

Secret scanning with push protection, dependency alerts, static analysis and tenant isolation tests (QG-S1 to QG-S3 and QG-D1 in `docs/specs/product/18-architecture-and-quality-gates.md`).
