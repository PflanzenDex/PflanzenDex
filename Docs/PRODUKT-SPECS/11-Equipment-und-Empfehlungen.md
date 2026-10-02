# 11 – Epic EQU: Equipment und Empfehlungen

Ziel: Der Halter erfasst sein Pflanzen-Equipment (Lampen, Zeitschaltuhren, Sensoren, Substrat, Dünger, Töpfe, …). Das bindet die Lichtzonen an echte Geräte, macht Lücken und Wartung sichtbar und ist die **ehrliche Grundlage für gekennzeichnete Affiliate-Empfehlungen** (Stufe 2 in `13-Business-Case.md`). Die Empfehlung ist Nebenprodukt eines echten Bedarfs, nicht der Zweck des Trackings.

Ablösung: ersetzt `../PFLANZENSYSTEM-SPECS/13-Equipment-und-Affiliate.md`. Wegfall: Equipment-Notizen im Vault, `processFrontMatter`, „Equipment im Vault ist Wahrheit" (FR-EQU-02). Inhaltlich gelten die Stories und die Regeln für Empfehlungen unverändert.

## Begriffe

| Begriff | Bedeutung |
|---|---|
| Equipment | Alles Gegenständliche zur Pflege außer den Pflanzen. Ein Datensatz je Gerät bzw. je Verbrauchsmaterial-Sorte. |
| Gerät | Equipment mit Lebensdauer und Betrieb (Lampe, Zeitschaltuhr, Sensor, Lüfter, Pumpe). |
| Verbrauchsmaterial | Wird aufgebraucht (Substrat, Dünger, Pflanzenmittel); hat Vorrat statt Betriebsdaten. |
| Lampengerät | Gerät vom Typ Lampe, einer Lichtzone zugeordnet (US-LIC-05). |
| Produktkennung | Herstellerneutral (Hersteller, Modell, optional GTIN/EAN). Gehört in den Datensatz, die Affiliate-URL nicht. |
| Empfehlung | Vom System angezeigter Produktvorschlag mit Begründung aus eigenen Daten. |
| Affiliate-Link | Gekennzeichneter Produktlink mit Provision; entsteht erst zur Anzeige. |

## Userstories

### US-EQU-01 · Equipment erfassen · ⬜ neu
Akzeptanzkriterien:
- Formular oder KI-Eingabe („Ich habe eine neue Lampe …") legt einen Datensatz an (DM-EQU-01).
- Pflicht: `Typ`, `Bezeichnung`. Alles weitere (Hersteller, Modell, Preis, Kaufdatum, Produktkennung) optional; Fehlendes erscheint als „unbekannt", nie geraten (P-08).
- Bezeichnung ist eindeutig; bei Mehrfachen ` – <Unterscheidung>`.
- Aus einem Foto oder Produktlink darf die KI Felder **vorschlagen**; der Halter bestätigt vor dem Speichern.

### US-EQU-02 · Lampen an Lichtzonen binden · ⬜ neu
Akzeptanzkriterien:
- Ein Lampengerät gehört genau einer Lichtzone (Auswahl, kein Text).
- Die Zonenansicht zeigt je Zone die zugeordneten Geräte und ihren Zustand (`aktiv`, `defekt`, `ausgemustert`).
- Warnung, wenn eine Zone 2–4 Exemplare hat, aber **kein aktives Lampengerät** (P-10).
- Hinweis (kein Fehler), wenn ein aktives Lampengerät keiner belegten Zone dient (ungenutzte Kapazität).
- Die Verteilung der Exemplare (US-LIC-02) bleibt unverändert; Equipment erweitert sie um die Geräteliste.

### US-EQU-03 · Gemessene Lichtstärke je Lampe festhalten · ⬜ neu
Akzeptanzkriterien:
- Messlog je Lampengerät: `{Datum, Lux, Abstand_cm, Methode}`; ein Eintrag macht „gemessen".
- Anzeige trennt **Herstellerangabe** und **gemessen** (letzte Messung mit Datum); ohne Messung „nicht gemessen".
- Weicht die letzte Messung um mehr als einen konfigurierbaren Anteil von der Zonen-Decke ab (Standard offen, **vom Halter festzulegen**), erscheint „Zone prüfen".
- Erfüllt FR-LIC-06.

### US-EQU-04 · Betrieb und Wartung im Blick · ⬜ neu
Akzeptanzkriterien:
- Optional `In_Betrieb_Seit` und `Pruefintervall_Tage` (vom Halter gesetzt).
- Ist ein Intervall gesetzt und die letzte Prüfung (bei Lampen: letzte Messung) älter, erscheint „Prüfung fällig: <Gerät>" in „Heute" und als Erinnerung (US-MON-01).
- Keine Lebensdauer- oder Verschleißwerte ohne Eintrag; Herstellerangaben nur als `Lebensdauer_Angabe` mit `Quelle`. Ohne Intervall keine Fälligkeit.

### US-EQU-05 · Verbrauchsmaterial und Vorrat · ⬜ neu
Akzeptanzkriterien:
- Verbrauchsmaterial hat `Typ` (`Substrat | Dünger | Pflanzenmittel | Sonstiges`) und `Vorrat` (`vorhanden | knapp | leer`); Änderung per Tipp.
- `knapp`/`leer` erzeugt einen Eintrag in „Nachkaufen" (US-EQU-07).
- Ein Pflanzenmittel kann mit `Behandlung.Mittel` verknüpft werden; ohne Verknüpfung bleibt der Freitext unverändert.
- `Substrat` der Art bleibt Freitext; optionale Verknüpfung mit einem Verbrauchsmaterial.

### US-EQU-06 · Sensoren und Zubehör zuordnen · ⬜ neu
Akzeptanzkriterien:
- Sensoren sind Geräte (`Typ: Sensor`) mit optionaler Zuordnung zu Exemplar oder Standort.
- Ein Sparziel „Sensorik-Set" kann beim Kauf in Equipment übergehen (US-EQU-08).
- Rohwerte sind nicht Teil von Equipment (FR-MON-07).

### US-EQU-07 · Was fehlt? Bedarf aus eigenen Daten ableiten · ⬜ neu
Akzeptanzkriterien:
- Block „Fehlt / Nachkaufen": abgeleitete Punkte, jeweils mit Grund und Quelle:
  1. Verbrauchsmaterial `knapp`/`leer`.
  2. Zone ohne aktives Lampengerät.
  3. Wunsch mit Ziel-Zone ohne aktives Lampengerät.
  4. Gerät `defekt`/`ausgemustert` ohne Ersatz.
- Jeder Punkt sagt, was zu tun ist (P-09), ohne erfundene Dringlichkeit. Rein berechnet (NFR-04).

### US-EQU-08 · Kauf übernehmen · ⬜ neu
Akzeptanzkriterien:
- Die Wunschliste kennt Wünsche vom Typ Equipment; „Gekauft" öffnet US-EQU-01 mit vorbefüllten Feldern (Bezeichnung, Produktkennung, Typ).
- Preis und Kaufdatum gehen, falls gesetzt, in die Kostenansicht (US-EQU-09); fehlen sie, wird nichts erfunden.
- Pflanzen- und Equipment-Wünsche werden getrennt gezählt; der Puffer-Check (US-WUN-02) zählt nur Pflanzen.

### US-EQU-09 · Kosten sehen · ⬜ neu
Akzeptanzkriterien:
- Summe der Anschaffungskosten je Typ und gesamt, **nur** über Geräte mit gesetztem Preis.
- Die Anzeige nennt, bei wie vielen Geräten der Preis fehlt („Summe über 7 von 11 Geräten").
- Keine Schätzung von Strom- oder Wiederbeschaffungskosten ohne Eingabe.

### US-EQU-10 · Passende Empfehlungen sehen · ⬜ neu
Akzeptanzkriterien:
- Empfehlungen erscheinen **nur im Kontext eines abgeleiteten Bedarfs** (US-EQU-07), nicht als eigener Werbeblock, nicht auf Pflanzen-, Pokédex- oder Tauschkarten.
- Jede Empfehlung nennt Produkt (Produktkennung), **Begründung aus eigenen Daten** („Lampe 3 hat kein aktives Gerät, 4 Exemplare brauchen sie"), Quelle der Produktdaten und Stand.
- Jeder Affiliate-Link ist **direkt am Link** als Werbung gekennzeichnet („Werbung · Affiliate-Link").
- Preise nur mit Quelle und Abrufdatum („Stand TT.MM.JJJJ"); sonst keine Preisangabe.
- Es gibt immer einen nicht provisionierten Weg: Produktname und Hersteller werden angezeigt, der Halter kann anderswo kaufen.
- Die **Reihenfolge** folgt der Passung zum Bedarf (Zone, Lux, Fläche), **nicht** der Provision (FR-EQU-06).

### US-EQU-11 · Empfehlungen steuern und verstehen · ⬜ neu
Akzeptanzkriterien:
- Globale Option „Keine Empfehlungen" blendet alle Affiliate-Links aus; Equipment-Tracking und abgeleitete Listen bleiben unverändert (FR-EQU-01).
- Je Empfehlung „Warum sehe ich das?" und „Nicht mehr zeigen" (pro Bedarf oder Produkt).
- Die Seite „Was wird gemessen?" nennt Daten für Empfehlungen und Klickzählung (FR-EQU-08).
- Der Halter kann seine Empfehlungsdaten (Ausblendungen, Einwilligungen) löschen, ohne Equipment zu verlieren.

### US-EQU-12 · Equipment mit Freunden teilen (optional) · ⬜ neu
Akzeptanzkriterien:
- Freigabe `privat` (Standard) oder `freunde` je Gerät.
- Geteilt werden höchstens Typ, Bezeichnung/Modell, Lichtzonen-Stufe und ein Freitext-Erfahrungsvermerk. **Nie** Preis, Kaufort, Seriennummer, Standort, Kaufdatum.
- Ein geteiltes Gerät erscheint nicht im Feed (US-SOZ-05), nur in der Geräteliste des Freundes (US-SOZ-07).
- Teilen löst **keine** Empfehlung für andere aus; ein Freund wird nie zum Absatzkanal des Halters (FR-EQU-07).

## Datenmodell

### DM-EQU-01 Equipment

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `Typ` | ja | `Lampe | Zeitschaltuhr | Sensor | Lüftung | Pumpe | Topf | Substrat | Dünger | Pflanzenmittel | Sonstiges` |
| `Bezeichnung` | ja | Anzeigename, eindeutig |
| `Status` | ja | `aktiv | defekt | ausgemustert` (bei Verbrauchsmaterial nicht verwendet) |
| `Hersteller`, `Modell` | nein | Freitext |
| `Produktkennung` | nein | GTIN/EAN oder Hersteller + Modell; **keine URL** |
| `Preis_EUR`, `Gekauft_Am`, `In_Betrieb_Seit`, `Pruefintervall_Tage` | nein | |
| `Standort` | nein | Verweis auf Standort (US-LIC-05) |
| `Teilen` | nein | `privat` (Standard) oder `freunde` |
| `Notiz` | nein | Freitext |

### DM-EQU-02 Lampengerät (Erweiterung)

`Lichtzone` (Pflicht), `Leistung_W`, `Lux_Angabe`, `Lebensdauer_Angabe` (`{Wert, Quelle}`), `Messungen` (`{Datum, Lux, Abstand_cm, Methode}`).

### DM-EQU-03 Verbrauchsmaterial (Erweiterung)

`Vorrat` (Pflicht), `Mittel_Verknüpfung` (Text, der in `Behandlung.Mittel` vorkommt).

### DM-EQU-04 Empfehlungs-Konfiguration

Je Konto: `Empfehlungen_Aktiv` (Standard `true`), `Ausgeblendet`, `Einwilligung_Klickmessung` (Datum oder leer). Die **Partner-Konfiguration** (Programme, Partner-IDs) gehört dem Betreiber und nie zu Nutzerdaten (FR-EQU-04).

## Anforderungen

| ID | Anforderung | Status |
|---|---|---|
| FR-EQU-01 | Equipment-Tracking ist unabhängig von Empfehlungen: Alle Stories außer US-EQU-10/11 funktionieren ohne Partneranbindung. | ⬜ |
| FR-EQU-02 | Equipment-Daten gehören dem Konto. Freunde sehen sie nur nach Freigabe (US-EQU-12). | ⬜ |
| FR-EQU-03 | **Produktkennung statt URL:** Gespeichert wird, *was* das Produkt ist. Affiliate-URLs entstehen erst zur Anzeige aus Produktkennung + Partner-Konfiguration. Ein Programmwechsel ändert keinen Datensatz. | ⬜ |
| FR-EQU-04 | Partner-IDs liegen beim Betreiber, nie in Nutzerdaten, nie im Export. Link-Erzeugung ist eine reine Funktion mit Tests. | ⬜ |
| FR-EQU-05 | **Kennzeichnungspflicht:** Jeder Affiliate-Link ist als Werbung gekennzeichnet. Pflichten aus Partnerprogramm und Recht (DE/EU: Werbekennzeichnung, Datenschutz) sind **vor** Stufe 2 zu prüfen; dieses Dokument ersetzt keine Rechtsprüfung. | ⬜ |
| FR-EQU-06 | **Bedarf vor Provision:** Auswahl und Reihenfolge folgen der Passung, nie der Provisionshöhe. Test: Eine geänderte Provisionstabelle verändert die Reihenfolge nicht. | ⬜ |
| FR-EQU-07 | **Keine Empfehlungen in sensiblen Kontexten:** keine Links an Pflanzenmitteln gegen Schädlinge/Krankheiten (Zulassung, Gesundheit), keine in Freunde-Sichten, im Pokédex oder in Tauschangeboten. | ⬜ |
| FR-EQU-08 | **Datensparsamkeit:** Sammlungsdaten (Pflanzen, Standorte, Messungen, Fotos) gehen nie an Partner. Klickmessung nur aggregiert und nur mit Einwilligung. | ⬜ |
| FR-EQU-09 | **Keine erfundenen Produktdaten:** Namen, Preise, Verfügbarkeit stammen aus einer zitierbaren Quelle mit Abrufdatum. Die KI darf Produkte **recherchieren und vorschlagen**, schreibt sie aber erst nach Bestätigung und mit Quelle (US-KI-05). | ⬜ |
| FR-EQU-10 | **Keine Funktion hinter Empfehlungen sperren:** kein Kaufzwang, kein Dark Pattern, keine Einschränkung des Trackings bei „Keine Empfehlungen". | ⬜ |
