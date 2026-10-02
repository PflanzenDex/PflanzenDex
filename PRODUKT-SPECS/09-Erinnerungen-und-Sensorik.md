# 09 – Epic MON: Erinnerungen, Gießen und Sensorik

Ziel: Das System meldet sich, wenn etwas zu tun ist, statt auf den Besuch zu warten. Später messen Sensoren, was bisher geschätzt wird.

Prototyp-Bezug: Epic MON war dort nur Spec (kein Code). Hier ist **Phase 1 (Erinnerungen und Gießprotokoll) Teil des Kernprodukts**, weil eine App Benachrichtigungen nativ kann. Die Sensor-Phase bleibt später und hängt an Hardware-Entscheidungen.

## Problem

1. **Pull-System:** Phasenwechsel, überfällige Behandlungen und Messungen werden nur beim Öffnen sichtbar.
2. **Keine Messdaten:** Gießen, Raumklima und reale Lichtstärke sind Schätzungen.

## Userstories

### US-MON-01 · Nur bei Handlungsbedarf benachrichtigt werden · ⬜ neu
Als **Pflanzenhalter** will ich eine Benachrichtigung nur, wenn etwas zu tun ist, und keine „alles ok"-Meldungen.

Akzeptanzkriterien:
- Ein täglicher Job (Uhrzeit einstellbar, Voreinstellung 08:00 in der Zeitzone des Nutzers) prüft die Auslöser aus US-MON-02 bis -05 und sendet höchstens **eine gebündelte** Meldung.
- Die Meldung enthält Aktionen („gegossen", „erledigt", „umgestellt"), die direkt ausführen, ohne die App zu durchsuchen.
- Derselbe Anlass wird nicht zweimal am selben Tag gemeldet (Idempotenz).
- Ohne Handlungsbedarf wird nichts gesendet.
- Kanal: Web-Push; Telegram oder E-Mail sind optional (E-10).

### US-MON-02 · Am Phasenwechsel erinnert werden · ⬜ neu (Prototyp: Spec)
Akzeptanzkriterien: Auslöser = heute beginnt oder endet die Ruhephase **und** der Standort ist noch der alte. Die Berechnung ist dieselbe wie in `US-PHA-01`, nicht neu geschrieben (FR-MON-03).

### US-MON-03 · Bei fälliger Behandlung erinnert werden · ⬜ neu
Akzeptanzkriterien: Auslöser = offene Behandlung mit Datum ≤ heute. „Erledigt" in der Meldung hakt ab (US-BEH-03).

### US-MON-04 · An überfällige Messung erinnert werden · ⬜ neu
Akzeptanzkriterien: Auslöser = letzte Messung älter als N Tage (Voreinstellung 30, einstellbar) oder keine. Stecklinge nach Entscheidung (FR-WAC-08).

### US-MON-05 · Gießen ohne Sensor per Intervall erinnert werden · ⬜ neu
Als **Pflanzenhalter** will ich Gießerinnerungen und ein Gießprotokoll auch ohne Sensor.

Akzeptanzkriterien:
- Neue Daten: Gießintervall je Art und Phase (Wachstum/Ruhe, Tage) und Gießprotokoll je Exemplar (`Datum`, `Quelle: manuell | sensor`).
- Auslöser = letzter Eintrag + Intervall der **aktuellen** Phase ≤ heute.
- „Gegossen" (in der App oder der Meldung) schreibt einen Protokolleintrag; Sammelaktion für mehrere Exemplare.
- Startwerte für Intervalle kommen aus dem Gießhinweis der Art und sind anpassbar.

### US-MON-06 · Bodenfeuchte per Sensor erfassen · ⬜ neu (später)
Akzeptanzkriterien:
- Ein Anstieg um mindestens X Prozentpunkte in kurzer Zeit gilt als Gießen; das System schreibt einen Eintrag mit `Quelle: sensor`.
- Fällt der Wert unter die Schwelle der **aktuellen** Phase, meldet das System; für Exemplare mit Sensor ersetzt das die Intervall-Erinnerung.
- Die Zuordnung Sensor → Exemplar ist ein Datensatz (US-EQU-06), keine Code-Änderung.
- Kalibrierung je Topf (trocken, nass); ohne sie sind Prozentwerte nicht vergleichbar.

### US-MON-07 · Klima- und Sensorstatus sehen · ⬜ neu (später)
Akzeptanzkriterien:
- Je Sensor: Typ, aktueller Wert, 24-h-Minimum/Maximum, letzter Empfang.
- „Status veraltet", wenn der Gesamtstand älter als 1 Tag ist; Sensor „stumm", wenn der letzte Empfang älter als 6 Stunden ist (Batterie, WLAN, Kabel).
- Klima: Anzeige und Warnung bei Ausreißern (z. B. Pflanze in Ruhephase deutlich wärmer als ihr Ruhe-Standort), keine Steuerung.
- Lichtmessung je Zone einmalig per Handy-App (PPFD), mit Datum und Methode (US-EQU-03).

### US-MON-08 · Erinnerungen steuern · ⬜ neu
Akzeptanzkriterien:
- Je Anlass (Phase, Behandlung, Messung, Gießen, Tausch, Freunde) an/aus, Uhrzeit, Ruhezeiten.
- Ein Anlass kann pausiert werden („eine Woche nicht erinnern") ohne dass Daten verloren gehen.
- Abschalten einer Erinnerung ändert die Berechnung nicht; „Heute" zeigt weiterhin alles Fällige (FR-MON-03).

## Anforderungen

### Daten (DM-MON-01)

`Giess_Intervall_Tage` je Art: `{Wachstum, Ruhe}`; `Giessprotokoll` je Exemplar: `{Datum, Quelle}`; `Sensor`: `{Kennung, Typ, Exemplar? oder Bereich, Kalibrierung, Schwellen}`; `Messreihe`: Rohwerte außerhalb der Nutzerdaten, aggregiert in `Sensorstatus`.

### Funktional

| ID | Anforderung | Status |
|---|---|---|
| FR-MON-01 | Die Erinnerungslogik ist reine, getestete Logik (P-01), nicht an den Zustellkanal gebunden. | ⬜ |
| FR-MON-02 | Erinnerungen nur bei Handlungsbedarf, einmal je Anlass und Tag. | ⬜ |
| FR-MON-03 | Phasenberechnung, „Heute"-Liste und Erinnerung nutzen **dieselbe** Logik (löst B-02). | ⬜ |
| FR-MON-04 | Bodenfeuchte ersetzt den Gießen-Tipp, wo ein Sensor steht; ohne Sensor bleibt der Tipp. | ⬜ |
| FR-MON-05 | Keine Sensoren für Wachstumsmessung und Vergeilungsurteil; beides bleibt manuell. | ⬜ (Designentscheidung) |
| FR-MON-06 | Sensorpfad (Beispiel Prototyp-Spec): Controller → WLAN/MQTT → Empfänger → Rohwert-Speicher → Aggregate. Technik offen (E-09). | ⬜ |
| FR-MON-07 | Rohwerte werden getrennt von Sammlungsdaten gehalten; nur Aggregate gehen in die Sammlung (aus dem Prototyp NFR-MON-01, hier zur Datenhaltung). | ⬜ |
| FR-MON-08 | Zustellung fehlgeschlagen: nach drei Versuchen markiert, in „Hinweise" sichtbar. | ⬜ |

### Nicht-funktional

| ID | Anforderung | Status |
|---|---|---|
| NFR-MON-02 | Schwellen sind Schätzungen; Startwerte konservativ, im Betrieb nachziehen (Alarm-Müdigkeit vermeiden). | ⬜ |
| NFR-MON-03 | Sensor-Ausfall fällt über den „stumm"-Check auf. | ⬜ |
| NFR-MON-04 | Ein Ausfall des Erinnerungsjobs ist für den Betreiber sichtbar (NFR-18). | ⬜ |

### Hardware-Pilot (Richtwerte aus dem Prototyp, vor dem Kauf prüfen)

ESP32-Controller (~8 €), kapazitive Bodenfeuchtesensoren V1.2 (4 + 2 Reserve, ~12 €), ADS1115 (~4 €), SHT31 (~6 €), Zubehör (~10 €). Später Zigbee-Sensoren mit USB-Koordinator. Bewusst **nicht** BH1750 (Messbereich ≤ 65.535 Lux bei Lampen mit 100.000+ Lux).

### Out of Scope

Automatische Bewässerung, Dünge-Tracking, Foto-Auswertung für Feuchte oder Höhe, Dauer-Lichtmessung, PPFD-Messgerät (200 €+).

## Umsetzungsphasen

1. **Erinnerungen:** Gießintervall und -protokoll, Erinnerungsjob, Web-Push, „Heute"-Liste (Release R3).
2. **Sensor-Pilot:** an 3–4 heiklen Pflanzen, verkabelt und Funk, Aggregate und Status.
3. **Skalieren** nach Pilot-Ergebnis.

## Offene Fragen

1. Reichen Intervalle je Phase ohne Sensor, oder feinere Gießbeschreibung je Pflanze?
2. Welcher Zustellkanal ist Standard (Web-Push, Telegram, E-Mail), und wer zahlt ggf. dessen Kosten?
3. Funk (Zigbee) oder verkabelt? Entscheidung nach dem Pilot.
4. Welche Pflanzen sind die „heiklen" für den Pilot?
5. Wie oft darf gemeldet werden (täglich gebündelt oder werktags)?
