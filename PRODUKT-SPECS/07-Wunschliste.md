# 07 – Epic WUN: Wunschliste und Anschaffungsplanung

Ziel: Neue Pflanzen werden dort angeschafft, wo im Lichtsystem Platz ist, und die Kandidatenliste läuft nicht unbemerkt leer.

Prototyp-Bezug: Epic WUN. Unterschiede: Kauf führt geführt zur Pflanze (löst B-09), Bilder werden lokal gesichert statt gehotlinkt, Equipment-Kandidaten kommen dazu (Epic EQU).

## Userstories

### US-WUN-01 · Kandidaten nach Platzbedarf priorisiert sehen · ⬜ (Prototyp ✅)
Akzeptanzkriterien:
- Gezeigt werden offene Kandidaten (`Status: Wunschliste`), sortiert aufsteigend nach Bestand der jeweiligen Ziel-Lichtzone (Exemplar-Zählung, Zonen 2–4; unbekannte Zone zuletzt).
- Je Kandidat: Foto mit Quelle, „Deutsch (Name)", Ziel-Zone mit aktuellem Bestand („— N Pflanzen"), Schwierigkeit, Begründung, Aktionen.
- Ohne offene Kandidaten: „Keine offenen Kandidaten in der Wunschliste."

### US-WUN-02 · Vor leerer Liste gewarnt werden · ⬜ (Prototyp ✅)
Akzeptanzkriterien:
- Je Zone 2–4 sollen mindestens **2** offene Kandidaten vorliegen (Puffer, einstellbar).
- Unterschreitet eine Zone den Puffer, erscheint eine Warnung „Nachschub nötig: <Zone> (N offene Kandidaten)" mit den Aktionen „Entdecken für <Zone>" (US-ENT-07) und „Vorschläge holen" (US-WUN-04).
- Die Warnung kann als Erinnerung kommen (US-MON-01).

### US-WUN-03 · Kauf festhalten · ⬜ (Prototyp ✅)
Akzeptanzkriterien:
- „Gekauft" setzt `Status: Gekauft` und blendet den Kandidaten aus der Liste, bleibt aber in der Historie.
- Danach folgt der geführte Weg zur Pflanze (US-WUN-05).

### US-WUN-04 · Neue Kandidaten recherchieren lassen · ⬜ (Prototyp ✅)
Als **Pflanzenhalter** will ich Vorschläge, die zur Zone passen.

Akzeptanzkriterien:
- Anfrage: Zielzone, Anzahl, Ausschluss (Bestand und bestehende Kandidaten werden automatisch ausgeschlossen).
- Der KI-Assistent (US-KI-05) liefert Vorschläge, bei denen der botanische Lichtbedarf zur Zone **passt** (nicht nur toleriert), mit kurzer Begründung (CAM, Herkunft, Blattmorphologie).
- Bild und Bildquelle werden auf Erreichbarkeit und Lizenz geprüft, nicht geraten; Bilder werden mit Quelle gesichert.
- Vorschläge erscheinen als Entwurf; der Halter übernimmt oder verwirft einzeln.

### US-WUN-05 · Vom Kauf zur Pflanze kommen · ⬜ (Prototyp 🟡)
Als **Pflanzenhalter** will ich nach dem Kauf möglichst wenige Schritte bis zum Exemplar.

Akzeptanzkriterien:
- Nach „Gekauft" öffnet sich das Anlegen eines Exemplars mit vorausgewählter Art (aus dem Katalog; fehlt sie, startet US-BES-01 mit dem Namen).
- Der Wunschlisteneintrag wird mit dem Exemplar verknüpft („gekauft → Exemplar").
- Preis und Kaufdatum gehen, falls erfasst, an die Finanzen/Kostenansicht (US-EQU-09); fehlen sie, wird nichts erfunden.
- `Verworfen` lässt sich per Aktion setzen.

## Datenmodell

### DM-WUN-01 Wunsch

`Name`, `Deutsch`, `Art?` (Verweis in den Katalog), `Ziel_Lichtzone`, `Schwierigkeit` (Zahl 1–3), `Begründung`, `Bild`, `Bildquelle`, `Lizenz`, `Typ` (`Pflanze` | `Equipment`), `Status` (`Wunschliste` | `Gekauft` | `Verworfen`), `Exemplar?` (Verweis nach Kauf), `Quelle` und `Entschieden_Am` (DM-ENT-02).

Neue Wünsche entstehen auch per Ja/Nein in Entdecken (`17-Entdecken.md`); `Verworfen` ist dort eine eigene Entscheidung und Lernsignal (US-ENT-05).

## Anforderungen

| ID | Anforderung | Status |
|---|---|---|
| FR-WUN-01 | Wünsche haben ein festes Format nach DM-WUN-01. | ⬜ |
| FR-WUN-02 | Als „offen" gilt ausschließlich `Status = Wunschliste`. | ⬜ |
| FR-WUN-03 | Die Zielzone muss eine Zone 2–4 des Kontos sein, sonst wird der Wunsch in Zählung und Puffer nicht berücksichtigt und erscheint in „Hinweise" (P-10). | ⬜ |
| FR-WUN-04 | `Schwierigkeit` ist überall dieselbe Zahl 1–3 (löst B-05). | ⬜ |
| FR-WUN-05 | Wunschliste und Pokédex sind **verknüpft**: Ein Wunsch mit Art zeigt, ob die Art noch fehlt (neu gegenüber dem Prototyp, löst B-09). | ⬜ |
| FR-WUN-06 | Doppelte Namen werden beim Anlegen abgelehnt; Statusänderungen adressieren über Kennung. | ⬜ |
| FR-WUN-07 | Die Wunschliste ist privat. Nur durch Freigabe des Halters sichtbar; Tauschangebote von Freunden, die eine Wunschart betreffen, erscheinen als Hinweis (US-SOZ-09), ohne die Liste offenzulegen. | ⬜ |
