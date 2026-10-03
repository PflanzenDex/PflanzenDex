<!--
The title becomes the commit message after the squash: Conventional Commits with an epic scope,
e.g. `feat(pha): derive care phase from measurement (US-PHA-02)`. One PR, one task, one branch (E-13, US-DEV-08).
-->

Closes #

## What and why

<!-- Story/FR IDs this PR implements; deviations from the spec with the reason. -->

## Test evidence

<!-- Which tests come from which acceptance criteria (story ID in the test name, P-06)? Report the result of `make ci` honestly: pass or fail, never "should work" (D-05). -->

## Definition of Done (FR-QG-10)

- [ ] Story and acceptance criteria exist; the code traces back to a criterion
- [ ] Tests derived from the criteria (happy path, edge cases, error cases, security paths) with the story ID in the name
- [ ] Errors handled (stable `error_code`), nothing swallowed silently (P-10)
- [ ] Input validated, no secrets in code, access and tenant isolation checked (P-04)
- [ ] Module boundaries respected, no magic strings
- [ ] Spec status and counters in `Docs/PRODUKT-SPECS/README.md` updated in this PR
- [ ] `make ci` green locally

## AI involvement

<!-- Did an agent write code or text? Which one, and what did a human verify? Were gates or thresholds changed? Then justify it here (US-QG-07). -->

- [ ] No gate, threshold or exception list was loosened, or the justification is above
