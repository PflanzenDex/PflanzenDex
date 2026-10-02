# 08 – Epic MON: Monitoring, Erinnerungen und Sensorik (geplant)

**Status des gesamten Epics: ⬜ nicht umgesetzt.** Quelle ist ausschließlich `docs/superpowers/specs/2026-09-25-pflanzen-monitoring-design.md` (Entwurf, Richtung „erst Bot, dann Hardware" vom Nutzer bestätigt, Details nicht abgestimmt). Im Vault gibt es weder `pflanzen_status.py`, noch `Giesslog`/`Giess_*`/`Sensor_*`-Felder, noch `Sensor-Status.md`. Einziges Artefakt: das Sparziel `02-Areas/Finanzen/Sparziele/Pflanzen-Sensorik-Set.md` (ca. 40 €, Pilot-Hardware).

## Problem

1. **Pull-System:** Alle Warnungen erscheinen nur beim Öffnen des Dashboards. Phasenwechsel und überfällige Behandlungen werden nicht gemeldet. Das entspricht dem „schwachen System"-Muster: abhängig vom Erinnern.
2. **Keine Messdaten:** Gießen, Raumklima und reale Lichtstärke sind Schätzungen (`Gießen_Messer` ist Freitext, die Lux-Werte der Lampenstufen sind Nennwerte).

Bestand zum Planungszeitpunkt: 12 Pflanzen, geplant 15–30.

## Userstories

### US-MON-01 · Täglich nur bei Handlungsbedarf benachrichtigt werden · ⬜
Als **Pflanzenhalter** will ich eine Telegram-Nachricht nur dann, wenn etwas zu tun ist, damit ich nicht auf das Dashboard angewiesen bin und keine „alles ok"-Nachrichten bekomme.

Akzeptanzkriterien:
- Ein täglicher Bot-Job (z. B. 08:00, `run_daily`; Achtung: in python-telegram-bot ist Wochentag 0 = Sonntag) liest das Frontmatter und sendet nur bei mindestens einem Auslöser aus US-MON-02 bis -05.
- Die Nachricht enthält Inline-Buttons („gegossen ✔", „erledigt ✔"), die direkt ins Frontmatter schreiben.
- Derselbe Anlass wird nicht zweimal am selben Tag gemeldet (Idempotenz).
- Fehlt jeder Handlungsbedarf, wird nichts gesendet.

### US-MON-02 · Am Phasenwechsel erinnert werden · ⬜
Als **Pflanzenhalter** will ich am Tag, an dem eine Ruhe- oder Wachstumsphase beginnt, erinnert werden, wenn `Standort_Aktuell` noch der alte Standort ist.

Akzeptanzkriterien: Auslöser = heute beginnt/endet die Ruhephase **und** `Standort_Aktuell` ≠ neuer Soll-Standort. Die Phasenberechnung entspricht dem Dashboard (US-PHA-01).

### US-MON-03 · Bei fälliger Behandlung erinnert werden · ⬜
Akzeptanzkriterien: Auslöser = Eintrag in `Behandlungen` mit `Erledigt: false` und `Datum ≤ heute`. Button „erledigt ✔" setzt `Erledigt: true`.

### US-MON-04 · An überfällige Messung erinnert werden · ⬜
Akzeptanzkriterien: Auslöser = letzter `Wachstumslog`-Eintrag älter als N Tage (Startwert 30) oder gar keiner. Stecklinge sind ausgenommen (analog zum Phasen-Block).

### US-MON-05 · Gießen ohne Sensor per Intervall erinnert werden · ⬜
Als **Pflanzenhalter** will ich eine Gießerinnerung und einen Befehl `/gegossen <Pflanze>`, damit auch Pflanzen ohne Sensor ein Gießprotokoll haben.

Akzeptanzkriterien:
- Neue Felder (DM-M1): `Giess_Intervall_Tage: {Wachstum, Ruhe}` und `Giesslog: [{Datum, Quelle: "bot"|"sensor"}]`.
- Auslöser = letzter `Giesslog`-Eintrag + Intervall der **aktuellen** Phase ≤ heute.
- `/gegossen` und der Inline-Button schreiben `Giesslog` mit `Quelle: "bot"`.
- Startwerte der Intervalle kommen aus dem Freitext `Gießen_Messer` und sind nachjustierbar.

### US-MON-06 · Bodenfeuchte per Sensor erfassen · ⬜
Als **Pflanzenhalter** will ich, dass ein Sensor das Gießen erkennt und die Fälligkeit meldet, damit der Gießen-Button dort entfällt.

Akzeptanzkriterien:
- Ein Anstieg von mindestens X Prozentpunkten in kurzer Zeit gilt als Gießen; der Bot schreibt `Giesslog` mit `Quelle: "sensor"`.
- Fällt `wert_prozent` unter `Giess_Schwelle` der **aktuellen** Phase (z. B. Wachstum 35, Ruhe 10), meldet der Bot. Für Pflanzen mit Sensor ersetzt das die Intervall-Erinnerung.
- Die Zuordnung Sensor → Pflanze steht nur in `Sensor_ID`; ein neuer Sensor ist ein Frontmatter-Eintrag, keine Code-Änderung.
- Pro Topf wird einmal trocken und einmal nass kalibriert (`Sensor_Trocken`, `Sensor_Nass`); ohne Kalibrierung sind Prozentwerte nicht vergleichbar.

### US-MON-07 · Klima- und Sensorstatus sehen, Ausfälle bemerken · ⬜
Als **Pflanzenhalter** will ich aktuelle Klimawerte und den Zustand der Sensoren im Dashboard sehen und eine einmalige Lichtmessung der Lampenstufen dokumentieren.

Akzeptanzkriterien:
- `02-Areas/Pflanzen/Sensor-Status.md` (nur vom Skript geschrieben, idempotent, vollständig neu berechnet) mit `stand` und je Sensor `id`, `typ` (`bodenfeuchte`/`klima`), `wert_prozent` bzw. `temp_c`/`luftfeuchte_prozent`, `min_24h`/`max_24h`, `zuletzt`.
- Dashboard-Block zeigt „Status veraltet", wenn `stand` älter als 1 Tag ist; einzelne Sensoren sind „stumm", wenn `zuletzt` älter als 6 Stunden ist (leere Batterie, WLAN, Kabel).
- Klima: nur Anzeige und Warnung bei Ausreißern (z. B. Ruhephasen-Pflanze deutlich wärmer als `Standort_Ruhephase`), keine Steuerung.
- Licht: einmalige Messung je Lampenstufe mit Handy-App (Photone, PPFD), Ergebnis mit Datum und Methode in `Lampen-Zuordnung.md`, kein Log.

## Anforderungen

### Daten (DM-M1)

```yaml
Giess_Intervall_Tage: {Wachstum: 7, Ruhe: 30}
Giesslog: []                       # {Datum, Quelle: "bot"|"sensor"}
Sensor_ID: null                    # z. B. "bf-03"
Sensor_Trocken: null
Sensor_Nass: null
Giess_Schwelle: {Wachstum: 35, Ruhe: 10}   # Prozent nach Kalibrierung
```

### Funktional

| ID | Anforderung | Status |
|---|---|---|
| FR-MON-01 | Bot-Job `pflanzen_status.py` mit Tests (Vorbild `sport_status.py`/`sport_schau.py` im Bot-Modul). | ⬜ |
| FR-MON-02 | Erinnerungen nur bei Handlungsbedarf; einmal je Anlass und Tag. | ⬜ |
| FR-MON-03 | Phasenberechnung im Bot ist deckungsgleich mit dem Dashboard (idealerweise gemeinsame, getestete Logik). | ⬜ |
| FR-MON-04 | Bodenfeuchte ersetzt den Gießen-Button, wo ein Sensor steht; ohne Sensor bleibt der Button. | ⬜ |
| FR-MON-05 | Keine Sensoren für Wachstumsmessung und Vergeilungsurteil; beides bleibt manuell. | ⬜ (Designentscheidung) |
| FR-MON-06 | Pfad: ESP32 (ESPHome) → WLAN/MQTT → Mosquitto (Home Server) → Bot → Rohwerte in SQLite/CSV **außerhalb** des Vaults → aggregiert in `Sensor-Status.md`. | ⬜ |
| FR-MON-07 | Dashboard-Block für Sensorstatus mit Drift-Checks (`stand`, `zuletzt`). | ⬜ |
| FR-MON-08 | Die neuen Felder (`Giess_*`, `Giesslog`) werden in die Art-/Exemplar-Vorlagen aufgenommen und in `CLAUDE.md` („Workflow: Pflanzenpflege") dokumentiert, sonst verwaist das System. | ⬜ |

### Nicht-funktional / Randbedingungen

| ID | Anforderung | Status |
|---|---|---|
| NFR-MON-01 | **Rohmesswerte kommen nicht in den Vault.** Der Vault wird per Git synchronisiert (Auto-Pushes); Minutenwerte würden die Historie aufblähen und Merge-Konflikte erzeugen. Nur Aggregate (aktueller Wert, Tages-Min/Max, Zeitstempel) gehen in den Vault. | ⬜ |
| NFR-MON-02 | Schwellen sind Schätzungen; Startwerte konservativ, im Betrieb nachziehen (Alarm-Müdigkeit vermeiden). | ⬜ |
| NFR-MON-03 | Sensor-Ausfall muss über den „stumm"-Check auffallen (Batterie, WLAN, Kabel). | ⬜ |
| NFR-MON-04 | Bot-Ausfall stoppt Erinnerungen; bestehende systemd-/Autoupdate-Mechanismen des Bots gelten unverändert. | ⬜ |

### Hardware (Pilot, Richtwerte aus dem Gespräch, vor dem Kauf prüfen)

| Teil | Zweck |
|---|---|
| ESP32 Dev Kit C V4 (ca. 8 €) | Controller, WLAN |
| Kapazitiver Bodenfeuchtesensor V1.2 ×6 (4 Pilot + 2 Reserve, ca. 12 €) | Bodenfeuchte, verkabelt, Qualität schwankt |
| ADS1115 (ca. 4 €) | mehr Analogkanäle (ESP32-ADC bei WLAN: ca. 6–8 nutzbar) |
| SHT31 (ca. 6 €) | Temperatur/Luftfeuchte je Lampenzone |
| Jumper, Breadboard, Netzteil (ca. 10 €) | Aufbau |
| *Nach dem Pilot:* Zigbee-Bodenfeuchtesensor + USB-Koordinator (je ca. 10–25 € + ca. 20–30 € einmalig) | Funkvariante ohne Kabel |

Bewusst **nicht** enthalten: BH1750 (Messbereich bis 65.535 Lux, Lampe 3/4 liegen bei 100.000/110.000 Lux).

### Out of Scope

Automatische Bewässerung, Dünge-Tracking, Foto-Auswertung, Dauer-Lichtmessung, PPFD-Messgerät (200 €+), Cloud-Dienste.

## Umsetzungsphasen

1. **Bot-Erinnerungen** (keine Hardware): Felder `Giess_Intervall_Tage`, `Giesslog` ins Schema und in die Prompt-Vorlage; `pflanzen_status.py` mit Tests; Bot-Job; `/gegossen`.
2. **Pilot:** Mosquitto auf dem Home Server; ein ESP32 mit SHT31 und 3–4 Bodenfeuchtesensoren plus 1–2 Funksensoren; Rohwert-Speicher; `Sensor-Status.md`; Dashboard-Block; Drift-Checks. Der Pilot testet verkabelt und Funk an 3–4 heiklen Pflanzen, bevor skaliert wird.
3. **Skalieren:** Weitere Sensoren nach Pilot-Ergebnis; Lichtstufen mit Photone prüfen (jederzeit, unabhängig).

## Offene Fragen (aus der Spec, unbeantwortet)

1. Reichen Intervalle je Phase für die Erinnerung ohne Sensor, oder soll das Gießen je Pflanze feiner beschrieben werden?
2. Läuft bereits ein MQTT-Broker (oder Home Assistant) auf dem Home Server, oder wird Mosquitto neu aufgesetzt?
3. Funk (Zigbee) oder verkabelt: Entscheidung nach dem Pilot; braucht der Home Server einen freien USB-Port für den Koordinator?
4. Welche Pflanzen sind die „heiklen" für den Pilot?
5. Wie oft darf der Bot melden (täglich um 08:00 oder gebündelt, z. B. nur werktags)?

## Risiken

Billige Sensoren sind unzuverlässig (Qualität, unversiegelte Kanten, Drift); Substratunterschiede (Bims, Perlite, Erde) verändern die Messung, daher Kalibrierung je Topf; Batterien bei Funksensoren; wenige I2C-Adressen begrenzen die Sensorzahl (nicht geprüft). Zu viele Telegram-Nachrichten verbrauchen Aufmerksamkeit; siehe Offene Frage 5.
