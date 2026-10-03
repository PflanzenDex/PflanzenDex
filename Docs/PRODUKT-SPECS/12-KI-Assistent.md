# 12 – Epic KI: KI-Zugang (der KI-Client des Halters)

Ziel: Die App hat **keine fest eingebaute KI und keinen Anbieter-Vertrag**. Sie bietet eine offene, authentifizierte Schnittstelle, über die der **KI-Client, den der Halter selbst nutzt** (beliebiger Anbieter), die Operationen der Fachlogik aufrufen kann. Aus der App heraus kann der Halter **Aufträge** an diesen Client stellen. Inhaltliche Ergebnisse kommen als **Entwurf** zurück. **Die KI urteilt, der Code rechnet und schreibt** (P-01, P-03).

Prototyp-Bezug: Im Prototyp arbeitete Claude in Claude Code zu: Art-Notizen aus der Prompt-Vorlage, Wunschlisten-Recherche, Foto-Bewertung, Skripte. Hier werden diese Fähigkeiten über die Schnittstelle zugänglich, ohne dass die App einen KI-Dienst betreibt. Neu sind Pflege per Sprache, Tagesstatus auf Zuruf, Aufträge und Entwürfe.

Technik (Protokoll, Anmeldeverfahren, Hosting der Schnittstelle) steht als Entscheidung in `16-Releases-und-Entscheidungen.md` (E-04, E-19), nicht hier.

## Zugangswege

| Weg                             | Wie                                                                                                                                                                                                                                                                     | Stand                             |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **A · Der Client treibt**       | Der Halter arbeitet in seinem KI-Client; der Client ruft die freigegebenen Operationen auf (US-KI-01, -02, -03, -04, -05).                                                                                                                                              | Teil des Produkts                 |
| **B · Auftrag aus der App**     | Eine Aktion in der App („Artprofil recherchieren", „Vorschläge für Zone holen", „Foto bewerten") erzeugt einen **Auftrag**. Der verbundene Client holt ihn ab und liefert einen **Entwurf** (US-KI-08, -09). Asynchron, nur wirksam, wenn der Client des Halters läuft. | Teil des Produkts                 |
| C · Eingebauter Chat in der App | Chat mit eigenem Schlüssel des Halters (BYOK) über einen anbieterneutralen Adapter.                                                                                                                                                                                     | **nicht Teil**, Entscheidung E-19 |

## Grundregeln

| ID    | Regel                                                                                                                                                                                                                                                                                            |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| KI-R1 | **Operationen statt freiem Schreiben:** Der KI-Client ruft ausschließlich validierende Operationen auf (`standort_setzen`, `messung_eintragen`, `behandlung_planen`, `gegossen`, `status`, `validate`, …). Ungültiges wird abgelehnt und nichts geschrieben.                                     |
| KI-R2 | **Rechnen tut der Code:** Phasen, Raten, Zählungen, Namensregel kommen aus der Fachlogik, nie aus dem Modell. Der Client formuliert nur.                                                                                                                                                         |
| KI-R3 | **Vorschlag, nicht Vollzug:** Inhaltliche Ergebnisse (Artprofil, Foto-Bewertung, Wunschkandidaten, Equipment aus Foto) sind Entwürfe. Der Halter bestätigt in der App (US-KI-09).                                                                                                                |
| KI-R4 | **Nachfragen statt raten:** Bei Mehrdeutigkeit (zwei Exemplare derselben Art) liefert die Operation die Kandidaten und schreibt nichts; der Client fragt den Halter.                                                                                                                             |
| KI-R5 | **Kennzeichnung:** KI-erzeugte Inhalte sind als solche markiert (mit Name der Verbindung), bis ein Mensch sie geprüft hat (FR-BES-06).                                                                                                                                                           |
| KI-R6 | **Nur eigene Daten:** Eine Verbindung sieht die Daten des Kontos, das sie freigegeben hat, nie die anderer Nutzer. Daten von Freunden (Sammlung, Angebote, Feed) sind über Verbindungen **nicht** zugänglich (FR-KI-10); ob das später geöffnet wird, ist eine eigene Entscheidung (P-04, P-05). |
| KI-R7 | **Anbieterunabhängig:** Keine Funktion setzt einen bestimmten KI-Anbieter oder ein bestimmtes Modell voraus. Wer keinen KI-Client verbindet, verliert nichts (FR-KI-05).                                                                                                                         |
| KI-R8 | **Der Server erzwingt, der Client wird nicht vorausgesetzt:** Rechte, Entwurfspflicht und Limits gelten serverseitig, auch wenn der Client keine Rückfrage an den Halter stellt (FR-KI-08).                                                                                                      |
| KI-R9 | **Daten sind keine Anweisungen:** Texte aus Daten (Notizen, Namen, Freundesdaten) werden als Daten ausgeliefert und lösen nie eine Operation aus (FR-KI-07).                                                                                                                                     |

## Userstories

### US-KI-01 · Pflege per Sprache über den KI-Client · ⬜ neu

Als **Pflanzenhalter** will ich Änderungen in natürlicher Sprache in meinem KI-Client eingeben („Aloe steht jetzt unter Lampe 3, 12,5 cm, Foto anbei"), statt Formulare zu bedienen.

Akzeptanzkriterien:

- Gegeben ein verbundener Client mit Recht „schreiben" (US-KI-07), wenn er die Eingabe in Operationen zerlegt, dann ruft er ausschließlich die freigegebenen Operationen aus KI-R1 auf. Bei Recht „Entwürfe" entsteht stattdessen ein Entwurf (US-KI-09).
- Gegeben eine mehrdeutige Eingabe, dann liefert die Operation die Kandidaten und schreibt nichts (KI-R4).
- Gegeben eine ungültige Eingabe (unbekannter Standort, unmögliche Zahl), dann lehnt die Operation ab, liefert einen Fehlercode mit Grund, und es wird nichts geschrieben.
- Jede Operation liefert strukturiert zurück, was geändert wurde; die Aktion erscheint im Protokoll mit „rückgängig" (US-KI-10).

### US-KI-02 · Tagesstatus auf Zuruf · ⬜ neu

Akzeptanzkriterien:

- „Was ist heute fällig?" liefert eine priorisierte Antwort aus der Operation `status` (derselbe Code wie „Heute" und Erinnerungen, FR-MON-03). Der Client formuliert nur.
- Jeder Punkt nennt, was zu tun ist (P-09). Kein Punkt wird erfunden oder weggelassen.

### US-KI-03 · Artprofil als Entwurf liefern · ⬜ (Prototyp ✅)

Als **Pflanzenhalter** will ich für eine unbekannte Art ein vollständiges Profil bekommen.

Akzeptanzkriterien:

- Der Client recherchiert und ruft `artprofil_vorschlagen` mit allen Pflichtfeldern aus DM-BES-01 auf (Lichtzone nach Sättigungspunkt, Ruhephase, Wachstumsmaß, Vergeilung-Anzeichen, Erfolgskriterien, botanische Story). Auslöser ist der Client (Weg A) oder ein Auftrag aus der App (Weg B, US-KI-08).
- Der Server validiert gegen das Schema (P-03); unvollständige Profile werden nicht gespeichert.
- Quellen sind Pflicht; Aussagen ohne Quelle sind als solche gekennzeichnet.
- Das Profil erhält `KI-erstellt, ungeprüft` mit Vermerk der Verbindung und kann nur vom Betreiber oder einem Prüfer auf `geprüft` gesetzt werden (FR-BES-06, FR-KI-09).
- Ohne KI legt der Halter das Profil im Formular an (FR-KI-05, US-BES-01).

### US-KI-04 · Foto qualitativ bewerten lassen · ⬜ (Prototyp ✅)

Akzeptanzkriterien:

- Eine Operation liefert dem Client das bereinigte Foto der Messung (nur Fotos des eigenen Kontos). Der Client schlägt `Qualität` und eine kurze Notiz als Entwurf vor (US-WAC-06, US-KI-09).
- Bewertet wird nur, was sichtbar ist; keine Schätzung von Höhe, Substratfeuchte oder Wurzeln. Fehlt die Grundlage, bleibt die Notiz leer.
- Voraussetzung ist ein Client mit Bildverständnis. Ohne ihn bewertet der Halter selbst (US-WAC-02).

### US-KI-05 · Recherche über den KI-Client (Wunschliste, Equipment, Katalog) · ⬜ (Prototyp ✅)

Akzeptanzkriterien:

- Wunschkandidaten nach US-WUN-04, Equipment-Vorschläge nach FR-EQU-09 und Vorschläge aus dem Katalog nach US-ENT-08 (Operation `vorschlaege`, keine eigene Bewertung) kommen als Entwürfe. Auslöser ist der Client (Weg A) oder ein Auftrag (Weg B).
- Art-Merkmale für Entdecken (DM-ENT-01) liefert der Client nur mit Quelle und als `KI-erstellt, ungeprüft` (FR-BES-06).
- Bild-URLs, Quellen und Lizenzen prüft der **Server** auf Erreichbarkeit und Lizenz (Operation `bildquelle_pruefen`); der Client kann sie nicht als geprüft behaupten.
- Übernahme einzeln in der App (US-KI-09).

### US-KI-06 · Grenzen, Transparenz und Datenschutz · ⬜ neu

Als **Betreiber** will ich die Schnittstellen-Nutzung begrenzen und als **Halter** wissen, wohin meine Daten gehen.

Akzeptanzkriterien:

- Aufrufe sind je Verbindung gemessen; es gibt Rate-Limits je Verbindung und Tag (Startwert Annahme, nachjustierbar) mit klarer Meldung (Fehlercode) bei Erreichen (FR-KI-11).
- Fällt der Client aus, ist keiner verbunden oder ist das Limit erreicht, bleiben alle Formulare nutzbar (FR-KI-05).
- Beim Verbinden nennt die App: Der gewählte KI-Anbieter erhält die Daten, die der Client abruft. Die App selbst sendet nichts an einen KI-Dienst; der Betreiber hat dafür keinen Auftragsverarbeiter (E-04, NFR-11).
- Felder zu Giftigkeit, Artenschutz und Pflanzenmitteln liefern Quelle und Stand oder „unbekannt", nie eine Tatsachenbehauptung ohne Quelle.

### US-KI-07 · KI-Client verbinden und Zugriff verwalten · ⬜ neu

Als **Pflanzenhalter** will ich meinen KI-Client mit meinem Konto verbinden und genau festlegen, was er darf.

Akzeptanzkriterien:

- Verbinden erfolgt über ein etabliertes Freigabeverfahren (OAuth-Autorisierung, E-03/E-04). Die Zustimmungsseite der App nennt Client-Name, angefragte Rechte und was der KI-Anbieter des Halters dadurch sehen kann (US-KI-06).
- Rechte sind Scopes: `lesen`, `Entwürfe anlegen`, `schreiben` (aufsteigend, jedes schließt die niedrigeren ein). Der Halter kann auf der Zustimmungsseite Rechte abwählen. Voreinstellung ist `Entwürfe anlegen`.
- Reicht ein Recht für eine Operation nicht, fordert der Server das nötige Recht gezielt nach (Step-up) und der Halter bestätigt erneut. Es wird nie stillschweigend mehr erlaubt.
- Liste „Verbundene KI-Clients": Name, Rechte, verbunden seit, letzte Nutzung. Widerruf wirkt sofort; ein widerrufener oder abgelaufener Zugang wird abgelehnt.
- Eine Verbindung gehört genau einem Konto (KI-R6). Eine Anleitung zum Verbinden (Kopier-Link, Beispielabläufe) steht in der App.

### US-KI-08 · Aufträge aus der App an den KI-Client · ⬜ neu

Als **Pflanzenhalter** will ich in der App etwas anstoßen, das mein KI-Client erledigt (Weg B).

Akzeptanzkriterien:

- Aktionen in der App erzeugen einen Auftrag mit Typ, Bezug und Status `offen → in Arbeit → erledigt | abgelehnt | abgelaufen` (DM-KI-02). Beispiele: Artprofil recherchieren (US-BES-01), Vorschläge für Zone (US-WUN-02, US-WUN-04), Foto bewerten (US-WAC-06).
- Der verbundene Client holt offene Aufträge über eine Operation ab und liefert das Ergebnis als Entwurf (US-KI-09). Die App zeigt den Status.
- Weil ein Client nicht von selbst aufwacht, bietet jeder Auftrag „In KI-Client öffnen": Die App legt einen fertigen Prompt in die Zwischenablage (bzw. öffnet den Client per Link, wo er das kann). Der Prompt enthält Auftrags-Kennung, Typ, die Anweisung in einfachem Text, den Namen des Bezugs (z. B. Art oder Zone), die Operationen, die der Client aufrufen soll, und den Hinweis, das Ergebnis als Entwurf abzuliefern. Er enthält keine Zugangsdaten und keine Daten, die der Client nicht ohnehin mit seinen Rechten abrufen kann. Der Halter sieht den Text vor dem Kopieren und muss nichts ergänzen.
- Ist kein Client verbunden, nennt die App das und bietet den manuellen Weg sowie „Auftrag als Text kopieren" an. Es entsteht kein stiller Auftrag, der nie bearbeitet wird (P-10).
- Aufträge zum selben Bezug und Typ werden zusammengeführt; Wiederholen ist idempotent (US-QS-03). Ein Auftrag läuft nach 14 Tagen ab (Annahme).

### US-KI-09 · Entwürfe prüfen und übernehmen · ⬜ neu

Als **Pflanzenhalter** will ich jedes KI-Ergebnis prüfen, bevor es zählt (KI-R3).

Akzeptanzkriterien:

- Eingang „Entwürfe" in der App (und in „Hinweise", P-10): je Entwurf Typ, Bezug, Quelle, Verbindung, Zeitpunkt und, wo es einen Vorwert gibt, die Änderung gegenüber dem aktuellen Stand.
- Je Entwurf: übernehmen, ändern und übernehmen, verwerfen. Übernehmen läuft über dieselbe validierende Operation wie das Formular (Datum lokal, `Bewertung_durch: KI-Vorschlag übernommen`).
- Ein Entwurf wird nie automatisch übernommen. Nicht bearbeitete Entwürfe laufen ab und bleiben als verworfen einsehbar.

### US-KI-10 · Protokoll der KI-Aktionen und Rückgängig · ⬜ neu

Als **Pflanzenhalter** will ich nachvollziehen und zurücknehmen können, was der KI-Client getan hat.

Akzeptanzkriterien:

- Jede Operation über eine Verbindung wird protokolliert: Verbindung, Operation, Zeit, Wirkung (DM-KI-04). Das Protokoll enthält keine Inhalte über das Nötige hinaus.
- Der Halter sieht das Protokoll und kann die letzte Aktion je Operation rückgängig machen, wo das fachlich möglich ist (Messung, Standort, Behandlung, Gießen).
- Operationen, die nicht rückholbar sind oder Dritte betreffen, sind für Verbindungen gar nicht freigegeben (FR-KI-10).

## Datenmodell

- **DM-KI-01 Verbindung:** `Konto`, `Client_Name`, `Rechte` (`lesen | entwürfe | schreiben`), `Erstellt_Am`, `Letzte_Nutzung`, `Widerrufen_Am?`.
- **DM-KI-02 Auftrag:** `Konto`, `Typ`, `Bezug` (Verweis), `Status` (`offen | in Arbeit | erledigt | abgelehnt | abgelaufen`), `Erstellt_Am`, `Verbindung?`, `Entwurf?`.
- **DM-KI-03 Entwurf:** `Konto`, `Typ`, `Bezug`, `Inhalt` (nach dem Schema der Zieloperation), `Quelle`, `Verbindung`, `Status` (`offen | übernommen | verworfen | abgelaufen`), `Erstellt_Am`.
- **DM-KI-04 Protokolleintrag:** `Konto`, `Verbindung`, `Operation`, `Zeit`, `Wirkung`, `Rückgängig_Am?`.

## Anforderungen

| ID       | Anforderung                                                                                                                                                                                                                                                                                                                                                          | Status |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| FR-KI-01 | Jede Operation ist ohne KI aufrufbar (Formular, Test) und liefert strukturierte Ausgabe.                                                                                                                                                                                                                                                                             | ⬜     |
| FR-KI-02 | Jede schreibende Operation ist idempotent und validiert ihre Eingabe vollständig.                                                                                                                                                                                                                                                                                    | ⬜     |
| FR-KI-03 | Beschreibungen der Operationen, ihre Schemas und mitgelieferte Hilfstexte (z. B. Profil-Schema, Erfolgskriterien) sind versioniert. Änderungen sind abwärtskompatibel oder erhöhen die Version. **Vertragstests** prüfen Schema, Fehlercodes und feste Beispielabläufe; Prompt-Tests entfallen, weil Prompt und Modell nicht bei uns liegen.                         | ⬜     |
| FR-KI-04 | Die Schnittstelle kennt Zugriffsrechte des Kontos; ein Test belegt, dass eine Verbindung keine Daten anderer Konten lesen kann (NFR-09).                                                                                                                                                                                                                             | ⬜     |
| FR-KI-05 | Es gibt keine KI-Funktion, die nur über KI erreichbar ist. Jede Aktion hat einen manuellen Weg.                                                                                                                                                                                                                                                                      | ⬜     |
| FR-KI-06 | Anbieterneutral: Die Schnittstelle folgt einem offenen Standard; ein Konformanztest läuft gegen mindestens zwei verschiedene Clients (Annahme). Keine Funktion hängt an Eigenheiten eines Anbieters.                                                                                                                                                                 | ⬜     |
| FR-KI-07 | **Prompt-Injection:** Freitexte aus Daten (Notizen, Anzeigenamen, Freundesdaten) werden als Daten gekennzeichnet ausgeliefert. Keine Operation mit Nebenwirkung hängt vom Inhalt solcher Felder ab; die Rechte sind durch die Whitelist in FR-KI-10 begrenzt.                                                                                                        | ⬜     |
| FR-KI-08 | Rechte, Entwurfspflicht für inhaltliche Ergebnisse und Rate-Limits werden serverseitig erzwungen, unabhängig davon, ob der Client eine Bestätigung einholt.                                                                                                                                                                                                          | ⬜     |
| FR-KI-09 | Der Betreiber nutzt dieselbe Schnittstelle mit eigenem Betreiber-Recht (z. B. Katalog-Batches, Merkmale). Eine Verbindung kann nie `geprüft` setzen.                                                                                                                                                                                                                 | ⬜     |
| FR-KI-10 | **Nicht über Verbindungen freigegeben:** Daten von Freunden (Sammlung, Angebote, Feed), Freundschaft, Freigaben (`Teilen`), Tauschzusage und -übergabe, Konto löschen oder exportieren, Verbindungen verwalten, Partner- und Empfehlungsdaten.                                                                                                                       | ⬜     |
| FR-KI-11 | Rate-Limits je Verbindung; der Betreiber sieht Nutzung und Last je Verbindung, keine Inhalte (NFR-16, NFR-18).                                                                                                                                                                                                                                                       | ⬜     |
| FR-KI-12 | Jede freigegebene Operation hat genau eine Klasse: `lesen`, `Entwurf`, `schreiben (rückholbar)` oder `nie freigegeben` (FR-KI-10). `schreiben` umfasst nur rückholbare Operationen (z. B. gegossen, Standort, Messung, Behandlung abhaken). Die Zuordnung steht an einer Stelle; ein Test prüft, dass jede Operation eine Klasse hat und die Klasse zum Scope passt. | ⬜     |
| FR-KI-13 | Die Autorisierung der Schnittstelle nutzt den Anmeldedienst (E-03) als Autorisierungsserver; die App baut keinen eigenen. Es gibt keine langlebigen persönlichen Zugriffstoken (E-04).                                                                                                                                                                               | ⬜     |

## Out of Scope

Eingebauter Chat mit Betreiber-Kontingent (E-19), Betreiber-Abrechnung von KI-Aufrufen, langlebige persönliche Zugriffstoken, Zugriff auf Freundesdaten über Verbindungen (zunächst), Modellauswahl oder Prompts durch die App, KI-Funktionen für Freunde-Sichten.

## Offene Fragen

1. **Client-Tests (E-04):** Welche Clients beherrschen Client-ID-Metadata-Dokumente bzw. Dynamic Client Registration, Step-up und Bildinhalte? Belegt ist Remote-Unterstützung für Claude und ChatGPT (jeweils bezahlte Pläne); Gemini ist ungeprüft. Vor R4 an realen Clients testen.
2. **Eingebauter Chat (E-19):** später ergänzen, wenn Weg A und B nicht reichen?
3. **Freundesdaten über KI:** später öffnen? Wenn ja, mit welchen Schutzmaßnahmen gegen Injection (FR-KI-07)?
4. Wie viele Clients sollen vor R4 real getestet werden (FR-KI-06)?
5. **Zustimmung ohne Abwahl einzelner Rechte:** Keycloaks Standard-Zustimmungsseite kennt nur „Ja" oder „Nein" für alle angefragten Scopes (Spike TE-15). US-KI-07 verlangt die Abwahl einzelner Rechte. Entweder ein eigener Zustimmungsschritt (Theme oder eigener Dialog) oder Anpassung der Story.
