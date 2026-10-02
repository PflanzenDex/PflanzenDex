# 10 – Lücken, Befunde und Backlog

Befunde aus der Analyse (2026-10-02). Jeder Befund nennt Beleg und Wirkung. „Defekt" = Code verhält sich anders als beabsichtigt; „Drift" = Doku und Ist widersprechen sich; „Lücke" = fehlt.

## Befunde

| ID | Art | Befund | Beleg | Wirkung |
|---|---|---|---|---|
| B-01 | Defekt | Wachstums-Eingabe speichert das **UTC**-Datum (`new Date().toISOString().slice(0, 10)`), das Anlegen-Formular das lokale Datum. | Dashboard, Block „📈 Wachstum", Speichern-Handler | Messung zwischen 00:00 und 02:00 (Sommer) bzw. 01:00 (Winter) landet am Vortag, Raten verschieben sich. Gering, aber trivial zu beheben. |
| B-02 | Lücke | Die Dashboard-Logik hat keine Tests und mehrfach kopierte Hilfsfunktionen (`artOf`, `artPfad`, `v`, Phasenberechnung in Formular **und** Block). | Dashboard-Datei, 826 Zeilen | Drift zwischen Kopien (die Phasenberechnung existiert zweimal), spätere Bot-Logik (MON) müsste sie ein drittes Mal schreiben. |
| B-03 | Drift | v2-Spec („Silhouetten", Name „? ? ? ?", maskierter Kurztext) und v3-Spec („Fehlende Karten maskieren weiterhin Namen/Text") widersprechen Code und `CLAUDE.md` (alles offen, Wikipedia-Foto statt Silhouette). | `docs/superpowers/specs/…v2…`, `…v3…`; `pokedex-core.js` `cardHtml` | Wer die Specs liest, baut das Falsche. Übrig ist nur die „???" oben rechts auf Fehlend-Karten und die CSS-Klassen `.sil`/`.miss`. |
| B-04 | Lücke | Exemplar-Notizen ohne `Art` fallen aus **allen** Blöcken, ohne Warnung. Fehlendes `Standort_Aktuell` zeigt „steht noch: undefined". | alle Blöcke `.filter(p => p.Art)` | Stille Lücken (NFR-06). |
| B-05 | Inkonsistenz | `Schwierigkeit` hat zwei Skalen: Text in Art-Notiz und Wunschliste, Zahl 1–3 in `Arten.md`. Spaltenüberschrift im Dashboard heißt „Level" und zeigt den Text. | DM-01, DM-04, DM-06 | Keine Auswertung kann beides vergleichen; die Sortierung nach Text funktioniert nur, weil `Einfach < Medium < Schwer` alphabetisch gilt. |
| B-06 | Risiko | `foto_import.py` sucht Log-Einträge per Zeilenmuster `  - Datum: "<Datum>"`. Schreibt Obsidian das Frontmatter anders (anderer YAML-Stil), schlägt der Import mit „Kein Wachstumslog-Eintrag" fehl. | `foto_import.py` `link_foto` | Dateikopie ohne Verknüpfung. |
| B-07 | Risiko | Die Lampen-Strings sind im Dashboard (Anschaffungen-Block, Steckling-Konstante, Vorlagen), in `Lampen-Zuordnung.md`, `Wunschliste.md` und allen Art-Notizen **zeichengleich** hartkodiert. Jede Abweichung (z. B. andere Lux-Angabe) zählt still nicht. | `lamps`-Arrays, `STECKLING_LAMPE` | Neue Lampenstufe oder geänderte Lux-Angabe erfordert Änderungen an ≥ 5 Stellen. |
| B-08 | Risiko | Behandlungen und „Erledigt ✔" arbeiten mit Array-Index vom Zeitpunkt des Renderns. | Block „💊 Behandlungen" | Zweites geöffnetes Fenster oder gleichzeitige Änderung trifft ggf. den falschen Eintrag. |
| B-09 | Lücke | Wunschliste und Pokédex sind unverknüpft (bewusst); `Gekauft ✔` führt nicht zu Art-Notiz/Exemplar; zwei Wunschlisten-Kandidaten stehen schon in `Arten.md`. | `Wunschliste.md`, `Arten.md` | Doppelte Pflege, manuelle Kette Kauf → Art → Exemplar → Pokédex. |
| B-10 | Offen | Pokédex-Katalog hat 215 statt Ziel 600+ Arten. | `Arten.md`, Spec v3 | Kuration, kein Code. |
| B-11 | Drift | Dashboard-Hinweistext „bei praktisch allen 12 Arten" (es sind 13 Arten) und „Aktuell gibt es noch keine Messwerte" (14 von 17 Exemplaren haben Einträge); Frontmatter `last_updated: 2026-06-29`. | Dashboard, Block „📈 Wachstum", Kopf | Falsche Selbstauskunft. |
| B-12 | Daten | Nur **1 von 17** Exemplaren trägt `Gefangen_Am`; der Rest nutzt `created` der Art-Notiz (Anzeige „≈"). | Exemplar-Frontmatter | Fangdaten im Pokédex sind überwiegend ungefähr. |
| B-13 | Daten | `Hippeastrum` (Amaryllis) und `Parodia sp.` haben kein Artepitheton; **2 von 13 Arten zählen nicht als gefangen** (Pokédex warnt). | Art-Notizen | Bewusst so; Handlung: Epitheton ergänzen, sobald bekannt (`Parodia sp.`: Verdacht *P. leninghausii*, im Katalog steht nur *Parodia magnifica*). |
| B-14 | Lücke | Pflege-Erinnerungen und Gießprotokoll fehlen (Epic MON). | keine Treffer für `pflanzen_status`/`Giesslog` | Pull-System. |
| B-15 | Hinweis | Zwei archivierte Notizen (`Basilikum`, `Efeutute`) sind im alten Einzeldatei-Format (Art + Exemplar vermischt). | `04-Archive/Pflanzen/` | Unkritisch (außerhalb der Queries). |
| B-17 | Lücke | Keine soziale Schicht: kein Freundeskreis, kein Feed, kein Tauschen. Austauschtechnik nicht entschieden (E-SOZ-01). | Epic SOZ (`11-Soziales.md`) | Stecklinge werden nur von Hand archiviert, ohne Herkunft und Angebot. |
| B-16 | Hinweis | Das Dashboard-Frontmatter fehlen `tags` (Pokédex-Notiz hat `pflanzen`, `dashboard`). | Dashboard-Kopf | Auffindbarkeit nur über den Pfad. |

## Backlog (priorisiert)

Priorität = Nutzen ÷ Aufwand. **P1** sofort sinnvoll, **P2** wenn Zeit, **P3** nach Entscheidung.

| Prio | ID | Aufgabe | Aufwand | Berührt |
|---|---|---|---|---|
| P1 | B-01 | Datum im Wachstums-Speichern auf lokales Datum umstellen (wie im Anlegen-Formular). | klein | US-WAC-07 |
| P1 | B-11 | Veraltete Dashboard-Texte korrigieren (12→13 Arten, „noch keine Messwerte" streichen, `last_updated`). | klein | – |
| P1 | B-03 | Specs v2/v3 mit einer Anmerkung „durch Entscheidung ersetzt: Namen/Texte bleiben sichtbar, Wikipedia-Foto statt Silhouette" versehen (oder die Specs ändern). | klein | US-POK-01 |
| P2 | B-04 | Warnblock „⚠️ Unvollständige Notizen" im Dashboard: Dateien in `Meine Pflanzen/` ohne `Art`, ohne `Standort_Aktuell`, mit nicht auflösbarer Art. | klein–mittel | US-BES-08, NFR-06 |
| P2 | B-02 | `pflanzen-core.js` (wie `finanz-core.js`/`pokedex-core.js`): Phasenberechnung, Trend/Rate, Lampenzählung, Priorisierung, Namensregel; `node --test`. Dashboard-Blöcke rufen sie auf. | mittel | QS-02, Voraussetzung für MON |
| P2 | B-05 | Eine Skala für `Schwierigkeit` festlegen (Vorschlag: Zahl 1–3 überall, Text als Anzeige) und Art-Vorlage, Wunschliste und Dashboard angleichen. | mittel | DM-01/04/06 |
| P2 | B-07 | Lampenstufen zentral definieren (z. B. in `Lampen-Zuordnung.md`-Frontmatter oder `pflanzen-core.js`) und von allen Blöcken lesen. | mittel | LIC |
| P2 | MON | **Phase 1 des Monitorings:** `Giess_Intervall_Tage`/`Giesslog` ins Schema, `pflanzen_status.py`, Bot-Job, `/gegossen`. Abhängig von B-02 (gemeinsame Phasenlogik). | groß | Epic MON |
| P3 | SOZ | **Soziales:** erst E-SOZ-01 entscheiden, dann `soziales-core.js` (Freigabe, Feed-Ableitung, Tauschzustände) mit Tests, danach Hub und Dashboard-Blöcke. Abhängig von B-02 (Kernlogik) und für Benachrichtigung von MON. | groß | Epic SOZ |
| P3 | B-09 | Übergang „Gekauft ✔" → vorbefüllte Art-Vorlage; Abgleich Wunschliste ↔ `Arten.md`. | mittel | US-WUN-05 |
| P3 | B-08 | Behandlungen mit stabiler ID oder Index-Prüfung gegen Inhalt (Datum+Grund) absichern. | klein | FR-BEH-02 |
| P3 | B-06 | `foto_import.py` auf YAML-Parser umstellen oder Format-Annahme dokumentieren. | klein | FR-WAC-06 |
| P3 | B-12 | `Gefangen_Am` für Bestandsexemplare nachtragen (Halter weiß die Daten). | klein | US-POK-07 |
| P3 | B-13 | Epitheton für Amaryllis (`Hippeastrum`…) und Parodia ergänzen, sobald bestimmt; ggf. Art in `Arten.md`. | klein | US-POK-06 |
| P3 | B-10 | Pokédex-Katalog in Batches erweitern. | laufend | US-POK-13 |
| P3 | – | Archivieren per Button (Exemplar verschieben + `Archiviert_Am/Grund`) statt von Hand. | mittel | US-BES-07 |

## Offene Entscheidungen für den Halter

1. **Reihenfolge:** erst Qualität (B-02, B-04) oder direkt Monitoring Phase 1? Empfehlung: B-02 zuerst, weil die Bot-Erinnerung dieselbe Phasenlogik braucht und sonst ein drittes Mal kopiert würde.
2. **Wachstum für Stecklinge** sichtbar lassen oder ausblenden (FR-WAC-05)?
3. **Lichtübersicht** für Stecklinge: Artwert (jetzt) oder Lampe 1 (FR-LIC-05)?
4. **Schwierigkeit:** Zahl oder Text als führende Skala (B-05)?
5. **E-SOZ-01:** Austauschschicht für Freunde, Feed und Tausch (Bot als Hub, eigener Server, dateibasierter Sync); weitere Fragen in `11-Soziales.md`.
6. Die Fragen aus `08-Monitoring-Sensorik.md` (MQTT-Broker, Funk oder Kabel, Pilotpflanzen, Meldehäufigkeit).

## Nicht-Ziele (bewusst nicht im Backlog)

Automatische Bewässerung, Foto-basierte Höhen-/Feuchteschätzung, Bestenlisten und Rangvergleiche zwischen Freunden (Fakten ja, Wertung nein; US-SOZ-07), Cultivar-Slots, SVG-Baum, Cloud-Dienste ohne Entscheidung zu E-SOZ-01.
