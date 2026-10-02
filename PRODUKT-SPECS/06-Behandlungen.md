# 06 – Epic BEH: Behandlungen (Schädlinge, Krankheiten, Kuren)

Ziel: Behandlungstermine werden geplant, ihre Fälligkeit wird sichtbar und Abhaken ist ein Tipp.

Prototyp-Bezug: Epic BEH. Unterschiede: stabile Kennung statt Array-Index (löst B-08), Erledigt-Datum wird gespeichert, Erinnerung ohne Öffnen der App.

## Userstories

### US-BEH-01 · Behandlungstermine planen · ⬜ (Prototyp ✅)
Als **Pflanzenhalter** will ich Termine für eine Behandlung anlegen, auch mehrere für eine Wiederholungskur.

Akzeptanzkriterien:
- Formular: Exemplar (auch mehrere), Grund (z. B. „Wollläuse"), Mittel (optional, später verknüpfbar mit Equipment, US-EQU-05), Datum.
- Ohne Grund oder Datum wird nichts gespeichert.
- „Kur planen": ein Grund, ein Mittel, N Termine im Abstand von T Tagen (Voreinstellung 3 Termine, 7 Tage) erzeugen N einzelne Behandlungen.

### US-BEH-02 · Offene Termine nach Dringlichkeit sehen · ⬜ (Prototyp ✅)
Akzeptanzkriterien:
- Liste: Pflanze, Grund, Mittel oder „—", Fällig am, Status.
- Sortierung aufsteigend nach Datum.
- Status: `überfällig seit N Tag(en)` (< 0), `heute fällig` (0), `in N Tagen` (1–3), sonst Datum.
- Ohne offene Behandlungen: „Keine offenen Behandlungen."

### US-BEH-03 · Termin per Tipp abhaken · ⬜ (Prototyp ✅)
Akzeptanzkriterien:
- „Erledigt" setzt `Erledigt: true` und speichert `Erledigt_Am` (lokales Datum). Adressiert wird die Behandlung über ihre Kennung, nicht ihre Position (FR-BEH-02).
- Die Aktion ist idempotent; ein zweiter Tipp (zweites Gerät) ändert nichts.
- Erledigte Einträge bleiben als Historie und sind je Exemplar einsehbar.

### US-BEH-04 · Offene Behandlung auf der Exemplar-Karte sehen · ⬜ (Prototyp ✅)
Akzeptanzkriterien: siehe US-BES-06 (nächster Termin, überfällig/heute/in N Tg., „+N weitere").

## Datenmodell

### DM-BEH-01 Behandlung

`Kennung`, `Exemplar`, `Grund` (Text), `Mittel` (Text oder Verweis auf Equipment, `null` erlaubt), `Datum`, `Erledigt` (Bool), `Erledigt_Am?`, `Kur?` (gemeinsame Kennung der Termine einer Kur).

## Anforderungen

| ID | Anforderung | Status |
|---|---|---|
| FR-BEH-01 | Format wie DM-BEH-01; Datum lokal. | ⬜ |
| FR-BEH-02 | Änderungen adressieren die Behandlung über eine stabile Kennung; paralleles Bearbeiten (zwei Geräte) trifft nie einen falschen Eintrag (löst B-08). | ⬜ |
| FR-BEH-03 | Das Erledigt-Datum wird gespeichert. | ⬜ |
| FR-BEH-04 | Das Formular listet alle aktiven Exemplare, auch Stecklinge. | ⬜ |
| FR-BEH-05 | Fällige Behandlungen lösen eine Erinnerung aus (US-MON-03). | ⬜ |
| FR-BEH-06 | Gesundheitsangaben (offene Behandlung, zuletzt behandelt: Grund, Datum) fließen **ohne Mittel und Notizen** in Tauschangebote ein (US-SOZ-08). | ⬜ |
