# 12 – Epic KI: KI-Assistent

Ziel: Die KI ist ein Eingang in die App, nicht ihr Kern. Sie nimmt Freitext und Fotos entgegen, recherchiert und schlägt vor. **Die KI urteilt, der Code rechnet und schreibt** (P-01, P-03).

Prototyp-Bezug: Im Prototyp arbeitete Claude in Claude Code zu: Art-Notizen aus der Prompt-Vorlage, Wunschlisten-Recherche, Foto-Bewertung, Skripte. Hier werden diese Fähigkeiten Teil der App. Neu sind Pflege per Sprache und Tagesstatus auf Zuruf.

## Grundregeln

| ID | Regel |
|---|---|
| KI-R1 | **Operationen statt freiem Schreiben:** Die KI ruft ausschließlich validierende Operationen auf (`standort_setzen`, `messung_eintragen`, `behandlung_planen`, `gegossen`, `status`, `validate`, …). Ungültiges wird abgelehnt und nichts geschrieben. |
| KI-R2 | **Rechnen tut der Code:** Phasen, Raten, Zählungen, Namensregel kommen aus der Fachlogik, nie aus dem Modell. Die KI formuliert nur. |
| KI-R3 | **Vorschlag, nicht Vollzug:** Inhaltliche Ergebnisse (Artprofil, Foto-Bewertung, Wunschkandidaten, Equipment aus Foto) sind Entwürfe. Der Halter bestätigt. |
| KI-R4 | **Nachfragen statt raten:** Bei Mehrdeutigkeit (zwei Exemplare derselben Art) fragt die KI. |
| KI-R5 | **Kennzeichnung:** KI-erzeugte Inhalte sind als solche markiert, bis ein Mensch sie geprüft hat (FR-BES-06). |
| KI-R6 | **Nur eigene Daten:** Die KI sieht die Daten des fragenden Kontos, nie die anderer Nutzer. Freigegebene Freundesdaten nur im Umfang der Freigabe (P-04, P-05). |

## Userstories

### US-KI-01 · Pflege per Sprache · ⬜ neu
Als **Pflanzenhalter** will ich Änderungen in natürlicher Sprache eingeben („Aloe steht jetzt unter Lampe 3, 12,5 cm, Foto anbei"), statt Formulare zu bedienen.

Akzeptanzkriterien:
- Gegeben eine Freitexteingabe, wenn die KI sie in Operationen zerlegt, dann ruft sie ausschließlich die Operationen aus KI-R1 auf und zeigt vorab, was sie tun wird (Bestätigung bei Schreibaktionen, einstellbar).
- Gegeben eine mehrdeutige Eingabe, dann fragt sie nach (KI-R4).
- Gegeben eine ungültige Eingabe (unbekannter Standort, unmögliche Zahl), dann lehnt die Operation ab, die KI erklärt den Grund, es wird nichts geschrieben.
- Nach jeder Aktion nennt die KI, was geändert wurde, und bietet „rückgängig" (eine Aktion).

### US-KI-02 · Tagesstatus auf Zuruf · ⬜ neu
Akzeptanzkriterien:
- „Was ist heute fällig?" liefert eine priorisierte Antwort aus `status` (derselbe Code wie „Heute" und Erinnerungen, FR-MON-03). Die KI formuliert nur.
- Jeder Punkt nennt, was zu tun ist (P-09). Kein Punkt wird erfunden oder weggelassen.

### US-KI-03 · Artprofil erzeugen · ⬜ (Prototyp ✅)
Als **Pflanzenhalter** will ich für eine unbekannte Art ein vollständiges Profil bekommen.

Akzeptanzkriterien:
- Die KI erzeugt ein Profil mit allen Pflichtfeldern aus DM-BES-01 (Lichtzone nach Sättigungspunkt, Ruhephase, Wachstumsmaß, Vergeilung-Anzeichen, Erfolgskriterien, botanische Story).
- Das Ergebnis wird gegen das Schema validiert (P-03); unvollständige Profile werden nicht gespeichert.
- Quellen werden genannt; Aussagen ohne Quelle sind als solche gekennzeichnet.
- Das Profil erhält `KI-erstellt, ungeprüft` und kann nur vom Betreiber oder einem Prüfer auf `geprüft` gesetzt werden (FR-BES-06).

### US-KI-04 · Foto qualitativ bewerten · ⬜ (Prototyp ✅)
Akzeptanzkriterien: siehe US-WAC-06 (nur sichtbar Prüfbares, Vorschlag für Qualität und Notiz, Halter übernimmt).

### US-KI-05 · Recherche auf Zuruf (Wunschliste, Equipment) · ⬜ (Prototyp ✅)
Akzeptanzkriterien:
- Wunschkandidaten nach US-WUN-04, Equipment-Vorschläge nach FR-EQU-09, Vorschläge aus dem Katalog nach US-ENT-08 (Operation `vorschlaege`, keine eigene Bewertung).
- Art-Merkmale für Entdecken (DM-ENT-01) recherchiert die KI nur mit Quelle und als `KI-erstellt, ungeprüft` (FR-BES-06).
- Bild-URLs, Quellen und Lizenzen werden auf Erreichbarkeit geprüft, nicht geraten.
- Ergebnisse sind Entwürfe; Übernahme einzeln.

### US-KI-06 · Transparenz, Grenzen und Kosten · ⬜ neu
Als **Betreiber** will ich KI-Nutzung begrenzen und ausweisen.

Akzeptanzkriterien:
- Aufrufe je Konto sind gemessen und mit Kosten versehen (NFR-16); es gibt Tageslimits je Konto, mit klarer Meldung bei Erreichen.
- Fällt die KI aus oder ist das Limit erreicht, bleiben alle Formulare nutzbar (kein Funktionszwang über die KI).
- Eingaben und Fotos werden nur zur Bearbeitung der Anfrage an den KI-Dienst gesendet; sie werden nicht zum Training genutzt (Anforderung an den Anbieter, E-04). Die Datenschutzerklärung nennt den Auftragsverarbeiter (NFR-11).
- Die KI gibt keine Rechts-, Medizin- oder Giftigkeitsauskunft als Tatsache aus; bei Fragen zu Pflanzenmitteln, Artenschutz oder Haustieren verweist sie auf Quellen und Fachstellen.

## Anforderungen

| ID | Anforderung | Status |
|---|---|---|
| FR-KI-01 | Jede Operation ist ohne KI aufrufbar (Formular, Test) und liefert strukturierte Ausgabe. | ⬜ |
| FR-KI-02 | Jede schreibende Operation ist idempotent und validiert ihre Eingabe vollständig. | ⬜ |
| FR-KI-03 | KI-Prompts und Operationen sind versioniert; Änderungen an Prompts brauchen Tests anhand fester Beispiele. | ⬜ |
| FR-KI-04 | Die KI-Schicht kennt Zugriffsrechte des Kontos; ein Test belegt, dass sie keine Daten anderer Konten lesen kann (NFR-09). | ⬜ |
| FR-KI-05 | Es gibt keine KI-Funktion, die nur über KI erreichbar ist. Jede Aktion hat einen manuellen Weg. | ⬜ |
