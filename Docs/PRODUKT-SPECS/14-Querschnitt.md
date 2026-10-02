# 14 – Epic QS: Querschnitt (Datenschutz, Sicherheit, Mobile, Qualität)

Nicht-funktionale Anforderungen für alle Epics. Alle ⬜. Maßstab sind die Produktprinzipien P-01 bis P-11 (`00-Produktueberblick.md`).

## Userstories

### US-QS-01 · Nichts hängt am Erinnern · ⬜ (Prototyp 🟡)
Als **Pflanzenhalter** will ich, dass das System Handlungsbedarf selbst meldet.

Akzeptanzkriterien:
- Phasenwechsel, fällige Behandlungen, überfällige Messungen und Wunschlisten-Puffer lösen eine Erinnerung aus (Epic MON), ohne dass die App geöffnet wird.
- Die Startseite „Heute" zeigt dieselben Punkte (eine Quelle, `FR-MON-03`).

### US-QS-02 · Logik ist testbar · ⬜ (Prototyp 🟡)
Als **Entwickler** will ich jede Berechnung mit Tests absichern.

Akzeptanzkriterien:
- Phase, Rate, Trend, Lichtzonen-Zählung, Priorisierung, Namensregel, Rang, Meilensteine, Tauschzustände und Feed-Ableitung liegen als reine Logik ohne I/O vor und haben Tests.
- Jede Story mit Status ✅ hat mindestens einen Test, dessen Name die Story-ID trägt (P-06).

### US-QS-03 · Wiederholbar ohne Angst · ⬜ (Prototyp ✅)
Akzeptanzkriterien:
- Jede schreibende Operation ist idempotent oder verhindert Doppelausführung (Doppelklick, Wiederholung nach Abbruch).
- Hintergrundjobs (Erinnerungen, Katalog-Anreicherung, Foto-Verarbeitung) liefern bei Wiederholung dasselbe Ergebnis.

### US-QS-04 · Abweichungen werden sichtbar · ⬜ (Prototyp ✅)
Akzeptanzkriterien:
- Falscher Standort, überfällige Behandlung, Puffer unterschritten, vergeilte Letztmessung, Datenlücken erscheinen als Warnung mit Handlungsanweisung (P-09).
- Daten, die in einer Auswertung fehlen würden (Exemplar ohne Art, ohne Standort), erscheinen in einer Warnliste (P-10).

### US-QS-05 · Datenschutz und Kontrolle · ⬜ (Prototyp ✅ teilweise)
Als **Pflanzenhalter** will ich wissen und bestimmen, was mit meinen Daten geschieht.

Akzeptanzkriterien:
- Auskunft, Export und vollständige Löschung des Kontos (siehe `US-ACC-04`).
- Fotos werden vor Speicherung von EXIF/GPS befreit und auf eine Höchstgröße verkleinert (Prototyp: lange Seite 1600 px, Qualität 82).
- Standort, Wachstumsnotizen, Behandlungen, Preise und Finanzdaten werden nie an Freunde oder Partner übertragen (FR-SOZ-01, FR-EQU-08).
- Eine Seite „Was wird gemessen?" nennt Nutzungsmessung und Klickzählung; ohne Einwilligung wird nichts gezählt.

### US-QS-06 · Quellen und Lizenzen · ⬜ (Prototyp ✅)
Akzeptanzkriterien:
- Wikipedia-Texte und -Bilder (CC BY-SA) werden mit Quelllink und Lizenzangabe angezeigt (FR-POK-07).
- Nutzerbilder bleiben Eigentum des Nutzers; Weitergabe nur nach Freigabe.
- Partnerlinks sind gekennzeichnet (FR-EQU-05).

### US-QS-07 · Mobil nutzbar · ⬜ neu
Als **Pflanzenhalter** will ich die App am Handy neben der Pflanze bedienen.

Akzeptanzkriterien:
- Alle Alltagsabläufe (Messen mit Foto, Gießen/Standort bestätigen, Behandlung abhaken, Heute-Liste) sind mit einer Hand und ohne horizontales Scrollen bedienbar.
- Die App ist installierbar (Startbildschirm) und zeigt zuletzt geladene Daten, wenn kein Netz da ist; Schreibaktionen werden gepuffert und bei Netz nachgereicht, ohne Doppeleintrag (`US-QS-03`).
- Foto-Aufnahme direkt aus der Kamera.

## Nicht-funktionale Anforderungen

| ID | Anforderung | Status |
|---|---|---|
| NFR-01 | **Datenformat:** Felder haben feste, validierte Typen (Zahl, Datum, Aufzählung). Freitext trägt nur Inhalt, keine Logik. | ⬜ |
| NFR-02 | **Eingabe ohne Datei-Editieren:** Alles geht über Formulare, Buttons oder den KI-Client des Halters. | ⬜ |
| NFR-03 | **Single Source:** Artwissen steht einmal im Katalog; Exemplare tragen nur Abweichungen. | ⬜ |
| NFR-04 | **Live-Ableitung:** Besitz, Verteilung, Phasen, Trends werden aus Rohdaten berechnet; keine zweite Kopie wird nachgepflegt. | ⬜ |
| NFR-05 | **Keine erfundenen Zahlen** (P-08). | ⬜ |
| NFR-06 | **Kein stilles Verschwinden** (P-10). | ⬜ |
| NFR-07 | **Handlungsanweisung statt Datenfriedhof** (P-09). | ⬜ |
| NFR-08 | **Zeitzonen:** Alle Kalenderdaten sind lokale Daten des Nutzers; Phasenberechnung und Erinnerungen nutzen die Zeitzone des Nutzerprofils. Keine Verschiebung durch UTC (löst B-01). | ⬜ |
| NFR-09 | **Mandantentrennung:** Test, dass Nutzer A niemals Daten von Nutzer B abfragen oder ändern kann, ohne Freundschaft und Freigabe (P-04). | ⬜ |
| NFR-10 | **Sicherheit:** Anmeldung über einen etablierten Dienst, nicht selbst gebaut (E-03). Sitzungen widerrufbar. Eingaben validiert, Dateiuploads auf Typ und Größe geprüft. | ⬜ |
| NFR-11 | **Datenschutz (DSGVO):** Rechtsgrundlagen und Einwilligungen dokumentiert, Hosting in der EU (Annahme, E-01), Auftragsverarbeiter benannt, Löschkonzept, Datenexport. Datenschutzerklärung und Impressum vor dem ersten externen Nutzer. | ⬜ |
| NFR-12 | **Performance:** Startseite „Heute" und Sammlungsansicht sind für 100 Exemplare ohne spürbare Wartezeit nutzbar (Annahme, am Handy bei durchschnittlichem Netz). | ⬜ |
| NFR-13 | **Barrierefreiheit:** Bedienung per Tastatur, Kontraste, Alternativtexte für Fotos (Art/Exemplarname). Status nie nur über Farbe oder Emoji. | ⬜ |
| NFR-14 | **Sprache:** Oberfläche zunächst Deutsch; Anzeige `TT.MM.JJJJ`, Speicherung ISO. Texte sind austauschbar (spätere Übersetzung). | ⬜ |
| NFR-15 | **Backups und Wiederherstellung:** regelmäßige Sicherung der Nutzerdaten und Fotos, Wiederherstellung getestet. | ⬜ |
| NFR-16 | **Kosten im Blick:** Betriebskosten (Hosting, Speicher, Last durch KI-Verbindungen) werden gemessen und je Nutzer ausgewiesen, damit `13-Business-Case.md` auf Daten beruht. | ⬜ |
| NFR-17 | **Externe Quellen** (Wikipedia, Wikidata, GBIF, OpenTree) werden gedrosselt und gecacht abgefragt; Ausfall einer Quelle blockiert keine Nutzerfunktion. | ⬜ |
| NFR-18 | **Beobachtbarkeit:** Fehler und fehlgeschlagene Jobs sind sichtbar (Log, Alarm an Betreiber), ohne Nutzerdaten im Klartext zu protokollieren. | ⬜ |

## Prinzipien-Check je Epic

| Frage | Pflege (BES–BEH) | Pokédex | Soziales | Erinnerungen |
|---|---|---|---|---|
| Trigger ohne Erinnern? | Erinnerung (MON) | Fang automatisch aus Bestand | Benachrichtigung bei Handlungsbedarf | ja |
| Festes, validiertes Format? | ja | ja | ja | ja |
| Check gegen Abweichung? | ⚠️ in „Heute" | Katalog-/Anreicherungslücken | Freigabe-Hinweise | Sensor „stumm" |
| Idempotent? | ja | ja | ja (Tauschzustände) | ja (einmal je Anlass und Tag) |
| Mensch liefert nur Menschliches? | ja | ja | ja | ja |
| Sagt, was zu tun ist? | ja | „noch N: …" | Anfragen mit Aktion | ja |
