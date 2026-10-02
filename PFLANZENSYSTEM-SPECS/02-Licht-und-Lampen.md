# 02 – Epic LIC: Licht & Lampen

Ziel: Jede Art bekommt die Lampenstufe, die ihr maximales Wachstum ermöglicht, und der Halter sieht, wo im Schrank noch Platz ist.

Quellen: `02-Areas/Pflanzen/Lampen-Zuordnung.md`, Dashboard-Block „☀️ Alle Pflanzen", Art-Vorlage, `CLAUDE.md`.

## Userstories

### US-LIC-01 · Art der richtigen Lampenstufe zuordnen · ✅
Als **Pflanzenhalter** will ich, dass jede Art anhand ihres biologischen Bedarfs einer von vier Lampenstufen zugeordnet wird, damit sie wächst und nicht nur überlebt.

Akzeptanzkriterien:
- Die Art-Vorlage verlangt für `Licht_Hardware` genau einen der vier Strings aus DM-05 und für `Licht_Lux_Bedarf` den tatsächlichen Lux-Bedarf für maximales Wachstum als ganze Zahl.
- Die Zuordnung folgt dem Sättigungspunkt der Photosynthese. Die Faustregel steht in `Lampen-Zuordnung.md`.
- Lampe 1 ist **nie** Zuordnungsstufe für ausgewachsene Pflanzen.
- Hochstufen nur, wenn der Bedarf mindestens 80 % der Lux-Decke der aktuellen Stufe erreicht. Liegt der Bedarf mehr als 30 % unter der Decke, bleibt die Art dort (mehr Licht bringt Stress).
- C3-Pflanzen mit weichem Blatt („sonnenliebend", z. B. Basilikum) werden nicht automatisch in Lampe 3 eingestuft.

### US-LIC-02 · Wissen, wo noch Platz ist · ✅
Als **Pflanzenhalter** will ich die Verteilung der Exemplare auf die Lampen 2–4 sehen, damit ich weiß, welche Stufe die dünnste ist.

Akzeptanzkriterien:
- `Lampen-Zuordnung.md` → „📋 Verteilung" zählt Exemplare je Lampe 2, 3, 4 (Exemplar-Wert `Licht_Hardware` vor Artwert).
- Lampe 1 zählt nicht mit.
- Der Text nennt die dünnste Stufe; bei Gleichstand alle Gleichplatzierten, mit Hinweis auf `Wunschliste`.

### US-LIC-03 · Wissen, wie nah die Pflanze an die Lampe gehört · ✅
Als **Pflanzenhalter** will ich eine Übersicht nach Lichthunger mit Positionsempfehlung, damit ich die Pflanzen im Regal richtig stelle.

Akzeptanzkriterien:
- Block „☀️ Alle Pflanzen (nach Lichthunger – nah → weit)": je Art mit mindestens einem Exemplar und gesetztem `Licht_Lux_Bedarf` eine Zeile, sortiert absteigend nach Bedarf.
- Positionsabbildung nach Lux-Bedarf:

  | Bedarf | Position |
  |---|---|
  | ≥ 50.000 | 🔆 Direkt unter Lampe |
  | ≥ 15.000 | 🔆 Sehr nah (~10 cm) |
  | ≥ 8.000 | 🌤 Nah (~20–30 cm) |
  | ≥ 4.000 | ⛅ Mittlerer Abstand (~40 cm) |
  | darunter | 🌥 Kann weiter weg stehen |

- Spalten: Pflanze, Lampe, Lux-Bedarf (de-DE formatiert), Position.

### US-LIC-04 · Aktuelle Zuordnung und Einstufungsregeln nachschlagen · ✅
Als **Pflanzenhalter** will ich eine Referenz mit den vier Stufen, Indikatoren und Warnsignalen sowie die aktuelle Bestandstabelle, damit ich neue Arten konsistent einordne.

Akzeptanzkriterien:
- `Lampen-Zuordnung.md` enthält die Stufentabelle, Indikatoren für höhere Stufen (CAM + aride Herkunft, „Full Sun", dicke Cuticula, Dornen), Warnsignale und die Live-Tabelle „Aktuelle Zuordnung (Bestand)" (Pflanze, Lampe, Bedarf), sortiert nach Bedarf absteigend.
- Die Tabelle aktualisiert sich ohne manuelles Nachpflegen.

## Anforderungen

| ID | Anforderung | Status |
|---|---|---|
| FR-LIC-01 | Lampen-Strings sind in Art-Notizen, Dashboard, Wunschliste und Referenz zeichengleich (DM-05). Abweichung führt zu stillem Nichtzählen. | ✅ (Risiko, siehe B-07) |
| FR-LIC-02 | Das Exemplarfeld `Licht_Hardware` überschreibt den Artwert (Steckling → Lampe 1). | ✅ |
| FR-LIC-03 | `Licht_Lux_Bedarf` ist eine Zahl. Fehlt sie, entfällt die Art in der Lichtübersicht. | ✅ |
| FR-LIC-04 | Lampenverteilung und Wunschlisten-Priorisierung verwenden dieselbe Zählung (Exemplar-Ebene, nur Lampen 2–4). | ✅ |
| FR-LIC-05 | Die Lichtübersicht (Art-Sicht) verwendet `Licht_Lux_Bedarf` der Art, auch für Stecklinge; die Verteilung (Exemplar-Sicht) respektiert den Steckling-Override. Das ist beabsichtigt, aber nicht dokumentiert. | 🟡 |
| FR-LIC-06 | Die real gemessene Lichtstärke der Lampen wird einmalig mit einer Handy-App (Photone) geprüft und in `Lampen-Zuordnung.md` mit Datum und Methode notiert. | ⬜ (siehe MON-07) |
