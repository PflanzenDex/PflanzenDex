# Sicherheit

PflanzenDex speichert Standorte, Fotos und Wohnumfeld seiner Nutzer (R-05). Wir nehmen Meldungen ernst.

## Schwachstelle melden

Bitte **nicht** als öffentliches Issue. Stattdessen privat über
[GitHub: Sicherheitslücke melden](https://github.com/PflanzenDex/PflanzenDex/security/advisories/new).

Hilfreich sind: betroffene Komponente oder Endpunkt, Schritte zum Nachstellen, mögliche Auswirkung. Wir bestätigen den Eingang innerhalb von 7 Tagen (Startwert, Annahme) und melden uns mit einer Einschätzung.

*Please report vulnerabilities privately via the link above, not as a public issue. English is fine.*

## Geltungsbereich

Der Code auf `main` und `dev` sowie die betriebene Instanz. Nicht im Geltungsbereich: Spike-Code unter `Docs/spikes/` (nur lokale Versuche mit Wegwerf-Zugangsdaten).

## Was im Repo schon geprüft wird

Secret-Scanning mit Push-Schutz, Abhängigkeitswarnungen, statische Analyse und Mandantentrennungstests (QG-S1 bis QG-S3, QG-D1 in `Docs/PRODUKT-SPECS/18-Architektur-und-Quality-Gates.md`).
