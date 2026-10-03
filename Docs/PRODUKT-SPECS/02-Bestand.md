# 02 – Epic BES: Bestand (Artenkatalog und Exemplare)

Ziel: Artwissen einmal im gemeinsamen Katalog, jeden Topf als eigenes Exemplar, und beides so anlegen, dass alle Auswertungen ohne Nacharbeit funktionieren.

Prototyp-Bezug: Epic BES (`../PFLANZENSYSTEM-SPECS/01-Bestand-Arten-und-Exemplare.md`). Der Unterschied: Im Prototyp erzeugt jeder Halter seine Art-Notizen selbst. In der App kommen Arten aus einem **gemeinsamen Katalog** (E-02), den Betreiber und geprüfte Vorschläge füllen; kontoeigene Abweichungen liegen im **Pflegeprofil** (DM-BES-04).

## Userstories

### US-BES-01 · Art aus dem Katalog wählen oder neu anlegen · 🟨 (Prototyp ✅)
Als **Pflanzenhalter** will ich für ein neues Exemplar die passende Art finden, damit Pflege, Licht und Erfolgskriterien feststehen, bevor ich den Topf anlege.

Akzeptanzkriterien:
- Gegeben die Suche nach lateinischem oder deutschem Namen, wenn die Art im Katalog steht, dann sehe ich ihr Profil (Felder aus DM-BES-01) und wähle sie.
- Gegeben eine Art, die nicht im Katalog steht, wenn ich „Art vorschlagen" wähle, dann kann ich ein Profil im Formular mit allen Pflichtfeldern anlegen (der Weg ohne KI, FR-KI-05) oder die Recherche an meinen KI-Client übergeben (Auftrag, US-KI-08); dessen Ergebnis kommt als Entwurf (US-KI-03, US-KI-09), den ich prüfe und bestätige. Das Profil hat zunächst den Status `Vorschlag` und ist **nur für mich sichtbar**; ich kann trotzdem ein Exemplar anlegen. Es kommt in die Prüfliste (US-BES-10). Erst nach der Freigabe steht die Art allen zur Verfügung und zählt im Pokédex (US-POK-06); bis dahin gilt: „Art prüfen lassen, dann zählt sie" (FR-BES-11, FR-BES-06).
- Eine Art ohne Epitheton (nur Gattung) wird als Eintrag erlaubt, zählt aber nicht als Pokédex-Fang (siehe US-POK-06).
- Dubletten (gleicher normierter Name oder Synonym) werden erkannt und auf die vorhandene Art verwiesen. Die Suche findet auch Synonyme (z. B. *Sansevieria* → *Dracaena*).

### US-BES-02 · Exemplar anlegen · 🟨 (Prototyp ✅)
Als **Pflanzenhalter** will ich ein Exemplar mit wenigen Angaben anlegen.

Akzeptanzkriterien:
- Pflicht: Art. Vorbelegt: Name nach Namensregel (DM-BES-03), Standort nach der heutigen Phase (siehe `US-PHA-01`), `Gefangen_Am` = heutiges **lokales** Datum, leere Messreihe und Behandlungsliste.
- Standort = Soll-Standort der Wachstumsphase, außer heute liegt in der Ruhephase und ein Ruhestandort existiert.
- Der Name steht vor dem Speichern fest. Existiert er schon, wird nichts verändert und die Namensregel wird angewendet (US-BES-03).

Stand der Umsetzung: Anlegen mit Art, Namen nach Namensregel, lokalem `Gefangen_Am`, optionalem Kennzeichen und gewähltem Standort; Messreihe und Behandlungsliste sind leer abgeleitet. **Offen:** Der Soll-Standort der Phase kommt über den Port `SollStandortQuelle`, den `pflege` (PHA, US-PHA-01) und das Pflegeprofil (US-BES-09) erst umsetzen. Bis dahin ist der Standort „unbekannt“, solange der Halter keinen wählt (P-08). Die Kennzeichen-Regeln ab dem dritten Exemplar (US-BES-03) fehlen.

### US-BES-03 · Mehrere Exemplare einer Art unterscheiden · ⬜ (Prototyp ✅)
Als **Pflanzenhalter** will ich mehrere Töpfe derselben Art unterscheiden, damit jedes Exemplar eine eigene Historie hat.

Akzeptanzkriterien (Namensregel DM-BES-03):
- 1. Exemplar: Name = Art, kein Kennzeichen.
- 2. Exemplar: das neue erhält ein Kennzeichen (Voreinstellung „Klammer", frei wählbar).
- Ab dem 3.: jedes Exemplar hat ein eigenes Kennzeichen (im Prototyp eine Farbe). Die App fragt nach den fehlenden Kennzeichen, bevor sie speichert.
- Kennzeichen sind je Art eindeutig (Groß-/Kleinschreibung egal); doppelt oder leer ist ein Fehler ohne Änderung.
- Anders als im Prototyp ist der Name keine Datei: Umbenennen ändert keine Verweise.

### US-BES-04 · Steckling anlegen und eintopfen · ⬜ (Prototyp ✅)
Als **Pflanzenhalter** will ich einen Steckling getrennt führen, damit er unter Stecklingslicht steht und nicht im Phasen-Tracker oder der Lichtverteilung erscheint.

Akzeptanzkriterien:
- „Steckling" setzt `Status: Steckling` und die Lichtzone Stecklingslicht (Lampe 1 der Voreinstellung); Standort ist der Standort der Wachstumsphase, auch in der Ruhephase.
- Phasen-Tracker und Lichtverteilung (Lampen 2–4) schließen Stecklinge aus.
- „Eingetopft" ist eine Aktion: Sie setzt `Status: Pflanze`, entfernt den Lichtzonen-Override, und ab da gilt die Lichtzone der Art. Ein Ereignis „Eingetopft" geht in den Feed, wenn das Exemplar geteilt ist.
- Die Art behält ihr Zielprofil (Ziel-Lichtzone, `Licht_Lux_Bedarf`).

### US-BES-05 · Arten nach Schwierigkeit vergleichen · ⬜ (Prototyp ✅)
Als **Pflanzenhalter** will ich eine Tabelle mit einer Zeile je Art, damit ich Pflegeregeln nachschlage, ohne jede Art zu öffnen.

Akzeptanzkriterien:
- Spalten: Art, botanischer Name, Lichtzone, Gießregel, Substrat, Rückschnitt, Erfolgskriterien, Schwierigkeit.
- Nur Arten mit mindestens einem aktiven Exemplar. Sortiert nach `Schwierigkeit` (Zahl 1–3, Anzeige Einfach/Medium/Schwer).

### US-BES-06 · Exemplare als Karten sehen · ⬜ (Prototyp ✅)
Als **Pflanzenhalter** will ich jedes Exemplar als Karte sehen, damit ich Zustand und Handlungsbedarf auf einen Blick erfasse.

Akzeptanzkriterien:
- Karte: Foto der jüngsten Messung mit Foto (sonst Platzhalter), Name, Art, Lichtzone, Status, Standort, letzte Messung mit Qualität und Datum oder „noch keine Messung".
- Offene Behandlung: Grund, Fälligkeit (überfällig seit N Tg. / heute / in N Tg.), bei mehreren „+N weitere".
- Notiz der letzten Messung einklappbar. Klick auf das Foto öffnet es groß.
- Raster passt sich der Bildschirmbreite an (Handy: eine bis zwei Spalten).

### US-BES-07 · Eingegangene oder abgegebene Pflanze archivieren · ⬜ (Prototyp ✅)
Als **Pflanzenhalter** will ich ein Exemplar aus den Auswertungen nehmen, ohne seine Historie zu verlieren.

Akzeptanzkriterien:
- „Archivieren" mit Grund (`eingegangen`, `abgegeben`, `getauscht`, `verschenkt`, `verkauft`, frei) setzt `Status: Archiviert`, `Archiviert_Am` und `Archiviert_Grund`.
- Archivierte Exemplare fehlen in Verteilung, Phasen, Wachstum, Behandlungen, Pokédex-Besitz und Heute-Liste, bleiben aber mit Historie einsehbar und lassen sich wiederherstellen.
- Bei Tausch erfolgt die Archivierung automatisch (US-SOZ-11).

### US-BES-08 · Unvollständige Daten erkennen · ⬜ (Prototyp 🟡)
Als **Pflanzenhalter** will ich merken, wenn ein Exemplar so unvollständig ist, dass es aus Auswertungen fällt (P-10).

Akzeptanzkriterien:
- Ein Exemplar ohne Art, ohne Standort oder mit einem Standort ohne Lichtzone erscheint in „Hinweise" mit der Aktion, die es behebt.
- Keine Auswertung blendet es stillschweigend aus; es wird mit Vermerk gezählt oder getrennt aufgeführt.

### US-BES-09 · Eigenes Pflegeprofil je Art anpassen · ⬜ neu
Als **Pflanzenhalter** will ich von den Katalog-Standardwerten abweichen, wo mein Standort oder mein Klima es verlangt, ohne den Katalog zu ändern.

Akzeptanzkriterien:
- Je Art mit aktivem Exemplar (oder Wunsch) zeigt die App den Katalogwert und meine Abweichung nebeneinander. Geändert werden können nur überschreibbare Felder (FR-BES-09).
- Soll-Standort je Phase wird aus meinen Standorten **ausgewählt**, nie frei getippt (FR-PHA-03). Die Lichtzone ist aus dem Lux-Bedarf abgeleitet (FR-BES-10) und lässt sich auf eine meiner Zonen überschreiben. Ruhephase von/bis ist überschreibbar (z. B. Außenstandort). Gießintervalle je Phase siehe US-MON-05.
- „Auf Katalog zurücksetzen" je Feld. Ohne Abweichung gilt der Katalog; ein leeres Pflegeprofil ist gültig.
- Das Pflegeprofil ist privat (P-05) und nie Teil einer Freigabe (US-SOZ-04).
- Ändert der Katalog einen Wert, den ich nicht überschrieben habe, sehe ich einen Hinweis (FR-BES-12).

### US-BES-10 · Katalogvorschläge prüfen und freigeben · ⬜ neu
Als **Betreiber (Prüfer)** will ich Vorschläge prüfen, bevor sie für alle gelten.

Akzeptanzkriterien:
- Prüfliste mit Nutzer-Vorschlägen (KI-Erstellung markiert) und Betreiber-Batches; je Eintrag Pflichtfelder, Quellen und Dublettenhinweis.
- Aktionen: **freigeben** (Status `geprüft`), **zurückweisen** mit Grund (der Ersteller sieht den Grund, der Vorschlag bleibt für ihn privat und bearbeitbar), **mit bestehender Art zusammenführen** (Exemplare, Wünsche und Pflegeprofile des Erstellers werden auf die vorhandene Art umgehängt; nichts geht still verloren, P-10).
- Freigabe nur bei vollständigen Pflichtfeldern (FR-BES-05) und mit Quelle für Lichtbedarf und Ruhephase. Eine KI-Verbindung kann nie freigeben (FR-BES-06, FR-KI-09).
- Nach der Freigabe steht die Art allen zur Verfügung, zählt beim Ersteller im Pokédex (US-POK-06) und löst den Taxonomie-Aufbau aus (US-POK-03).
- Der Ersteller erfährt das Ergebnis als Hinweis in der App. Der Betreiber sieht Zahl und Alter der offenen Vorschläge; die Abarbeitung ist eine wöchentliche Routine (US-DEV-03).

## Datenmodell

### DM-BES-01 Art (Katalog)

| Feld | Typ | Bedeutung |
|---|---|---|
| Lateinischer Name | Text | Gattung + Epitheton, optional Sorte; Normalform „Gattung epitheton" |
| Deutscher Name, englischer Name | Text | |
| Synonyme | Liste | frühere oder abweichende Namen; Suche und Import finden die Art darüber, die technische Kennung bleibt gleich |
| Familie (deutsch, lateinisch) | Text | |
| Schwierigkeit | Zahl 1–3 | 1 Einfach, 2 Medium, 3 Schwer (löst B-05) |
| Standard-Stufe | Zahl 2–4 | Stufe der Voreinstellung; Stufe 1 nie für Erwachsene. Die Zone des Kontos wird daraus und aus dem Lichtbedarf **abgeleitet** (FR-BES-10), nicht verlinkt, weil Zonen Daten des Kontos sind (US-LIC-05) |
| Lichtbedarf (Lux) | Zahl | Bedarf für maximales Wachstum |
| Ruhephase von/bis | Monat-Tag | darf über den Jahreswechsel gehen |
| Standort Wachstum/Ruhe (Hinweis) | Text | Empfehlung (z. B. „Fensterbank kühl"); der Halter ordnet eigene Standorte zu |
| Wachstumsmaß | Aufzählung/Text | genau eine Messdimension (Höhe, Rosettendurchmesser, Trieblänge) |
| Vergeilung-Anzeichen | Text | artspezifische Symptome von Lichtmangel |
| Gießhinweis, Substrat, Rückschnitt, Wuchs-Hacks | Text | je ein Satz |
| Erfolgskriterien | Text | beobachtbare Zeichen optimaler Pflege |
| Botanische Story | Text | Familie, Herkunft, Besonderheiten |
| Prüfstatus | Aufzählung | `kuratiert`, `geprüft`, `KI-erstellt, ungeprüft` (Betreiber-Batch, für alle sichtbar, gekennzeichnet) und `Vorschlag` (Nutzer-Vorschlag, nur für den Ersteller sichtbar, FR-BES-11) |
| Erstellt von | Aufzählung | `Betreiber`, `Prüfer`, `Nutzer`; bei KI-Erstellung zusätzlich die Verbindung (KI-R5) |
| Version | Zahl, Historie | jede Änderung erzeugt eine Version (FR-BES-12) |
| Quelle | Text/Link | Herkunft der Angaben |
| Bild, Bildquelle, Lizenz | | Wikipedia/Commons mit Lizenz |
| Merkmale (optional) | | Luftfeuchte, Temperatur min., Wuchsgröße, Giftig für Haustiere, je mit Quelle; für Entdecken (DM-ENT-01) |

### DM-BES-02 Exemplar

| Feld | Pflicht | Bedeutung |
|---|---|---|
| Besitzer | ja | Konto |
| Art | ja | Verweis in den Katalog |
| Name | ja | abgeleitet nach DM-BES-03, nicht von Hand |
| Kennzeichen | bei >1 Exemplar | siehe US-BES-03 |
| Zusatz | nein | `var.`, `subsp.`, `f.` oder Sorte (US-POK-06, Chip auf der Karte); gehört nicht in den Art-Namen |
| Standort | ja | Verweis auf Standort des Halters (US-LIC-05) |
| Lichtzone (Override) | nein | überschreibt die Artzone (Steckling) |
| Status | ja | `Pflanze`, `Steckling`, `Archiviert` |
| Gefangen_Am | nein | Datum; fehlt es, gilt Anlagedatum als „≈" (US-POK-07) |
| Herkunft | nein | `{Von, Tausch, Datum}` (US-SOZ-11) |
| Teilen, Teilen_Fotos | nein | Freigabe (US-SOZ-04) |

Regel: Das Exemplar hat Vorrang vor dem Pflegeprofil, dieses vor dem Katalog (FR-BES-09).

### DM-BES-03 Namensregel

1 Exemplar: `Art` · 2 Exemplare: `Art` und `Art – Kennzeichen` · ab 3: jedes `Art – Kennzeichen`. Trennzeichen ist ein Gedankenstrich mit Leerzeichen. Der Name ist Anzeigetext; die Identität des Exemplars ist eine technische Kennung.

### DM-BES-04 Pflegeprofil (Konto × Art)

Kontoeigene Abweichungen von den Katalogwerten einer Art. Privat, nie Teil einer Freigabe.

| Feld | Bedeutung |
|---|---|
| Konto, Art | Schlüssel; ein Profil je Konto und Art |
| Soll-Standort Wachstum / Ruhe | Verweis auf Standorte des Kontos (FR-PHA-02) |
| Lichtzone (Override) | Verweis auf eine Zone des Kontos; ohne Eintrag gilt die abgeleitete Zone (FR-BES-10) |
| Ruhephase von/bis (Override) | Monat-Tag, darf über den Jahreswechsel gehen |
| Gießintervall Wachstum / Ruhe | Tage (US-MON-05); Startwert aus dem Gießhinweis des Katalogs |
| Eigene Hinweise | Freitext, privat (Substrat, Rückschnitt, Gießen) |

## Anforderungen

| ID | Anforderung | Status |
|---|---|---|
| FR-BES-01 | Art (Wissen) und Exemplar (Topf) sind getrennte Entitäten; Exemplare tragen nur individuelle Felder. | 🟨 |
| FR-BES-02 | Der Artenkatalog ist gemeinsam; Änderungen daran sind Betreiber- oder Prüf-Aktionen, Nutzer können Vorschläge machen (E-02). | 🟨 |
| FR-BES-03 | Namenskonflikte werden vor jeder Änderung geprüft, es entsteht kein Teilzustand. | 🟨 |
| FR-BES-04 | `Gefangen_Am` wird mit dem lokalen Datum des Nutzers belegt (NFR-08). | ✅ |
| FR-BES-05 | Ein Artprofil verlangt vollständige Pflichtfelder (DM-BES-01) einschließlich Wachstumsmaß, Vergeilung-Anzeichen und Erfolgskriterien. Die Lichtzone folgt dem Sättigungspunkt, nicht dem Überleben (US-LIC-01). | 🟨 |
| FR-BES-06 | Ein KI-erstelltes Profil ist als solches gekennzeichnet, bis ein Mensch es geprüft hat. Die KI darf kein Profil als `geprüft` markieren (US-KI-03). | ⬜ |
| FR-BES-07 | Eine Wachstumsmaß-Dimension je Art ist fix und erscheint als Eingabe im Messformular. | ⬜ |
| FR-BES-08 | Art-Sicht (Katalog, Lichtübersicht) und Exemplar-Sicht (Phasen, Wachstum, Behandlungen, Karten) bleiben getrennt benannt. | ⬜ |
| FR-BES-09 | **Drei Schichten:** Katalog-Art (gemeinsam, nur Prüfer ändern), Pflegeprofil (Konto × Art, DM-BES-04), Exemplar. Es gilt Exemplar vor Pflegeprofil vor Katalog. **Nur im Katalog änderbar:** Namen, Taxonomie, Wachstumsmaß, Vergeilung-Anzeichen, Erfolgskriterien, Story, Bild, Merkmale, Schwierigkeit. **Im Pflegeprofil überschreibbar:** Soll-Standorte, Lichtzone, Ruhephase, Gießintervalle, eigene Hinweise. | ⬜ |
| FR-BES-10 | **Zone ableiten statt verlinken:** Der Katalog trägt Lux-Bedarf und Standard-Stufe. Die Zone des Kontos folgt aus dem Lux-Bedarf und den Zonen des Kontos nach der Regel aus US-LIC-01 (80-%- und 30-%-Grenzen) und ist als reine Logik mit Tests umgesetzt. Ein Override im Pflegeprofil hat Vorrang. | ⬜ |
| FR-BES-11 | **Sichtbarkeit:** Nutzer-Vorschläge (`Vorschlag`) sind nur für den Ersteller sichtbar, bis ein Prüfer sie freigibt (US-BES-10). Betreiber-Batches sind sofort sichtbar und gekennzeichnet. Exemplare einer noch privaten Art lassen sich nicht teilen (US-SOZ-04) und zählen nicht im Pokédex. Bei Freigabe oder Zusammenführung werden Verweise umgehängt, nichts geht verloren. | 🟨 |
| FR-BES-12 | **Änderungen am Katalog** sind versioniert. Ändert sich ein wirkungsrelevantes Feld (Ruhephase, Lux-Bedarf, Standard-Stufe), erhalten Halter, die den Wert nicht überschrieben haben, einen Hinweis (P-10). | ⬜ |
| FR-BES-13 | **Wachstumsmaß gesperrt:** Sobald ein Konto eine Messung zur Art hat, ist das Wachstumsmaß nicht mehr änderbar. Eine Änderung ist nur durch den Betreiber mit Umrechnung der Messreihen möglich (FR-BES-07). | ⬜ |
| FR-BES-14 | **Prüfung:** `geprüft` setzt vollständige Pflichtfelder (FR-BES-05) und Quellen für Lichtbedarf und Ruhephase voraus. Prüfer ist zunächst der Betreiber; weitere Prüfer sind eine Rolle (TE-08). Beiträge von Nutzern zum Katalog brauchen eine Rechteeinräumung in den Nutzungsbedingungen (E-12). | ⬜ |
