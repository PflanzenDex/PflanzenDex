# 03 – Epic PHA: Pflegephasen

Ziel: Das System weiß aus dem Kalender, in welcher Phase (Wachstum/Ruhe) jede Pflanze sein sollte, und zeigt Abweichungen vom tatsächlichen Standort.

Quellen: Dashboard-Block „🔔 Was jetzt zu tun ist (Pflegephasen)", Art-Felder `Ruhephase_*`/`Standort_*`, `CLAUDE.md`.

## Userstories

### US-PHA-01 · Sehen, in welcher Phase jede Pflanze sein sollte · ✅
Als **Pflanzenhalter** will ich je Exemplar die erwartete Phase und den Soll-Standort sehen, damit ich Winter- und Sommerumzüge nicht vergesse.

Akzeptanzkriterien:
- Der Block listet jedes Exemplar, dessen Art (oder Exemplar) `Ruhephase_Von` und `Ruhephase_Bis` hat und das nicht `Status: "Steckling"` trägt.
- Phase = 🌙 Ruhephase, wenn das heutige Datum im Intervall `Von…Bis` liegt, sonst ☀️ Wachstumsphase. Das Intervall darf über den Jahreswechsel gehen (`Von > Bis`, z. B. `11-01`…`03-15`).
- Soll-Standort = `Standort_Ruhephase` bzw. `Standort_Wachstumsphase`.
- Die Berechnung basiert auf dem **heutigen Datum** (Trigger = Seitenaufruf), nicht auf einem Zeitplan.

### US-PHA-02 · Abweichungen zuerst sehen · ✅
Als **Pflanzenhalter** will ich, dass falsch stehende Pflanzen oben stehen, damit ich zuerst handle.

Akzeptanzkriterien:
- Status = `✅ <Standort>`, wenn `Standort_Aktuell` **exakt** (Textgleichheit) dem Soll entspricht, sonst `⚠️ steht noch: <Standort>`.
- Zeilen mit ⚠️ stehen vor Zeilen mit ✅.

### US-PHA-03 · Umstellung per Klick bestätigen · ✅
Als **Pflanzenhalter** will ich nach dem physischen Umstellen auf einen Button klicken, damit ich kein YAML editieren muss.

Akzeptanzkriterien:
- Bei Abweichung zeigt die Zeile „Jetzt umgestellt ✔".
- Klick schreibt `Standort_Aktuell = Soll-Standort` per `processFrontMatter` ins Exemplar, deaktiviert den Button und zeigt „gespeichert — aktualisiert sich gleich".
- Danach zeigt die Zeile ✅.

### US-PHA-04 · Nächsten Phasenwechsel vorhersehen · ✅
Als **Pflanzenhalter** will ich wissen, wann der nächste Wechsel ansteht, damit ich ihn einplane.

Akzeptanzkriterien:
- Nächster Wechsel = frühestes Datum ≥ heute aus `Von`/`Bis` dieses und des nächsten Jahres.
- Anzeige „heute", „in N Tagen (TT.MM.JJJJ)" bei ≤ 14 Tagen, sonst nur das Datum.

## Anforderungen

| ID | Anforderung | Status |
|---|---|---|
| FR-PHA-01 | `Ruhephase_Von/Bis` sind `MM-DD`-Strings. Eine Art ohne echte Ruhephase trägt trotzdem Werte (Beginn der Verlangsamung) und identische Standorte in beiden Phasen, dann gibt es nie eine Abweichung. | ✅ |
| FR-PHA-02 | `Standort_Aktuell` ist das einzige manuell gepflegte Standortfeld (pro Exemplar). Soll-Standorte stehen nur in der Art-Notiz. | ✅ |
| FR-PHA-03 | Der Standortvergleich ist ein exakter Textvergleich. Tippfehler erzeugen dauerhaft ⚠️; der Button setzt den Soll-Text daher immer **kopiert**, nicht frei eingegeben. | ✅ |
| FR-PHA-04 | Stecklinge sind ausgenommen. | ✅ |
| FR-PHA-05 | Das Anlegen-Formular belegt `Standort_Aktuell` bereits phasengerecht (siehe FR-BES). | ✅ |
| FR-PHA-06 | Ein Exemplar ohne `Standort_Aktuell` soll als eigene Warnung („Standort fehlt") erscheinen. Ist: Anzeige „steht noch: undefined". | ⬜ (B-04) |
| FR-PHA-07 | Erinnerung am Phasenwechsel-Tag **ohne** Dashboard-Aufruf (Push). | ⬜ (siehe MON-02) |
