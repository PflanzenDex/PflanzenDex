# 03 – Epic LIC: Licht, Lichtzonen und Standorte

Ziel: Jede Art bekommt die Lichtstufe, die ihr maximales Wachstum ermöglicht, und der Halter sieht, wo noch Platz ist. Standorte sind benannte Plätze, die einer Lichtzone zugeordnet sind.

Prototyp-Bezug: Epic LIC. Im Prototyp sind die vier Lampenstufen **zeichengleiche Strings** an fünf Stellen (B-07) und Standorte **Freitext mit exaktem Vergleich** (FR-PHA-03). In der App sind beide Entitäten.

## Voreinstellung der Lichtzonen

| Zone | Zweck | Lux-Angabe | PPFD (ca.) |
|---|---|---|---|
| Lampe 1 | Stecklingslicht, nie Zuordnungsstufe für Erwachsene | 1.500 | 36 µmol/m²/s |
| Lampe 2 | Unterholz, Halbschatten | 15.000 | 300 |
| Lampe 3 | subtropische Vollsonne, Stammsukkulenten | 100.000 | 1600 |
| Lampe 4 | Wüsten-Vollsonne, CAM-Kakteen | 110.000 | 2000 |

Diese vier gelten als Voreinstellung für neue Konten. Der Halter kann Namen und Werte anpassen und Zonen hinzufügen (US-LIC-05).

## Userstories

### US-LIC-01 · Art der richtigen Lichtzone zuordnen · ⬜ (Prototyp ✅)
Als **Pflanzenhalter** will ich, dass jede Art anhand ihres biologischen Bedarfs einer Zone zugeordnet ist, damit sie wächst und nicht nur überlebt.

Akzeptanzkriterien:
- Der Katalog trägt den Lux-Bedarf für maximales Wachstum als ganze Zahl und eine Standard-Stufe 2–4 der Voreinstellung. Die Zone des Kontos wird daraus abgeleitet (FR-BES-10) und kann im Pflegeprofil überschrieben werden (US-BES-09).
- Die Zuordnung folgt dem Sättigungspunkt der Photosynthese.
- Stecklingslicht ist **nie** Zielzone für Erwachsene.
- Hochstufen nur, wenn der Bedarf mindestens 80 % der Lux-Decke der aktuellen Stufe erreicht. Liegt der Bedarf mehr als 30 % unter der Decke, bleibt die Art dort (mehr Licht bringt Stress).
- C3-Pflanzen mit weichem Blatt („sonnenliebend") werden nicht automatisch in die starke Zone eingestuft.

### US-LIC-02 · Wissen, wo noch Platz ist · ⬜ (Prototyp ✅)
Als **Pflanzenhalter** will ich die Verteilung meiner Exemplare auf die Zonen sehen.

Akzeptanzkriterien:
- Zählung je Zone 2–4 auf Exemplar-Ebene (Lichtzone des Exemplars vor der der Art); Stecklingslicht zählt nicht.
- Die Anzeige nennt die dünnste Zone. Bei Gleichstand alle Gleichplatzierten mit Hinweis auf die Wunschliste.

### US-LIC-03 · Wissen, wie nah die Pflanze an die Lampe gehört · ⬜ (Prototyp ✅)
Als **Pflanzenhalter** will ich eine Übersicht nach Lichthunger mit Positionsempfehlung.

Akzeptanzkriterien:
- Je Art mit mindestens einem aktiven Exemplar und gesetztem Lux-Bedarf eine Zeile, sortiert absteigend nach Bedarf.
- Positionsabbildung nach Lux-Bedarf:

  | Bedarf | Position |
  |---|---|
  | ≥ 50.000 | direkt unter der Lampe |
  | ≥ 15.000 | sehr nah (~10 cm) |
  | ≥ 8.000 | nah (~20–30 cm) |
  | ≥ 4.000 | mittlerer Abstand (~40 cm) |
  | darunter | kann weiter weg stehen |

- Spalten: Pflanze, Zone, Lux-Bedarf (lokalisiert formatiert), Position. Die Schwellen sind Voreinstellungen und anpassbar.

### US-LIC-04 · Einstufungsregeln nachschlagen · ⬜ (Prototyp ✅)
Als **Pflanzenhalter** will ich die Referenz zu Stufen, Indikatoren und Warnsignalen lesen.

Akzeptanzkriterien:
- Eine Seite „Licht" enthält die Zonentabelle des Halters, Indikatoren für höhere Stufen (CAM + aride Herkunft, „Full Sun", dicke Cuticula, Dornen) und Warnsignale.
- Die Bestandstabelle (Pflanze, Zone, Bedarf) aktualisiert sich ohne Nachpflege.

### US-LIC-05 · Standorte und Lichtzonen verwalten · ⬜ neu
Als **Pflanzenhalter** will ich meine Standorte und Lichtzonen selbst definieren, damit die App meinen Aufbau abbildet.

Akzeptanzkriterien:
- Ein **Standort** hat Name, Lichtzone und Art (`innen` / `außen`); beliebig viele, einer Zone zugeordnet.
- Eine **Lichtzone** hat Name, Lux-Decke, optional PPFD, Reihenfolge. Das Löschen einer Zone, die Exemplare oder Arten nutzt, wird abgelehnt und nennt, welche (kein stilles Verschwinden).
- Standort umbenennen verändert keine Zuordnungen (Verweis über Kennung, kein Textvergleich).
- Standorte ohne Zone erscheinen in „Hinweise" (US-BES-08).

## Anforderungen

| ID | Anforderung | Status |
|---|---|---|
| FR-LIC-01 | Lichtzonen sind Daten des Kontos mit Voreinstellung, nicht hartkodiert; Zählung, Wunschliste und Empfehlungen lesen sie zentral (löst B-07). | ⬜ |
| FR-LIC-02 | Die Lichtzone eines Exemplars überschreibt die der Art (Steckling → Stecklingslicht). | ⬜ |
| FR-LIC-03 | Fehlt der Lux-Bedarf, entfällt die Art in der Lichtübersicht und erscheint in „Hinweise". | ⬜ |
| FR-LIC-04 | Verteilung und Wunschlisten-Priorisierung nutzen dieselbe Zählung (Exemplar-Ebene, nur Zonen 2–4). | ⬜ |
| FR-LIC-05 | Die Lichtübersicht (Art-Sicht) nutzt den Lux-Bedarf der Art auch für Stecklinge; die Verteilung (Exemplar-Sicht) respektiert den Override. Beabsichtigt und in der Oberfläche erklärt. | ⬜ |
| FR-LIC-06 | Eine gemessene Lichtstärke je Lampe (Handy-App) kann pro Gerät hinterlegt werden (US-EQU-03). Fehlt sie, gilt die Angabe der Zone, gekennzeichnet als „nicht gemessen". | ⬜ |
