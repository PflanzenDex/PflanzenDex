# 11 – Epic SOZ: Soziales (Freunde, Feed, Tauschen) (geplant)

**Status des gesamten Epics: ⬜ nicht umgesetzt.** Es gibt keinen Code, keine Felder und keine Austauschschicht. Das System ist heute ein Ein-Personen-Vault ohne Konten und ohne Server.

**Technik bewusst offen:** Dieses Epic beschreibt nur das fachliche Verhalten. *Wie* Freunde Daten austauschen (z. B. Telegram-Bot als Hub, eigener Server, Datei-Sync) ist nicht entschieden (siehe Entscheidung E-SOZ-01 in `10-Luecken-und-Backlog.md`). Alle Anforderungen sind so formuliert, dass sie unabhängig davon gelten. Die Austauschschicht heißt hier **Hub**.

Ziel: Sammeln und Pflegen wird gemeinsam. Der Pflanzenhalter sieht, was Freunde Neues gesammelt haben, und kann Pflanzen und Stecklinge mit ihnen tauschen, ohne dass sein Vault öffentlich wird.

Quellen: keine im Ist-Zustand. Abgeleitet aus dem Auftrag vom 2026-10-02 und den bestehenden Epics BES (Exemplar, Steckling, Archiv), POK (Fang, „Neu gefangen"), BEH (Behandlungen), MON (Benachrichtigung).

## Problem

1. **Isoliert:** Der Pokédex belohnt das Sammeln, aber nur gegen sich selbst. Was Freunde besitzen, ist unsichtbar.
2. **Stecklinge ohne Weg:** Stecklinge entstehen (US-BES-04) und werden verschenkt oder getauscht, aber die Abgabe ist nur manuelles Archivieren (US-BES-07). Es gibt kein Angebot, keine Anfrage und keine Herkunft.
3. **Datenschutz:** Der Vault enthält Standorte, Fotos und Messdaten. Ohne ausdrückliche Freigabe darf nichts davon nach außen gehen.

## Begriffe

| Begriff | Bedeutung |
|---|---|
| Freund | Anderer Pflanzenhalter, mit dem eine **bestätigte** Freundschaft besteht (beidseitig). |
| Hub | Austauschschicht zwischen den Vaults. Technik offen (E-SOZ-01). |
| Freigabe | Pro Exemplar festgelegte Sichtbarkeit: `privat` (Standard) oder `freunde`. |
| Angebot | Exemplar oder Steckling, das der Halter Freunden zum Tausch oder zur Abgabe anbietet. |
| Tausch | Vorgang Anfrage → Zusage → Übergabe. Auch einseitige Abgabe („verschenken") ist ein Tausch ohne Gegenstück. |
| Herkunft | Vermerk im Exemplar des Empfängers, von wem und wann es kam. |

## Userstories

### US-SOZ-01 · Freundschaft anfragen · ⬜
Als **Pflanzenhalter** will ich einen anderen Halter als Freund hinzufügen, damit wir Sammlungen sehen und tauschen können.

Akzeptanzkriterien:
- Gegeben meine Hub-Identität, wenn ich „Freund einladen" wähle, dann erhalte ich einen Einladungscode bzw. -link, den ich außerhalb des Systems weitergebe.
- Gegeben einen Einladungscode, wenn ich ihn einlöse, dann geht beim Einladenden eine Anfrage mit meinem Anzeigenamen ein. Es entsteht noch keine Freundschaft.
- Ein Einladungscode ist einmalig verwendbar und läuft nach 7 Tagen ab; abgelaufene oder bereits benutzte Codes werden mit klarer Meldung abgelehnt.
- Ich kann mich nicht selbst einladen; eine doppelte Anfrage an dieselbe Person erzeugt keine zweite.

### US-SOZ-02 · Freundschaftsanfrage beantworten · ⬜
Als **Pflanzenhalter** will ich Anfragen annehmen oder ablehnen.

Akzeptanzkriterien:
- Offene Anfragen erscheinen im Dashboard und als Benachrichtigung (siehe US-SOZ-12).
- Annehmen macht die Freundschaft beidseitig wirksam. Ablehnen verwirft die Anfrage still, die Gegenseite erfährt nur „nicht angenommen", nicht ob abgelehnt oder ignoriert.
- Vor der Annahme sieht der Empfänger nur Anzeigenamen, keine Sammlung.

### US-SOZ-03 · Freunde verwalten und Freundschaft beenden · ⬜
Als **Pflanzenhalter** will ich meine Freunde sehen und Freundschaften beenden können.

Akzeptanzkriterien:
- Block „👥 Freunde" listet Freunde mit Anzeigename, Freundschaftsbeginn und Zahl ihrer gefangenen Arten (nur freigegebene).
- Beenden entzieht beiden Seiten sofort die Sicht auf Sammlung, Feed und Angebote. Eigene Daten und bereits abgeschlossene Tausche (inkl. `Herkunft`) bleiben unberührt.
- Offene Tauschanfragen mit dieser Person werden beim Beenden abgebrochen (Status `abgebrochen`).
- Das Beenden benachrichtigt die Gegenseite nicht aktiv; sie sieht nur, dass die Person nicht mehr in der Liste steht.

### US-SOZ-04 · Selbst bestimmen, was Freunde sehen · ⬜
Als **Pflanzenhalter** will ich je Exemplar festlegen, ob Freunde es sehen, damit nichts ohne mein Wissen geteilt wird.

Akzeptanzkriterien:
- Neues Feld im Exemplar `Teilen` (DM-S1): `privat` (Standard, auch wenn das Feld fehlt) oder `freunde`.
- Ein Exemplar mit `privat` erscheint weder in der Sammlung noch im Feed noch in Zählungen von Freunden.
- Geteilt werden höchstens: Art (lateinischer und deutscher Name), Exemplarname, `Gefangen_Am`, Status (Steckling ja/nein), das jüngste Foto, **sofern** der Halter Fotos freigibt (`Teilen_Fotos: true`). **Nie** geteilt werden `Standort_Aktuell`, Wachstumslog-Notizen, Behandlungen, Kennzeichen, Finanzdaten.
- Fotos haben nach `foto_import.py` keine EXIF/GPS-Daten (FR-WAC-06); der Hub überträgt nur diese bereinigten Dateien.
- Eine globale Option „Alles privat" setzt alle Freigaben aus, ohne die Felder zu verändern.
- Das Zurücknehmen einer Freigabe wirkt sofort für künftige Abrufe; bereits an Freunde ausgelieferte Daten kann das System nicht zurückholen (Hinweis im Dialog).

### US-SOZ-05 · Sehen, welche neuen Pflanzen Freunde gesammelt haben · ⬜
Als **Pflanzenhalter** will ich einen Feed mit den Neuzugängen meiner Freunde, damit ich mitbekomme, was sie Neues haben, ohne sie zu fragen.

Akzeptanzkriterien:
- Block „🌱 Neu bei Freunden" zeigt Ereignisse, neueste zuerst, je Ereignis: Freund, Art (lateinisch + deutsch), Datum, ggf. Foto, Typ-Chip.
- Ereignistypen: **Neue Art gefangen** (die Art war beim Freund noch nicht im Pokédex), **Neues Exemplar** (bekannte Art, weiteres Exemplar), **Neuer Steckling**, **Eingetopft** (Steckling → Pflanze, siehe US-BES-04), **Getauscht** (nur wenn beide Beteiligten Freunde des Betrachters sind oder der Betrachter beteiligt ist).
- Nur Exemplare mit `Teilen: freunde` erzeugen Ereignisse (US-SOZ-04). Das Datum ist `Gefangen_Am` des Exemplars, sonst „unbekannt" (nie geraten, FR-POK-08).
- Ein Ereignis erscheint, sobald die Freigabe gilt; das Freigeben eines alten Exemplars erzeugt **kein** Ereignis „heute neu", sondern trägt sein tatsächliches Datum.
- Ereignisse sind nach Art und Freund dedupliziert; mehrere Exemplare derselben Art am selben Tag werden zu einem Ereignis „N Exemplare" zusammengefasst.
- Standardzeitraum letzte 30 Tage; Filter: nach Freund, nur „Neue Art".

### US-SOZ-06 · „Neu bei Freunden" seit meinem letzten Besuch · ⬜
Als **Pflanzenhalter** will ich beim Öffnen sehen, was seit meinem letzten Besuch dazugekommen ist.

Akzeptanzkriterien:
- Zustand analog US-POK-12 in einer gitignorierten Datei (`gesehen`-Liste der Ereignis-IDs, `stand`). Fehlt oder defekt: stilles Anlegen, **kein** Banner.
- Banner „🎉 Freunde haben N neue Pflanzen: …" bleibt bis „Okay ✔".
- Lese-/Schreibfehler werden abgefangen; das Dashboard rendert dann ohne Banner statt zu brechen.
- Fehlt der Hub (offline), zeigt der Block den zuletzt bekannten Stand mit Hinweis „Stand TT.MM.JJJJ" statt eines Fehlers.

### US-SOZ-07 · Sammlung eines Freundes ansehen und mit meiner vergleichen · ⬜
Als **Pflanzenhalter** will ich die freigegebene Sammlung eines Freundes ansehen, damit ich weiß, was er hat und was mir fehlt.

Akzeptanzkriterien:
- Die Sammlung des Freundes erscheint als Sammelkarten im Stil von US-POK-01. Karten zeigen den Stand **des Freundes** (gefangen = er besitzt ein freigegebenes Exemplar).
- Je Karte ein Chip „du hast sie" oder „fehlt dir", abgeleitet aus meinem Besitz (US-POK-06).
- Filter: „Fehlt mir" (Arten, die er hat und ich nicht), „Haben wir beide".
- Kein Rangvergleich und keine Bestenliste (bewusst, siehe Nicht-Ziele). Gezeigt werden Fakten, keine Wertung.

### US-SOZ-08 · Pflanze oder Steckling zum Tausch anbieten · ⬜
Als **Pflanzenhalter** will ich ein Exemplar als Angebot einstellen, damit Freunde es anfragen können.

Akzeptanzkriterien:
- Aus der Exemplarkarte „Zum Tausch anbieten" erzeugt ein Angebot (DM-S2) mit `Art`, Exemplar-Referenz, `Typ` (`Steckling` | `Pflanze` | `Ableger`), `Modus` (`tauschen` | `abgeben`), optional `Wunsch` (Freitext, z. B. „gern etwas für Lampe 3") und `Notiz`.
- Das Angebot ist nur für Freunde sichtbar. Ein Exemplar kann höchstens ein offenes Angebot haben.
- Angeboten werden kann nur ein Exemplar mit `Teilen: freunde`; andernfalls bietet der Dialog an, die Freigabe zu setzen.
- **Gesundheitsangabe:** Das Angebot zeigt automatisch „Behandlung offen" bzw. „zuletzt behandelt: Grund, Datum" aus `Behandlungen` (BEH), ohne Mittel und Notizen. Ein Exemplar mit offener Schädlingsbehandlung (`Erledigt: false`) kann nur nach ausdrücklicher Bestätigung angeboten werden.
- Das Angebot enthält den Phasen-Hinweis „aktuell Ruhephase" (PHA), falls zutreffend, damit Empfänger Stecklingszeitpunkt und Versand einschätzen.
- Der Halter kann das Angebot jederzeit zurückziehen (Status `zurückgezogen`). Offene Anfragen darauf werden abgebrochen.

### US-SOZ-09 · Angebote von Freunden sehen und anfragen · ⬜
Als **Pflanzenhalter** will ich sehen, was Freunde anbieten, und etwas anfragen.

Akzeptanzkriterien:
- Block „🔁 Tauschbörse" listet offene Angebote aller Freunde mit Art, Typ, Modus, Gesundheitsangabe, Foto (falls freigegeben), Chip „fehlt dir" (neue Art für mich).
- Filter: Lampenstufe der Art (passt zu meiner Lampenverteilung, LIC), „fehlt dir", Typ.
- „Anfragen" erzeugt eine Tauschanfrage (DM-S3). Bei `Modus: tauschen` kann ich ein **eigenes** Exemplar mit `Teilen: freunde` als Gegenangebot beilegen oder die Gegenleistung offen lassen (dann Freitext).
- Ich kann zu einem Angebot nur eine offene Anfrage stellen; eigene Angebote kann ich nicht anfragen.
- Ein Hinweis erscheint, wenn die angebotene Art auf meiner **Wunschliste** steht (WUN); die Wunschliste selbst wird nicht an Freunde übertragen.

### US-SOZ-10 · Tauschanfrage beantworten · ⬜
Als **Pflanzenhalter** will ich Anfragen auf meine Angebote zusagen, ablehnen oder gegenvorschlagen.

Akzeptanzkriterien:
- Eingehende Anfragen erscheinen am Angebot und als Benachrichtigung (US-SOZ-12). Aktionen: **Zusagen**, **Ablehnen** (optional mit kurzem Grund), **Anderes vorschlagen** (Gegenangebot ändern).
- Zusagen setzt das Angebot auf `reserviert`; weitere Anfragen auf dasselbe Angebot werden automatisch abgelehnt („schon vergeben").
- Wird eine Zusage zurückgenommen, bevor übergeben wurde, geht das Angebot zurück auf `offen` und die Gegenseite wird benachrichtigt.
- Ein Tauschvorgang hat genau die Zustände `angefragt → zugesagt → übergeben` bzw. terminal `abgelehnt`, `abgebrochen`, `zurückgezogen` (DM-S3). Übergänge sind nur in dieser Richtung erlaubt.

### US-SOZ-11 · Übergabe bestätigen, Bestand und Pokédex nachführen · ⬜
Als **Pflanzenhalter** will ich nach der Übergabe, dass sich meine Daten ohne Handarbeit anpassen.

Akzeptanzkriterien:
- Die Übergabe gilt erst, wenn **beide** Seiten „übergeben ✔" bestätigt haben (kein Zustandswechsel durch nur eine Seite).
- **Beim Geber:** Das Exemplar wird wie in US-BES-07 archiviert (`04-Archive/Pflanzen/`) mit `Archiviert_Am` und `Archiviert_Grund: "Getauscht mit <Anzeigename>"` bzw. `"Verschenkt an <Anzeigename>"`. Es verschwindet damit aus Verteilung, Phasen, Wachstum, Behandlungen und Pokédex-Besitz.
- **Beim Empfänger:** Es entsteht ein neues Exemplar nach den Regeln von US-BES-02/03 (Namensregel, Kennzeichen-Abfrage), `Gefangen_Am` = Übergabedatum (lokal, nicht UTC), `Herkunft` (DM-S4) gesetzt, `Teilen: privat`. Bei Typ `Steckling`/`Ableger` zusätzlich `Status: "Steckling"` und Lampe 1 (US-BES-04); bei `Pflanze` gilt die Lampe der Art.
- Existiert die Art-Notiz beim Empfänger nicht, wird er vor dem Anlegen auf die Art-Vorlage verwiesen (FR-BES-06). Das Exemplar entsteht erst danach.
- Der Empfänger fängt die Art im Pokédex automatisch (US-POK-06); „Neu gefangen" (US-POK-12) greift.
- Das Wachstumslog, die Behandlungen und das Standortfeld des Gebers werden **nicht** mitgegeben; der Empfänger beginnt mit leerem Log.
- Beide Seiten sehen den abgeschlossenen Tausch in der Tauschhistorie (US-SOZ-13) und als Ereignis „Getauscht" im Feed (US-SOZ-05).
- Ist einer der Schritte (Archivieren, Anlegen) nicht ausführbar (z. B. Namenskonflikt), bleibt der Vorgang auf `zugesagt` und meldet den Grund; es entsteht kein halber Zustand mit nur einer Seite.

### US-SOZ-12 · Über Neues benachrichtigt werden · ⬜
Als **Pflanzenhalter** will ich bei Anfragen und Zusagen benachrichtigt werden, ohne ständig nachzusehen.

Akzeptanzkriterien:
- Auslöser: neue Freundschaftsanfrage, Anfrage auf mein Angebot, Zusage/Ablehnung auf meine Anfrage, Gegenseite hat Übergabe bestätigt.
- Neue Feed-Ereignisse (US-SOZ-05) lösen **keine** Einzelbenachrichtigung aus, nur das Banner (US-SOZ-06); sonst würde der Feed zum Lärm.
- Kanal ist der Bot aus Epic MON (US-MON-01): gleiche Regeln (nur bei Handlungsbedarf, Idempotenz je Anlass und Tag). Ohne MON zeigt das Dashboard offene Punkte als Warnblock „📬 Offen".
- Pro Anlass kann der Halter Benachrichtigungen abschalten, ohne die Funktion zu verlieren.

### US-SOZ-13 · Tauschhistorie · ⬜
Als **Pflanzenhalter** will ich nachsehen, was ich mit wem getauscht habe.

Akzeptanzkriterien:
- Block „📜 Tauschhistorie" listet abgeschlossene und abgebrochene Vorgänge: Datum, Freund, was gegeben, was erhalten, Status.
- Die Historie bleibt nach Beenden der Freundschaft erhalten (US-SOZ-03), der Freund erscheint dann mit gespeichertem Anzeigenamen.
- Ein erhaltenes Exemplar verweist über `Herkunft` auf den Vorgang; die Exemplarkarte zeigt „von <Anzeigename>".

## Datenmodell

### DM-S1 Freigabe (Erweiterung DM-02)

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `Teilen` | nein | `privat` (Standard) oder `freunde` |
| `Teilen_Fotos` | nein | `true`/`false`; nur wirksam bei `Teilen: freunde` |

### DM-S2 Angebot (Hub-Datensatz, Spiegel im Vault des Gebers)

`Angebot_Id`, `Geber`, `Art` (lateinisch + deutsch), `Exemplar` (Verweis), `Typ` (`Steckling` | `Pflanze` | `Ableger`), `Modus` (`tauschen` | `abgeben`), `Wunsch`, `Notiz`, `Gesundheit` (abgeleitet), `Status` (`offen` | `reserviert` | `übergeben` | `zurückgezogen`), `Erstellt_Am`.

### DM-S3 Tauschvorgang (Hub-Datensatz)

`Tausch_Id`, `Angebot_Id`, `Anfragender`, `Gegenangebot` (Exemplar-Verweis oder Freitext), `Status` (`angefragt` | `zugesagt` | `übergeben` | `abgelehnt` | `abgebrochen` | `zurückgezogen`), `Bestätigt_Geber`, `Bestätigt_Empfänger` (Datum oder leer), Zeitstempel je Übergang.

### DM-S4 Herkunft (Erweiterung DM-02)

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `Herkunft` | nein | `{Von, Tausch_Id, Datum}`; fehlt bei selbst angeschafften Pflanzen |

Anzeigename statt Hub-Kennung für `Von`, damit die Notiz ohne Hub lesbar bleibt.

### DM-S5 Freundschaft (Hub-Datensatz)

`Freund_Id`, `Anzeigename`, `Status` (`angefragt` | `bestätigt` | `beendet`), `Seit`.

## Anforderungen

| ID | Anforderung | Status |
|---|---|---|
| FR-SOZ-01 | **Privat als Standard:** Ohne Freigabe verlässt kein Exemplar, Foto oder Standort den Vault (US-SOZ-04). | ⬜ |
| FR-SOZ-02 | Der Vault bleibt die Quelle der Wahrheit für die eigene Sammlung; der Hub hält nur Freigaben, Angebote, Vorgänge und Freundschaften. Er ist nicht Voraussetzung, um die übrigen Epics zu nutzen. | ⬜ |
| FR-SOZ-03 | Fällt der Hub aus, bleiben alle bisherigen Dashboard-Blöcke voll nutzbar; soziale Blöcke zeigen den letzten Stand mit Hinweis (NFR-06). | ⬜ |
| FR-SOZ-04 | Zustandsübergänge des Tauschs (DM-S3) und die Ableitung der Feed-Ereignisse liegen als reine Logik ohne Obsidian-API in `soziales-core.js` und sind mit `node --test` getestet, wie `pokedex-core.js` (FR-POK-01, QS-02). | ⬜ |
| FR-SOZ-05 | Übergabe ist atomar aus Sicht der Beteiligten: entweder Archivierung beim Geber **und** Anlegen beim Empfänger, oder `zugesagt` bleibt bestehen (US-SOZ-11). | ⬜ |
| FR-SOZ-06 | Änderungen am Frontmatter laufen weiter über `processFrontMatter`, nie über rohes YAML (Prinzip aus `00-Systemueberblick.md`). | ⬜ |
| FR-SOZ-07 | Keine erfundenen Daten: Datum und Fangstatus kommen aus den freigegebenen Exemplaren, „unbekannt" statt Raten (FR-POK-08). | ⬜ |
| FR-SOZ-08 | Anzeigenamen sind frei wählbar und kein Beleg für Identität; Freundschaft und Tausch erfordern die beidseitige Bestätigung durch die Person. | ⬜ |
| FR-SOZ-09 | **Pflanzenrecht und Gesundheit:** Das System weist beim Anbieten auf Artenschutz (z. B. CITES-gelistete Kakteen und Orchideen) und Schädlingsbefall hin. Es verhindert das Anbieten nicht, ersetzt aber keine rechtliche Prüfung. Versand über Landesgrenzen ist nicht Teil des Systems. | ⬜ |
| FR-SOZ-10 | Löschen: Ein Halter kann seine Hub-Daten (Freundschaften, Angebote, Vorgänge) vollständig löschen. Das Vault-Frontmatter bleibt unberührt. | ⬜ |
| FR-SOZ-11 | Out of Scope: Chat/Nachrichten zwischen Freunden, öffentliche Profile, Bestenlisten, Verkauf gegen Geld, Versandabwicklung, Gruppen. | ⬜ (bewusst) |

## Offene Fragen

1. **Austauschschicht (E-SOZ-01):** Bot als Hub, eigener Server mit Konten oder dateibasierter Sync? Bestimmt Identität, Offline-Verhalten und Aufwand.
2. **Identität:** Wie weist ein Halter sich im Hub aus (Telegram-ID, Konto, Schlüsselpaar)?
3. **Tausch mit Gegenleistung in Geld:** bewusst ausgeschlossen (FR-SOZ-11); bestätigen?
4. **Freigabe-Granularität:** reicht `privat`/`freunde` je Exemplar oder wird eine Freundesgruppe („nur Nahe Freunde") gebraucht?
5. **Mehrere Vault-Nutzer an einem Gerät** sind nicht vorgesehen.
