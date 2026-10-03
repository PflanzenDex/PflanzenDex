# 15 – Epic MIG: Migration vom Prototyp (entfallen)

**Status: ⛔ entfallen** (Entscheidung 2026-10-03). Es gibt keinen Import aus dem Obsidian-Vault. Die Start-Nutzer erfassen ihre Sammlung in der App neu (Formulare oder KI-Client, US-KI-01). Der Vault bleibt unverändert als Referenz und Sicherung; die App liest nicht daraus und schreibt nie hinein.

Die IDs bleiben **reserviert** und werden nicht neu vergeben (Konvention: IDs werden nie neu nummeriert). Die Stories zählen nicht in die Status-Übersicht der `README.md`.

| ID | Frühere Bedeutung | Status |
|---|---|---|
| US-MIG-01 | Vault-Daten importieren (Trockenlauf, idempotent, Fehlerbericht) | ⛔ entfallen |
| US-MIG-02 | Standorte, Lichtzonen und Skalen angleichen | ⛔ entfallen |
| US-MIG-03 | Parallelbetrieb und Umschalten (Vergleichsansicht Prototyp vs. App) | ⛔ entfallen |
| FR-MIG-01 bis FR-MIG-04 | Import-Werkzeug, nur eigenes Konto, Quelle unangetastet, tolerantes Parsen | ⛔ entfallen |

## Folgen der Entscheidung

- **Wechsel vom Vault:** Wer wechselt, legt Standorte, Arten und Exemplare neu an und pflegt danach nur noch die App. Das ist eine Hürde für Stufe 1 (siehe Risiko R-10 in `16-Releases-und-Entscheidungen.md`).
- **Prototyp-Kennzahlen** (13 Arten, 17 Exemplare, 2 Archivierte, 8 Wunschlisten-Kandidaten, 215 Katalogarten) dienen als Orientierung für Testdaten (US-DEV-07) und für den Katalogausbau (US-POK-02), nicht als Importziel.
- **Katalog-Ausgangsbestand:** Die 215 Katalogarten (`Arten.md`) und die 13 kuratierten Art-Notizen sind Material für die Betreiber-Batches des Katalogausbaus, nicht Gegenstand eines Import-Werkzeugs.
- **Parallelbetrieb:** Prototyp und App können nebeneinander laufen; eine Vergleichsansicht gibt es nicht.
