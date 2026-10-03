# 04 – Epic PHA: Pflegephasen

Ziel: Das System weiß aus dem Kalender, in welcher Phase jede Pflanze sein sollte, und zeigt Abweichungen vom tatsächlichen Standort.

Prototyp-Bezug: Epic PHA. Unterschied: Standorte sind Entitäten, kein Textvergleich; Berechnung und Erinnerung laufen im Hintergrund, nicht nur beim Öffnen.

## Userstories

### US-PHA-01 · Sehen, in welcher Phase jede Pflanze sein sollte · ⬜ (Prototyp ✅)

Als **Pflanzenhalter** will ich je Exemplar die erwartete Phase und den Soll-Standort sehen, damit ich Winter- und Sommerumzüge nicht vergesse.

Akzeptanzkriterien:

- Gelistet wird jedes aktive Exemplar (nicht Steckling, nicht archiviert), dessen Art (oder Exemplar) einen Ruhephasen-Zeitraum hat.
- Phase = Ruhephase, wenn das heutige Datum **in der Zeitzone des Nutzers** im Intervall `Von…Bis` liegt, sonst Wachstumsphase. Das Intervall darf über den Jahreswechsel gehen (z. B. 11-01 bis 03-15).
- Soll-Standort = der dem Exemplar (oder der Art) für diese Phase zugeordnete Standort.

### US-PHA-02 · Abweichungen zuerst sehen · ⬜ (Prototyp ✅)

Als **Pflanzenhalter** will ich, dass falsch stehende Pflanzen oben stehen.

Akzeptanzkriterien:

- Abweichung = Standort des Exemplars ≠ Soll-Standort (Vergleich der Standort-Kennung, nicht des Textes).
- Zeilen mit Abweichung stehen vor Zeilen ohne. Ein Exemplar ohne Standort ist eine eigene Warnung „Standort fehlt" (US-BES-08), kein Platzhaltertext.

### US-PHA-03 · Umstellung per Tipp bestätigen · ⬜ (Prototyp ✅)

Als **Pflanzenhalter** will ich nach dem physischen Umstellen einmal tippen.

Akzeptanzkriterien:

- „Jetzt umgestellt" setzt den Standort des Exemplars auf den Soll-Standort (ausgewählt, nie frei getippt) und aktualisiert die Zeile sofort.
- Die Aktion ist idempotent; Doppeltipp erzeugt keinen Doppeleintrag (US-QS-03).
- Mehrere Exemplare mit gleichem Soll-Standort lassen sich in einem Schritt bestätigen (neu gegenüber dem Prototyp).

### US-PHA-04 · Nächsten Phasenwechsel vorhersehen · ⬜ (Prototyp ✅)

Akzeptanzkriterien:

- Nächster Wechsel = frühestes Datum ≥ heute aus `Von`/`Bis` dieses und des nächsten Jahres.
- Anzeige „heute", „in N Tagen (TT.MM.JJJJ)" bei ≤ 14 Tagen, sonst nur das Datum.

## Anforderungen

| ID        | Anforderung                                                                                                                                                                                     | Status                                                                                |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| FR-PHA-01 | `Ruhephase_Von/Bis` sind Monat-Tag-Werte. Arten ohne echte Ruhephase tragen trotzdem Werte (Beginn der Verlangsamung) und gleiche Standorte in beiden Phasen, dann gibt es nie eine Abweichung. | ⬜                                                                                    |
| FR-PHA-02 | Das Exemplar trägt genau ein manuell gepflegtes Standortfeld (Ist). Soll-Standorte je Phase gehören zum Pflegeprofil der Art des Halters.                                                       | ⬜                                                                                    |
| FR-PHA-03 | Standortvergleich über Kennung. Tippfehler sind nicht mehr möglich, weil nur Auswahl erlaubt ist (löst das Prototyp-Risiko aus FR-PHA-03).                                                      | ⬜                                                                                    |
| FR-PHA-04 | Stecklinge sind ausgenommen.                                                                                                                                                                    | ⬜                                                                                    |
| FR-PHA-05 | Das Anlegen belegt den Standort phasengerecht (US-BES-02).                                                                                                                                      | ⬜ (Port `SollStandortQuelle` in `bestand` steht, die Umsetzung durch `pflege` fehlt) |
| FR-PHA-06 | Am Tag des Phasenwechsels erinnert das System, wenn Exemplare noch am alten Standort stehen (US-MON-02). Die Berechnung ist dieselbe wie in dieser Epic (FR-MON-03).                            | ⬜                                                                                    |
