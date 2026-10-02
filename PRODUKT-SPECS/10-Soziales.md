# 10 – Epic SOZ: Soziales (Freunde, Feed, Tauschen)

Ziel: Sammeln und Pflegen wird gemeinsam. Der Pflanzenhalter sieht, was Freunde Neues gesammelt haben, und kann Pflanzen und Stecklinge tauschen, ohne dass seine Sammlung öffentlich wird.

Ablösung: ersetzt `../PFLANZENSYSTEM-SPECS/11-Soziales.md`. Wegfall: der „Hub" als getrennte Austauschschicht und die Vorgabe, der Vault bleibe Wahrheit. In der App sind Freunde, Freigaben und Tausch **eingebaute Funktionen** auf gemeinsamer Datenhaltung. Das vereinfacht die Übergabe erheblich (eine Transaktion statt Abgleich zweier Vaults).

## Begriffe

| Begriff | Bedeutung |
|---|---|
| Freund | Anderer Halter mit **bestätigter** Freundschaft (beidseitig). |
| Freigabe | Pro Exemplar: `privat` (Standard) oder `freunde`. |
| Angebot | Exemplar oder Steckling, das ein Halter Freunden zum Tausch oder zur Abgabe anbietet. |
| Tausch | Vorgang Anfrage → Zusage → Übergabe. Abgabe ohne Gegenstück („verschenken") ist ein Tausch ohne Gegenleistung. |
| Herkunft | Vermerk am Exemplar des Empfängers: von wem, wann. |

## Userstories

### US-SOZ-01 · Freundschaft anfragen · ⬜ neu
Akzeptanzkriterien:
- „Freund einladen" erzeugt einen Einladungslink bzw. -code, den ich außerhalb der App weitergebe.
- Löst jemand ihn ein (mit oder ohne bestehendes Konto), geht beim Einladenden eine Anfrage mit dem Anzeigenamen ein. Noch keine Freundschaft.
- Ein Code ist einmalig und läuft nach 7 Tagen ab; abgelaufene oder benutzte Codes werden klar abgelehnt.
- Keine Selbsteinladung; eine doppelte Anfrage erzeugt keine zweite.
- Es gibt keine offene Nutzersuche; Freunde finden sich nur über Einladung (FR-SOZ-08).

### US-SOZ-02 · Freundschaftsanfrage beantworten · ⬜ neu
Akzeptanzkriterien:
- Offene Anfragen erscheinen in der App und als Benachrichtigung (US-SOZ-12).
- Annehmen macht die Freundschaft beidseitig wirksam. Ablehnen verwirft still; die Gegenseite erfährt nur „nicht angenommen".
- Vor Annahme ist nur der Anzeigename sichtbar, keine Sammlung.

### US-SOZ-03 · Freunde verwalten und Freundschaft beenden · ⬜ neu
Akzeptanzkriterien:
- „Freunde": Liste mit Anzeigename, Beginn, Zahl der freigegebenen gefangenen Arten.
- Beenden entzieht beiden Seiten sofort Sammlung, Feed und Angebote. Eigene Daten und abgeschlossene Tausche (inkl. Herkunft) bleiben.
- Offene Tauschanfragen mit der Person werden abgebrochen (`abgebrochen`). Die Gegenseite wird nicht aktiv benachrichtigt.

### US-SOZ-04 · Selbst bestimmen, was Freunde sehen · ⬜ neu
Akzeptanzkriterien:
- Je Exemplar: `Teilen = privat | freunde` (Standard privat) und `Teilen_Fotos = an | aus`.
- Privat heißt: nicht in der Sammlung, nicht im Feed, nicht in Zählungen von Freunden.
- Geteilt werden höchstens Art (lateinisch + deutsch), Exemplarname, Gefangen-Datum, Status (Steckling ja/nein), das jüngste Foto (nur bei `Teilen_Fotos`). **Nie** geteilt: Standort, Messnotizen, Behandlungen, Kennzeichen, Preise, Wunschliste, Finanzdaten.
- Globaler Schalter „Alles privat" setzt alle Freigaben aus, ohne sie zu löschen.
- Zurücknehmen wirkt sofort für künftige Abrufe. Was schon ausgeliefert wurde, lässt sich nicht zurückholen (Hinweis im Dialog).
- Sammelaktion: „Alle Exemplare dieser Art teilen".

### US-SOZ-05 · Sehen, welche neuen Pflanzen Freunde gesammelt haben · ⬜ neu
Akzeptanzkriterien:
- Block „Neu bei Freunden": Ereignisse, neueste zuerst, je Ereignis: Freund, Art, Datum, ggf. Foto, Typ.
- Typen: **Neue Art gefangen** (die Art war beim Freund noch nicht im Pokédex), **Neues Exemplar**, **Neuer Steckling**, **Eingetopft**, **Getauscht** (nur wenn ich beteiligt bin oder beide Beteiligte meine Freunde sind).
- Nur Exemplare mit `Teilen = freunde` erzeugen Ereignisse. Das Datum ist `Gefangen_Am`, sonst „unbekannt" (nie geraten, P-08).
- Das Freigeben eines alten Exemplars erzeugt **kein** Ereignis „heute neu", sondern trägt sein tatsächliches Datum.
- Ereignisse sind nach Art, Freund und Tag zusammengefasst („N Exemplare").
- Standardzeitraum 30 Tage. Filter: nach Freund, nur „Neue Art".

### US-SOZ-06 · „Neu bei Freunden" seit meinem letzten Besuch · ⬜ neu
Akzeptanzkriterien:
- Zustand „gesehen" je Konto serverseitig; beim ersten Besuch stilles Anlegen, kein Banner.
- Banner „Freunde haben N neue Pflanzen: …" bleibt bis „Okay".
- Fehlen die Daten (kein Netz), zeigt der Block den letzten Stand mit „Stand TT.MM.JJJJ" (FR-SOZ-03).

### US-SOZ-07 · Sammlung eines Freundes ansehen und vergleichen · ⬜ neu
Akzeptanzkriterien:
- Die freigegebene Sammlung erscheint als Sammelkarten im Stil von US-POK-01; „gefangen" heißt: der Freund hat ein freigegebenes aktives Exemplar.
- Je Karte „du hast sie" oder „fehlt dir" (aus meinem Besitz, US-POK-06). Filter „Fehlt mir", „Haben wir beide".
- Kein Rang- oder Bestenlistenvergleich (FR-POK-11). Gezeigt werden Fakten, keine Wertung.
- Geteiltes Equipment erscheint als Geräteliste des Freundes (US-EQU-12).

### US-SOZ-08 · Pflanze oder Steckling zum Tausch anbieten · ⬜ neu
Akzeptanzkriterien:
- Aus der Exemplarkarte „Zum Tausch anbieten" erzeugt ein Angebot: `Art`, Exemplar, `Typ` (`Steckling | Pflanze | Ableger`), `Modus` (`tauschen | abgeben`), optional `Wunsch` und `Notiz`.
- Sichtbar nur für Freunde. Ein Exemplar hat höchstens ein offenes Angebot.
- Anbieten setzt `Teilen = freunde` voraus; sonst bietet der Dialog an, die Freigabe zu setzen.
- **Gesundheitsangabe:** automatisch „Behandlung offen" bzw. „zuletzt behandelt: Grund, Datum" aus den Behandlungen, ohne Mittel und Notizen. Ein Exemplar mit offener Schädlingsbehandlung wird nur nach ausdrücklicher Bestätigung angeboten.
- Phasen-Hinweis „aktuell Ruhephase", falls zutreffend.
- Hinweis auf Artenschutz (z. B. CITES-gelistete Kakteen/Orchideen) beim Anbieten (FR-SOZ-09).
- Zurückziehen jederzeit (`zurückgezogen`); offene Anfragen werden abgebrochen.

### US-SOZ-09 · Angebote von Freunden sehen und anfragen · ⬜ neu
Akzeptanzkriterien:
- „Tauschbörse": offene Angebote aller Freunde mit Art, Typ, Modus, Gesundheitsangabe, Foto (falls freigegeben), Chip „fehlt dir".
- Filter: Lichtzone der Art (passt zu meiner Verteilung, US-LIC-02), „fehlt dir", Typ.
- „Anfragen" erzeugt einen Tausch. Bei `tauschen` kann ich ein eigenes Exemplar mit `Teilen = freunde` als Gegenangebot beilegen oder die Gegenleistung offen lassen (Freitext).
- Pro Angebot nur eine offene Anfrage von mir; eigene Angebote nicht anfragbar.
- Steht die Art auf meiner **Wunschliste**, erscheint ein Hinweis; die Liste selbst wird nicht übertragen (FR-WUN-07).

### US-SOZ-10 · Tauschanfrage beantworten · ⬜ neu
Akzeptanzkriterien:
- Aktionen: **Zusagen**, **Ablehnen** (optional mit Grund), **Anderes vorschlagen** (Gegenangebot ändern).
- Zusagen setzt das Angebot auf `reserviert`; weitere Anfragen auf dasselbe Angebot werden automatisch abgelehnt („schon vergeben").
- Wird eine Zusage vor der Übergabe zurückgenommen, geht das Angebot auf `offen` zurück; die Gegenseite wird benachrichtigt.
- Zustände genau `angefragt → zugesagt → übergeben`, terminal `abgelehnt`, `abgebrochen`, `zurückgezogen`. Übergänge nur in dieser Richtung (DM-SOZ-03).

### US-SOZ-11 · Übergabe bestätigen, Bestand und Pokédex nachführen · ⬜ neu
Akzeptanzkriterien:
- Die Übergabe gilt erst, wenn **beide** Seiten „übergeben" bestätigt haben.
- **Geber:** Das Exemplar wird archiviert (US-BES-07) mit `Archiviert_Grund: „Getauscht mit <Anzeigename>"` bzw. `„Verschenkt an <Anzeigename>"`. Es fehlt damit in Verteilung, Phasen, Pokédex-Besitz.
- **Empfänger:** Ein neues Exemplar entsteht nach den Regeln von US-BES-02/03 (Namensregel, Kennzeichen), `Gefangen_Am` = Übergabedatum (lokal), `Herkunft` gesetzt, `Teilen = privat`. Bei `Steckling`/`Ableger`: `Status = Steckling` und Stecklingslicht (US-BES-04); bei `Pflanze` gilt die Zone der Art.
- Der Empfänger fängt die Art im Pokédex automatisch; „Neu gefangen" greift (US-POK-12).
- Messungen, Behandlungen und Standort des Gebers werden **nicht** mitgegeben; der Empfänger beginnt mit leerer Historie.
- Beide sehen den Tausch in der Historie (US-SOZ-13) und als Ereignis „Getauscht" im Feed.
- **Atomar:** Archivieren und Anlegen laufen in einer Transaktion. Schlägt eines fehl (z. B. Namenskonflikt), bleibt der Tausch auf `zugesagt` und meldet den Grund; es entsteht nie ein halber Zustand (FR-SOZ-05).

### US-SOZ-12 · Über Neues benachrichtigt werden · ⬜ neu
Akzeptanzkriterien:
- Auslöser: neue Freundschaftsanfrage, Anfrage auf mein Angebot, Zusage/Ablehnung auf meine Anfrage, Gegenseite hat Übergabe bestätigt.
- Neue Feed-Ereignisse lösen **keine** Einzelmeldung aus, nur das Banner (US-SOZ-06).
- Zustellung nach den Regeln aus Epic MON (US-MON-01, -08): nur bei Handlungsbedarf, einmal je Anlass und Tag. Ohne Push zeigt „Heute" offene Punkte.

### US-SOZ-13 · Tauschhistorie · ⬜ neu
Akzeptanzkriterien:
- „Tauschhistorie": abgeschlossene und abgebrochene Vorgänge mit Datum, Freund, gegeben/erhalten, Status.
- Die Historie bleibt nach dem Beenden der Freundschaft; der Freund erscheint mit dem gespeicherten Anzeigenamen.
- Ein erhaltenes Exemplar zeigt „von <Anzeigename>" (Herkunft).

## Datenmodell

### DM-SOZ-01 Freundschaft
`Konto A`, `Konto B`, `Status` (`angefragt | bestätigt | beendet`), `Seit`, gespeicherte Anzeigenamen beider Seiten.

### DM-SOZ-02 Angebot
`Geber`, `Exemplar`, `Typ`, `Modus`, `Wunsch`, `Notiz`, `Gesundheit` (abgeleitet), `Status` (`offen | reserviert | übergeben | zurückgezogen`), `Erstellt_Am`.

### DM-SOZ-03 Tausch
`Angebot`, `Anfragender`, `Gegenangebot` (Exemplar oder Freitext), `Status` (`angefragt | zugesagt | übergeben | abgelehnt | abgebrochen | zurückgezogen`), `Bestätigt_Geber`, `Bestätigt_Empfänger`, Zeitstempel je Übergang.

### DM-SOZ-04 Ereignis (abgeleitet)
`Konto`, `Typ`, `Art`, `Exemplar`, `Datum`, `Foto?`. Wird aus freigegebenen Exemplaren berechnet, nicht frei gepflegt (NFR-04).

## Anforderungen

| ID | Anforderung | Status |
|---|---|---|
| FR-SOZ-01 | **Privat als Standard:** Ohne Freigabe verlässt kein Exemplar, Foto oder Standort das Konto (P-05). | ⬜ |
| FR-SOZ-02 | Alle sozialen Daten liegen in der gemeinsamen Datenhaltung der App; es gibt keinen getrennten „Hub" mehr. Zugriff nur über Konto und Freundschaft (NFR-09). | ⬜ |
| FR-SOZ-03 | Fällt eine Datenquelle aus (kein Netz), zeigen soziale Blöcke den letzten Stand mit Hinweis. | ⬜ |
| FR-SOZ-04 | Tauschzustände, Freigabe-Filter und Feed-Ableitung sind reine Logik mit Tests (P-01). | ⬜ |
| FR-SOZ-05 | Übergabe ist atomar: Archivierung beim Geber und Anlegen beim Empfänger in einer Transaktion. | ⬜ |
| FR-SOZ-06 | Änderungen laufen nur über validierende Operationen (P-03). | ⬜ |
| FR-SOZ-07 | Keine erfundenen Daten: Datum und Fangstatus kommen aus freigegebenen Exemplaren; „unbekannt" statt Raten (P-08). | ⬜ |
| FR-SOZ-08 | Anzeigenamen sind frei wählbar und kein Beleg für Identität. Freundschaft und Tausch erfordern die beidseitige Bestätigung der Person; keine offene Nutzersuche. | ⬜ |
| FR-SOZ-09 | **Pflanzenrecht und Gesundheit:** Hinweise auf Artenschutz und Schädlingsbefall beim Anbieten. Sie verhindern das Anbieten nicht und ersetzen keine rechtliche Prüfung. Versand über Landesgrenzen ist nicht Teil des Systems. | ⬜ |
| FR-SOZ-10 | Löschung: Ein Halter kann seine sozialen Daten vollständig löschen und exportieren (US-ACC-04). Abgeschlossene Tausche bleiben beim Partner mit gespeichertem Anzeigenamen. | ⬜ |
| FR-SOZ-11 | Out of Scope: Chat zwischen Freunden, öffentliche Profile, Bestenlisten, Verkauf gegen Geld, Versandabwicklung, Gruppen. | ⬜ (bewusst, siehe E-07) |

## Offene Fragen

1. Reicht `privat`/`freunde` je Exemplar oder braucht es Freundesgruppen („nahe Freunde")?
2. Soll es später eine **Kommentar-/Fragefunktion** am Angebot geben (statt externer Absprache)? Bewusst Out of Scope, solange kein Chat da ist.
3. Verkauf gegen Geld bewusst ausgeschlossen; bestätigen (E-07).
