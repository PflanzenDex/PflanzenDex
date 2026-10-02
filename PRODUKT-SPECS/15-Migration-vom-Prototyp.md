# 15 – Epic MIG: Migration vom Prototyp

Ziel: Die drei Start-Nutzer übernehmen ihre Daten aus dem Obsidian-Vault in die App, ohne etwas neu einzutippen, und können beide Systeme eine Zeit lang nebeneinander betreiben.

Der Vault ist nach der Migration **nicht mehr Wahrheit**. Er bleibt Referenz und Sicherung.

## Userstories

### US-MIG-01 · Vault-Daten importieren · ⬜ neu
Als **Pflanzenhalter** will ich meine Vault-Daten in mein Konto übernehmen.

Akzeptanzkriterien:
- Der Import liest die Prototyp-Struktur (Art-Notizen, Exemplar-Notizen, Archiv, Wunschliste, Fotos, `Arten.md`) und legt Entitäten nach `00-Produktueberblick.md` an (Zuordnung in der Tabelle unten).
- **Trockenlauf zuerst:** Der Import zeigt vorab, was angelegt wird (Zahl je Entität), und was nicht übernommen werden kann (Warnliste), ohne zu schreiben.
- **Idempotent:** Ein zweiter Import derselben Daten erzeugt keine Dubletten, sondern aktualisiert oder überspringt (US-QS-03).
- **Fehlerbericht:** Jede nicht übernommene Datei steht mit Grund in einem Bericht; nichts wird still verworfen (P-10).
- Lauf zum Prüfen: die Kennzahlen des Prototyps (13 Arten, 17 Exemplare, 2 Archivierte, 8 Wunschlisten-Kandidaten, 215 Katalogarten) müssen sich im Konto wiederfinden.

### US-MIG-02 · Standorte, Lichtzonen und Skalen angleichen · ⬜ neu
Akzeptanzkriterien:
- Die vier Lampen-Strings werden den Voreinstellungs-Lichtzonen (US-LIC) zugeordnet; abweichende Strings erscheinen in der Warnliste mit Vorschlag.
- Die Freitext-Standorte (`Standort_Aktuell`, `Standort_Wachstumsphase/Ruhephase`) werden zu **Standort-Entitäten**: gleiche Texte (normiert) ergeben einen Standort. Der Halter ordnet jedem neuen Standort eine Lichtzone zu, bevor der Import abgeschlossen wird.
- `Schwierigkeit` als Text (`Einfach/Medium/Schwer`) wird in Zahl 1–3 umgerechnet; `Arten.md` ist schon Zahl.
- Datumsangaben werden als lokale Kalenderdaten übernommen. Messungen, die der Prototyp wegen des UTC-Fehlers (B-01) am Vortag gespeichert haben könnte, werden **nicht** korrigiert, aber in der Warnliste für den Zeitraum 00:00–02:00 nicht erfasst (das Original hat keine Uhrzeit).

### US-MIG-03 · Parallelbetrieb und Umschalten · ⬜ neu
Akzeptanzkriterien:
- Der Vault bleibt unverändert; die App schreibt nie hinein.
- Eine Vergleichsansicht („Prototyp vs. App") zeigt je Exemplar die Daten aus dem Import und aktuelle Daten der App, damit Abweichungen früh auffallen.
- Der Wechsel gilt als vollzogen, wenn der Halter ihn bestätigt; danach pflegt er nur noch in der App.

## Zuordnung Prototyp → Produkt

| Prototyp | Produkt | Anmerkung |
|---|---|---|
| Art-Notiz (`Arten/<Art>.md`) | Art im Katalog (DM-BES-01) | Status `kuratiert`; Der Import legt die Art nur an, wenn sie im Katalog fehlt; vorhandene Arten werden referenziert, abweichende Texte nicht zusammengeführt (E-02) |
| Körper der Art-Notiz | Botanische Story, Pflege, Rückschnitt, Tipps, Erfolgskriterien | in Felder aufgeteilt |
| Exemplar-Notiz | Exemplar (DM-BES-02) | `Art` (Wikilink) wird zum Verweis; Dateiname wird Name nach DM-BES-03 |
| `Kennzeichen`, `Standort_Aktuell`, `Gefangen_Am`, `Status`, `Licht_Hardware` | Kennzeichen, Standort, Gefangen_Am, Status, Lichtzone-Override | |
| `Wachstumslog` | Messungen (DM-WAC-01) | `Qualität`, `Notiz`, `Foto` mit |
| `Behandlungen` | Behandlungen (DM-BEH-01) | Erledigt ohne Datum: `Erledigt_Am` bleibt leer |
| Fotos (`Fotos/<Exemplar>/<Datum>.jpg`) | Messfotos | werden neu verarbeitet (EXIF entfernen, Größe) |
| `04-Archive/Pflanzen/` | Exemplare mit `Status: Archiviert` | altes Einzeldatei-Format (Art + Exemplar vermischt) wird gesplittet oder in die Warnliste gelegt |
| `Wunschliste.md` | Wünsche (DM-WUN-01) | Bild-URLs werden gesichert, nicht gehotlinkt |
| `Arten.md`, `Pokedex-Baum.json` | Pokédex-Katalog und Baum | Aufbau-Job wird neu angestoßen; Prototyp-Skript ist Wiederverwendungs-Kandidat (E-01) |
| `.pokedex-state.json` | `gesehen` des Kontos | |
| Finanz- und Sparziel-Notizen | **nicht Teil** der App | bleiben im Vault |

## Anforderungen

| ID | Anforderung | Status |
|---|---|---|
| FR-MIG-01 | Der Import ist ein einmal oder wiederholt ausführbares Werkzeug mit Trockenlauf, nicht Teil des Alltagsbetriebs. | ⬜ |
| FR-MIG-02 | Der Import schreibt nur in das Konto des ausführenden Nutzers (NFR-09). | ⬜ |
| FR-MIG-03 | Dateien, die der Import nicht versteht, werden nie gelöscht oder verändert (Quelle bleibt unangetastet). | ⬜ |
| FR-MIG-04 | Der Import prüft das Prototyp-Format tolerant (YAML-Parser, nicht Zeilenmuster); abweichende Formatierung führt zu Warnung, nicht zu Abbruch (vgl. B-06). | ⬜ |
