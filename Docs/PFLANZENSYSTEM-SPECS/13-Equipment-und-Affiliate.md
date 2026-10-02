# 13 – Epic EQU: Equipment und Empfehlungen (geplant)

**Status des gesamten Epics: ⬜ nicht umgesetzt.** Im Vault gibt es keine Equipment-Notizen und keine Felder dazu. Lampen existieren heute nur als vier **Stufen-Strings** (DM-05), nicht als konkrete Geräte. Einziges Artefakt in der Nähe: das Sparziel `02-Areas/Finanzen/Sparziele/Pflanzen-Sensorik-Set.md` (siehe `08-Monitoring-Sensorik.md`).

Ziel: Der Halter erfasst sein Pflanzen-Equipment (Lampen, Zeitschaltuhren, Sensoren, Substrat, Dünger, Töpfe, …) als strukturierte Daten. Das hat zwei Wirkungen:

1. **Nutzen für den Halter:** Die Lichtstufen werden an echte Geräte gebunden, Lücken und Wartung werden sichtbar, Käufe landen ohne Handarbeit im Bestand.
2. **Grundlage für Empfehlungen:** Weil das System weiß, was vorhanden ist und was fehlt, kann es später **passende, gekennzeichnete Affiliate-Empfehlungen** anzeigen (Stufe 2 in `12-Business-Case.md`). Die Empfehlung ist ein Nebenprodukt eines echten Bedarfs, nicht der Zweck des Trackings.

Quellen: keine im Ist-Zustand. Abgeleitet aus dem Auftrag vom 2026-10-02 und den bestehenden Epics LIC (Stufen), BEH (`Mittel`), WUN (Kaufkandidaten), MON (Sensorik), SOZ (Teilen) sowie `12-Business-Case.md` (Einnahmequellen).

## Problem

1. **Lampen sind abstrakt:** DM-05 kennt vier Strings, aber nicht, *welche* Lampe das ist, wie alt sie ist oder ob sie die versprochenen Lux wirklich liefert (FR-LIC-06 ist offen).
2. **Kein Bestand an Zubehör:** Substrat, Dünger, Mittel aus `Behandlungen.Mittel`, Zeitschaltuhr, Sensoren sind nirgends erfasst. „Was fehlt, was muss nachgekauft werden?" beantwortet nur das Gedächtnis.
3. **Bedarf und Anschaffung hängen nicht zusammen:** Die Wunschliste kennt Pflanzen-Kandidaten mit `Ziel_Lampe`, aber nicht, ob für diese Stufe überhaupt Kapazität (Lampe, Fläche) da ist (vgl. B-09).
4. **Keine ehrliche Empfehlungsbasis:** Ohne Bestandsdaten wären Produktlinks beliebige Werbung. Mit ihnen lassen sich Empfehlungen auf echten Bedarf stützen.

## Begriffe

| Begriff | Bedeutung |
|---|---|
| Equipment | Alles Gegenständliche zur Pflanzenpflege, **außer** den Pflanzen selbst. Ein Datensatz je Gerät bzw. je Verbrauchsmaterial-Sorte. |
| Gerät | Equipment mit Lebensdauer und Betrieb (Lampe, Zeitschaltuhr, Sensor, Lüfter, Pumpe). |
| Verbrauchsmaterial | Equipment, das aufgebraucht wird (Substrat, Dünger, Pflanzenmittel). Hat Vorrat statt Betriebsdaten. |
| Lampengerät | Gerät vom Typ `Lampe`, das genau einer Lampenstufe (DM-05) zugeordnet ist. |
| Produktkennung | Herstellerneutrale Identifikation eines Produkts (Hersteller, Modell, optional GTIN/EAN). Gehört in den Datensatz, die **Affiliate-URL nicht**. |
| Empfehlung | Vom System angezeigter Produktvorschlag mit Begründung aus eigenen Daten. |
| Affiliate-Link | Gekennzeichneter Produktlink, der bei Kauf eine Provision erzeugt. Wird erst zur Anzeige erzeugt, nie im Vault gespeichert. |

## Userstories

### US-EQU-01 · Equipment erfassen · ⬜
Als **Pflanzenhalter** will ich ein Gerät oder Verbrauchsmaterial anlegen, ohne YAML zu schreiben.

Akzeptanzkriterien:
- Dashboard-Formular bzw. Claude-Eingabe („Ich habe eine neue Lampe …") legt eine Equipment-Notiz an (DM-E1) und schreibt über `processFrontMatter` (NFR-02).
- Pflicht: `Typ`, `Bezeichnung`. Alles Weitere (Hersteller, Modell, Preis, Kaufdatum, Produktkennung) ist optional; fehlende Angaben erscheinen als „unbekannt", nie als geraten (NFR-05).
- Gleiche Bezeichnung wird abgelehnt, wenn sie bereits vergeben ist (Namensregel analog DM-03: bei Mehrfachen ` – <Unterscheidung>`).
- Aus einem Foto oder Produktlink darf Claude Felder **vorschlagen**; der Halter bestätigt vor dem Schreiben.

### US-EQU-02 · Lampen an Stufen binden · ⬜
Als **Pflanzenhalter** will ich meine konkreten Lampen den vier Stufen (DM-05) zuordnen, damit die Stufen etwas Reales bedeuten.

Akzeptanzkriterien:
- Ein Lampengerät trägt `Lampe_Stufe` mit **genau einem** der vier Strings aus DM-05 (zeichengleich, B-07).
- `Lampen-Zuordnung.md` zeigt je Stufe die zugeordneten Geräte und deren Zustand (`aktiv`, `defekt`, `ausgemustert`).
- ⚠️ Warnung, wenn eine Stufe 2–4 Exemplare hat, aber **kein aktives Lampengerät** (NFR-06, kein stilles Verschwinden).
- ⚠️ Warnung, wenn ein aktives Lampengerät einer Stufe zugeordnet ist, der kein Exemplar zugeordnet ist (Hinweis auf ungenutzte Kapazität, kein Fehler).
- Die Verteilung der Exemplare (US-LIC-02) bleibt unverändert; Equipment erweitert sie nur um die Geräteliste.

### US-EQU-03 · Gemessene Lichtstärke je Lampe festhalten · ⬜
Als **Pflanzenhalter** will ich die real gemessene Lichtstärke je Lampe notieren, damit die Stufen auf Messwerten statt Herstellerangaben beruhen.

Akzeptanzkriterien:
- Das Lampengerät führt ein Messlog `Messungen` mit `{Datum, Lux, Abstand_cm, Methode}`; ein Eintrag ist Pflicht für „gemessen".
- Die Anzeige trennt **Herstellerangabe** (`Lux_Angabe`) und **gemessen** (letzte Messung mit Datum). Fehlt die Messung, steht „nicht gemessen".
- Weicht die letzte Messung um mehr als einen konfigurierbaren Anteil von der Stufen-Decke ab (Standard offen, **vom Halter festzulegen**), erscheint ⚠️ „Stufe prüfen".
- Erfüllt und ersetzt FR-LIC-06 (einmalige Prüfung per Handy-App), sofern dort erfasst.

### US-EQU-04 · Betrieb und Wartung im Blick · ⬜
Als **Pflanzenhalter** will ich wissen, wann ein Gerät Aufmerksamkeit braucht, ohne dass ich daran denken muss.

Akzeptanzkriterien:
- Ein Gerät hat optional `In_Betrieb_Seit` und `Pruefintervall_Tage` (vom Halter gesetzt).
- Ist `Pruefintervall_Tage` gesetzt und die letzte Prüfung (bei Lampen: letzte Messung, US-EQU-03) älter, erscheint ⚠️ „Prüfung fällig: <Gerät>" im Dashboard und, falls vorhanden, als Bot-Meldung (US-MON-01).
- Das System nennt **keine** Lebensdauer- oder Verschleißwerte, die nicht im Datensatz stehen. Herstellerangaben dürfen nur als `Lebensdauer_Angabe` mit `Quelle` hinterlegt werden.
- Ohne gesetztes Intervall gibt es keine Fälligkeit (nichts erfinden).

### US-EQU-05 · Verbrauchsmaterial und Vorrat · ⬜
Als **Pflanzenhalter** will ich Substrat, Dünger und Pflanzenmittel führen, damit ich weiß, was da ist und was nachzukaufen ist.

Akzeptanzkriterien:
- Verbrauchsmaterial hat `Typ` (`Substrat` | `Duenger` | `Pflanzenmittel` | `Sonstiges`) und `Vorrat` (`vorhanden` | `knapp` | `leer`).
- Button „Vorrat ändern" setzt den Zustand per `processFrontMatter`. `knapp`/`leer` erzeugt einen Eintrag in „🛒 Nachkaufen" (US-EQU-07).
- Ein Pflanzenmittel kann mit `Behandlungen.Mittel` (DM-02) verknüpft werden; fehlt die Verknüpfung, bleibt der Freitext in `Mittel` unverändert (keine stille Umdeutung).
- `Substrat_Kurz` der Art (DM-01) bleibt Freitext; eine optionale Verknüpfung auf ein Verbrauchsmaterial ist erlaubt, aber nicht Pflicht.

### US-EQU-06 · Sensoren und Zubehör zuordnen · ⬜
Als **Pflanzenhalter** will ich Sensoren und Steuerungen (Zeitschaltuhr, Bodenfeuchte, Temperatur) erfassen und zuordnen.

Akzeptanzkriterien:
- Sensoren sind Geräte (`Typ: Sensor`) mit optionalem Verweis auf ein Exemplar oder einen Bereich (`Standort`, Freitext wie in `Standort_Aktuell`).
- Das Sparziel „Pflanzen-Sensorik-Set" kann beim Kauf in Equipment übergehen (US-EQU-08).
- Rohsensorwerte kommen **nicht** in den Vault (NFR-MON-01); Equipment hält nur Stammdaten des Sensors.

### US-EQU-07 · Was fehlt? Bedarf aus eigenen Daten ableiten · ⬜
Als **Pflanzenhalter** will ich eine Liste, was mir fehlt oder bald fehlt, abgeleitet aus meinem Bestand.

Akzeptanzkriterien:
- Block „🛒 Fehlt / Nachkaufen" zeigt abgeleitete Punkte, jeweils mit Grund und Quelle:
  1. Verbrauchsmaterial `knapp`/`leer` (US-EQU-05).
  2. Stufe ohne aktives Lampengerät (US-EQU-02).
  3. Wunschlisten-Kandidat mit `Ziel_Lampe`, für die kein aktives Lampengerät existiert.
  4. Gerät `defekt` oder `ausgemustert` ohne Ersatz.
- Jeder Punkt nennt, was zu tun ist (NFR-07), und enthält **keine** erfundene Dringlichkeit.
- Die Liste ist rein berechnet (NFR-04); es gibt keine zweite Kopie.

### US-EQU-08 · Kauf übernehmen · ⬜
Als **Pflanzenhalter** will ich, dass ein gekauftes Produkt ohne Abtippen im Bestand landet.

Akzeptanzkriterien:
- Die Wunschliste (WUN) kennt zusätzlich Kandidaten vom Typ Equipment; „Gekauft ✔" öffnet das Anlegen-Formular (US-EQU-01) mit vorbefüllten Feldern (Bezeichnung, Produktkennung, Typ).
- Preis und Kaufdatum gehen, falls gesetzt, an die Finanzen (`finanz-core.js`); fehlen sie, wird nichts erfunden.
- Pflanzen-Kandidaten und Equipment-Kandidaten bleiben getrennt gezählt; der Puffer-Check (FR-WUN) zählt nur Pflanzen.
- Schließt für Equipment die Lücke, die B-09 für Pflanzen beschreibt (Kette Kauf → Bestand).

### US-EQU-09 · Kosten sehen · ⬜
Als **Pflanzenhalter** will ich wissen, was mein Equipment gekostet hat.

Akzeptanzkriterien:
- Summe der Anschaffungskosten je Typ und gesamt, **nur** über Geräte mit gesetztem `Preis_EUR`.
- Die Anzeige nennt, bei wie vielen Geräten der Preis fehlt („Summe über 7 von 11 Geräten"), statt zu schätzen.
- Keine Schätzung von Stromkosten oder Wiederbeschaffungswerten ohne Eingabe des Halters.

### US-EQU-10 · Passende Empfehlungen sehen · ⬜
Als **Pflanzenhalter** will ich bei echtem Bedarf einen Produktvorschlag sehen, damit ich nicht selbst suchen muss.

Akzeptanzkriterien:
- Empfehlungen erscheinen **nur im Kontext eines abgeleiteten Bedarfs** (US-EQU-07), nicht als eigener Werbeblock und nicht auf Pflanzen- oder Pokédex-Karten.
- Jede Empfehlung nennt: Produkt (Produktkennung), **Begründung aus eigenen Daten** („Lampe 3 hat kein aktives Gerät, 4 Exemplare brauchen sie"), Quelle der Produktdaten und Stand.
- Jeder Affiliate-Link ist **sichtbar gekennzeichnet** (z. B. „Werbung · Affiliate-Link") direkt am Link, nicht nur im Impressum.
- Preise werden nur angezeigt, wenn sie aus einer Quelle mit Abrufdatum stammen („Stand TT.MM.JJJJ"); sonst keine Preisangabe.
- Es gibt immer auch einen nicht provisionierten Weg: Produktname und Hersteller werden angezeigt, der Halter kann anderswo kaufen.
- Die **Reihenfolge** der Vorschläge folgt dem Bedarf (Passung zu Stufe, Lux, Fläche), **nicht** der Provision (FR-EQU-06).

### US-EQU-11 · Empfehlungen steuern und verstehen · ⬜
Als **Pflanzenhalter** will ich Empfehlungen abschalten und nachvollziehen können.

Akzeptanzkriterien:
- Globale Option „Keine Empfehlungen" blendet alle Affiliate-Links aus. Equipment-Tracking und alle abgeleiteten Listen funktionieren unverändert (FR-EQU-01).
- Je Empfehlung „Warum sehe ich das?" (die auslösende Datenlage) und „Nicht mehr zeigen" (pro Bedarf oder pro Produkt).
- Die Seite „Was wird gemessen?" nennt, welche Daten für Empfehlungen und Klickzählung verwendet werden (FR-EQU-08).
- Der Halter kann seine Empfehlungs-Daten (Ausblendungen, Einwilligungen) löschen, ohne Equipment zu verlieren.

### US-EQU-12 · Equipment mit Freunden teilen (optional) · ⬜
Als **Pflanzenhalter** will ich Freunden zeigen, welche Lampe oder welches Zubehör ich nutze, und deren sehen.

Akzeptanzkriterien:
- Neues Feld `Teilen` (wie DM-S1): `privat` (Standard) oder `freunde`.
- Geteilt werden höchstens Typ, Bezeichnung/Modell, Lampenstufe und ein Freitext-Erfahrungsvermerk. **Nie** geteilt werden Preis, Kaufort, Seriennummer, Standort und Kaufdatum.
- Ein geteiltes Gerät erscheint nicht im Feed „Neu bei Freunden" (US-SOZ-05), nur in einer Geräteliste des Freundes (US-SOZ-07).
- Teilen löst **keine** Empfehlung für andere aus; ein Freund wird nie zum Absatzkanal des Halters (FR-EQU-07).

## Datenmodell

### DM-E1 Equipment-Notiz (`02-Areas/Pflanzen/Equipment/<Bezeichnung>.md`)

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `Typ` | ja | `Lampe` \| `Zeitschaltuhr` \| `Sensor` \| `Lueftung` \| `Pumpe` \| `Topf` \| `Substrat` \| `Duenger` \| `Pflanzenmittel` \| `Sonstiges` |
| `Bezeichnung` | ja | Anzeigename, eindeutig |
| `Status` | ja | `aktiv` \| `defekt` \| `ausgemustert` (bei Verbrauchsmaterial: nicht verwendet) |
| `Hersteller`, `Modell` | nein | Freitext |
| `Produktkennung` | nein | GTIN/EAN oder Hersteller + Modell; Basis für Empfehlungen, **keine URL** |
| `Preis_EUR` | nein | Zahl, Anschaffungspreis |
| `Gekauft_Am` | nein | `YYYY-MM-DD` |
| `In_Betrieb_Seit` | nein | `YYYY-MM-DD` (Geräte) |
| `Pruefintervall_Tage` | nein | Zahl (Geräte) |
| `Standort` | nein | Freitext (Schrank, Regal) |
| `Teilen` | nein | `privat` (Standard) oder `freunde` (US-EQU-12) |
| `Notiz` | nein | Freitext |

Der Notiz-Body trägt Freitext (Bedienung, Erfahrung); Logik steht nur im Frontmatter (NFR-01).

### DM-E2 Lampengerät (Erweiterung DM-E1, `Typ: Lampe`)

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `Lampe_Stufe` | ja | einer der vier Strings aus DM-05, zeichengleich |
| `Leistung_W` | nein | Zahl, Herstellerangabe |
| `Lux_Angabe` | nein | Zahl, Herstellerangabe |
| `Lebensdauer_Angabe` | nein | `{Wert, Quelle}`, nur mit Quelle |
| `Messungen` | nein | Array `{Datum, Lux, Abstand_cm, Methode}` |

### DM-E3 Verbrauchsmaterial (Erweiterung DM-E1)

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `Vorrat` | ja | `vorhanden` \| `knapp` \| `leer` |
| `Mittel_Verknuepfung` | nein | Text, der in `Behandlungen.Mittel` vorkommt (DM-02) |

### DM-E4 Empfehlungs-Konfiguration (nicht im Vault-Frontmatter der Pflanzen)

`Empfehlungen_Aktiv` (Standard `true`), `Ausgeblendet` (Liste von Bedarf-/Produktkennungen), `Einwilligung_Klickmessung` (Datum oder leer). Liegt in einer eigenen Konfigurationsdatei bzw. im Hub, nicht in Pflanzen-Notizen. Die **Partner-Konfiguration** (Partnerprogramme, Partner-IDs) gehört dem Betreiber des Systems und nie in Nutzer-Notizen (FR-EQU-04).

## Anforderungen

| ID | Anforderung | Status |
|---|---|---|
| FR-EQU-01 | **Equipment-Tracking ist unabhängig von Empfehlungen.** Alle Stories außer US-EQU-10/11 funktionieren vollständig ohne Affiliate-Anbindung, Netzzugriff und Hub. | ⬜ |
| FR-EQU-02 | Equipment-Daten liegen im Vault (Quelle der Wahrheit, FR-SOZ-02). Der Hub erhält sie nur, wenn der Halter sie teilt (US-EQU-12). | ⬜ |
| FR-EQU-03 | **Produktkennung statt URL:** Gespeichert wird, *was* das Produkt ist (Hersteller, Modell, GTIN). Affiliate-URLs entstehen erst zur Anzeige aus Produktkennung + Partner-Konfiguration. Wechselt das Partnerprogramm, ändert sich kein Datensatz. | ⬜ |
| FR-EQU-04 | **Partner-Konfiguration gehört dem Betreiber:** Partner-IDs werden nicht in Nutzer-Notizen gespeichert und nicht ungefragt exportiert. Link-Erzeugung liegt als reine Funktion in `core` (`empfehlung-core.js`, mit `node --test`, FR-SOZ-04-Muster). Wie die Partner-Konfiguration verteilt wird (mit dem Kern ausgeliefert oder vom Hub), ist offen. | ⬜ |
| FR-EQU-05 | **Kennzeichnungspflicht:** Jeder Affiliate-Link wird am Link als Werbung gekennzeichnet. Die Pflichten aus dem Partnerprogramm und dem geltenden Recht (DE/EU, u. a. Werbekennzeichnung und Datenschutz) sind **vor** Stufe 2 zu prüfen; dieses Dokument ersetzt keine Rechtsprüfung. | ⬜ |
| FR-EQU-06 | **Bedarf vor Provision:** Auswahl und Reihenfolge der Empfehlungen folgen der Passung zum Bedarf, nie der Provisionshöhe. Es werden nur Produkte empfohlen, die zum abgeleiteten Bedarf passen (Prinzip aus `12-Business-Case.md`: „nur zu Dingen, die die App ohnehin empfiehlt"). Test: Eine geänderte Provisionstabelle verändert die Reihenfolge nicht. | ⬜ |
| FR-EQU-07 | **Keine Empfehlungen in sensiblen Kontexten:** keine Affiliate-Links an Pflanzenmitteln gegen Schädlinge/Krankheiten (Zulassungs- und Gesundheitsfragen, FR-SOZ-09), keine in Freunde-Sichten, im Pokédex oder in Tauschangeboten. | ⬜ |
| FR-EQU-08 | **Datensparsamkeit:** Der Vault-Bestand (Pflanzen, Standorte, Logs, Fotos) wird nie an Partner übertragen. Klickmessung nur aggregiert und nur mit Einwilligung (`Einwilligung_Klickmessung`); ohne Einwilligung wird nicht gezählt. | ⬜ |
| FR-EQU-09 | **Keine erfundenen Produktdaten:** Produktnamen, Preise, Verfügbarkeit und Eigenschaften stammen aus einer zitierbaren Quelle mit Abrufdatum. Claude darf Produkte **recherchieren und vorschlagen**, schreibt sie aber erst nach Bestätigung des Halters und mit Quelle in die Daten (NFR-05, Muster der Wunschlisten-Recherche, WUN). | ⬜ |
| FR-EQU-10 | Der Betrieb darf **keine Funktion hinter Empfehlungen sperren**: Kein Kaufzwang, kein Dark Pattern, keine Einschränkung des Tracking bei „Keine Empfehlungen". Kernfunktionen bleiben frei (`12-Business-Case.md`). | ⬜ |
| FR-EQU-11 | Lampen-Strings (DM-05) werden in `Lampe_Stufe` **nicht** ein weiteres Mal hart kodiert, sondern aus der zentralen Definition gelesen (Ziel von B-07). Bis dahin zählt `Lampe_Stufe` zu den Stellen aus B-07. | ⬜ |
| FR-EQU-12 | Alle Änderungen laufen über `processFrontMatter`; abgeleitete Listen (US-EQU-07, -09) werden live berechnet und nicht gespeichert (NFR-02, NFR-04). | ⬜ |

## Abgrenzung

| Gehört nicht hierher | Stattdessen |
|---|---|
| Lampenstufen-Regeln, Positionsempfehlung | LIC (`02-Licht-und-Lampen.md`) |
| Sensorwerte, Gießlog, Bot | MON (`08-Monitoring-Sensorik.md`) |
| Pflanzen-Kaufkandidaten und Puffer | WUN (`06-Wunschliste.md`) |
| Geldflüsse, Budget, Sparziele | Finanzen im Vault (`finanz-core.js`) |
| Verkauf von Pflanzen, Marktplatz | bewusst ausgeschlossen (FR-SOZ-11), Stufe-3-Entscheidung im Business-Case |

## Offene Fragen

1. **Partnerprogramme:** Welche kommen infrage (Händler für Lampen und Substrat, Gartenfachhandel), welche Bedingungen gelten, welche Kennzeichnung und Datenschutzregeln folgen daraus?
2. **Verteilung der Partner-Konfiguration:** mit dem Kern ausgeliefert (einfach, aber statisch) oder vom Hub bezogen (flexibel, braucht Hub, E-SOZ-01)?
3. **Produktdatenquelle:** Herstellerangaben und Shop-APIs, manuelle Kuratierung oder Claude-Recherche mit Bestätigung? Bestimmt Aufwand und Verlässlichkeit der Preise.
4. **Schwelle für „Stufe prüfen"** (US-EQU-03): Wie weit darf die Messung von der Stufen-Decke abweichen, bevor eine Warnung kommt? Vom Halter festzulegen.
5. **Zeitpunkt:** Datenmodell und US-EQU-01 bis -09 schon in Stufe 1 (nützen den drei Nutzern direkt), Empfehlungen (US-EQU-10/11) erst in Stufe 2, wenn es Nutzer außerhalb des Freundeskreises gibt.
6. **Kleinunternehmer-/Steuerfragen** der Einnahmen sind kein Teil dieser Spec, gehören aber in die Vorbereitung von Stufe 2.
