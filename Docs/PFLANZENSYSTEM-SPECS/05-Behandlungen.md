# 05 – Epic BEH: Behandlungen (Schädlinge, Krankheiten, Kuren)

Ziel: Behandlungstermine werden geplant, ihre Fälligkeit wird sichtbar, und Abhaken ist ein Klick.

Quellen: Dashboard-Block „💊 Behandlungen", Karte in „🪴 Meine Exemplare", `CLAUDE.md`.

## Userstories

### US-BEH-01 · Behandlungstermine planen · ✅
Als **Pflanzenhalter** will ich Termine für eine Behandlung (auch mehrere für eine Wiederholungskur) anlegen, damit keine Wiederholung vergessen wird.

Akzeptanzkriterien:
- Formular unter dem Block: Exemplar-Auswahl, Grund (z. B. „Wollläuse"), Mittel (optional), Datum, „Behandlung planen".
- Ohne Grund oder ohne Datum passiert nichts.
- Speichern hängt `{Grund, Mittel (oder null), Datum, Erledigt: false}` an `Behandlungen` an.
- Eine Kur mit drei Terminen entsteht durch drei einzelne Einträge (heute, +1 Woche, +2 Wochen).

### US-BEH-02 · Offene Termine nach Dringlichkeit sehen · ✅
Als **Pflanzenhalter** will ich offene Behandlungen sortiert nach Fälligkeit sehen, damit ich Überfälliges zuerst abarbeite.

Akzeptanzkriterien:
- Tabelle: Pflanze (Link), Grund, Mittel (oder „—"), Fällig am, Status.
- Sortierung aufsteigend nach Datum.
- Status: `⚠️ überfällig seit N Tag(en)` (< 0), `🔔 heute fällig` (0), `🔔 in N Tagen` (1–3), sonst `in N Tagen`.
- Gibt es keine offenen Behandlungen: „Keine offenen Behandlungen."

### US-BEH-03 · Termin per Klick abhaken · ✅
Als **Pflanzenhalter** will ich eine erledigte Behandlung per Button abhaken.

Akzeptanzkriterien:
- „Erledigt ✔" setzt `Erledigt: true` an der Position des Eintrags im Array und deaktiviert den Button; die Zeile verschwindet nach dem Neuaufbau des Blocks.
- Erledigte Einträge bleiben als Historie im Frontmatter erhalten.

### US-BEH-04 · Offene Behandlung auf der Exemplar-Karte sehen · ✅
Als **Pflanzenhalter** will ich die nächste offene Behandlung direkt auf der Karte sehen.

Akzeptanzkriterien: siehe US-BES-06 (nächster Termin, überfällig/heute/in N Tg., „+N weitere").

## Anforderungen

| ID | Anforderung | Status |
|---|---|---|
| FR-BEH-01 | Format: `Behandlungen: [{Grund: Text, Mittel: Text\|null, Datum: "YYYY-MM-DD", Erledigt: Bool}]`. | ✅ |
| FR-BEH-02 | „Erledigt ✔" adressiert den Eintrag über seinen Array-Index (`idx`) zum Zeitpunkt des Rendern. Wird die Liste zwischen Rendern und Klick verändert (zweites Fenster), trifft der Klick den falschen Eintrag. | 🟡 (B-08) |
| FR-BEH-03 | Das Erledigt-Datum wird nicht gespeichert; es gibt nur den Bool. | ✅ (Einschränkung) |
| FR-BEH-04 | Das Formular listet alle Exemplare (auch Stecklinge). | ✅ |
| FR-BEH-05 | Eine Behandlung erzeugt keinen Push; sie wird erst beim Öffnen des Dashboards sichtbar. | ⬜ (MON-03) |
