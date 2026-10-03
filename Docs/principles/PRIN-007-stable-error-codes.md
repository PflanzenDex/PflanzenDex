---
id: PRIN-007
title: Errors carry stable codes of the form domain.reason
maturity: checked
spec: [FR-QG-11]
---

## Why it is better

Clients and tests rely on codes, not on texts. A renamed code breaks them silently.

## How it is measured

A test asserts that every code has the format `<domain>.<reason>` and a non-empty user text.

## Checked by

`app/packages/core/src/kern/fehler.ts` (definition), `app/packages/core/src/kern/fehler.test.ts` (format test).

## Evidence

The format test runs in `make ci` and so blocks merges, but it cannot detect a renamed or removed code. A snapshot of the code list would close that gap; until then this stays at maturity checked.
