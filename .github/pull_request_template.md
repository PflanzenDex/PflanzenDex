<!--
Titel = Commit-Nachricht nach dem Squash: Conventional Commits mit Epic-Scope, z. B. `feat(pha): Phase aus Messung ableiten (US-PHA-02)`.
Ein PR, eine Aufgabe, ein Branch (E-13, US-DEV-08).
-->

Closes #

## Was und warum

<!-- Story-/FR-IDs, die dieser PR umsetzt; Abweichungen von der Spec mit Grund. -->

## Testnachweis

<!-- Welche Tests stammen aus welchen Akzeptanzkriterien (Story-ID im Testnamen, P-06)? Ergebnis von `make ci` ehrlich: Pass oder Fail, nicht „sollte laufen" (D-05). -->

## Definition of Done (FR-QG-10)

- [ ] Story und Akzeptanzkriterien existieren; der Code ist auf ein Kriterium rückführbar
- [ ] Tests aus den Kriterien (Happy Path, Randfälle, Fehlerfälle, Sicherheitspfade) mit Story-ID im Namen
- [ ] Fehler behandelt (stabiler `error_code`), nichts still verschluckt (P-10)
- [ ] Eingaben validiert, keine Geheimnisse im Code, Zugriff und Mandantentrennung geprüft (P-04)
- [ ] Modulgrenzen eingehalten, keine Magic Strings
- [ ] Spec-Status und Zähler in `Docs/PRODUKT-SPECS/README.md` im selben PR angepasst
- [ ] `make ci` lokal grün

## KI-Beteiligung

<!-- Hat ein Agent Code oder Text erzeugt? Welcher, und was hat der Mensch selbst geprüft? Gates oder Schwellen geändert? Dann hier begründen (US-QG-07). -->

- [ ] Kein Gate, keine Schwelle und keine Ausnahmeliste gelockert, oder Begründung steht oben
