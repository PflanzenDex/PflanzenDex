# 17 – Epic ENT: Entdecken (Swipe-Vorschläge für die Wunschliste)

Ziel: Die Wunschliste füllt sich spielerisch aus dem gemeinsamen Artenkatalog. Vorgeschlagen werden Arten, die zum eigenen Licht passen und zu dem, was beim Halter **tatsächlich gedeiht**. Jede Entscheidung (Ja/Nein) verbessert die nächsten Vorschläge. Damit schließt sich der Kreis Pokédex → Wunsch → Kauf → Exemplar → gefangen.

Prototyp-Bezug: keiner, Idee vom 2026-10-02. Baut auf POK (Katalog, Besitz US-POK-06, Meilensteine US-POK-11), WUN (Wunsch DM-WUN-01, Puffer US-WUN-02), WAC (Trend und Vergeilung US-WAC-03/04), LIC (Verteilung US-LIC-02) und KI (KI-R1 bis KI-R3) auf.

Abgrenzung zu EQU: Ein **Vorschlag** ist eine Art aus dem Katalog, keine Produktempfehlung. Entdecken enthält keine Affiliate- oder Shop-Links (FR-EQU-07 schließt den Pokédex bereits aus, ENT übernimmt das).

## Problem

1. **Nachschub ist Arbeit:** Bei „Nachschub nötig" (US-WUN-02) muss der Halter eine Recherche anstoßen und jeden Vorschlag einzeln prüfen (US-WUN-04). Das braucht einen verbundenen KI-Client (US-KI-08) und Zeit.
2. **Der Katalog bleibt ungenutzt:** Hunderte Arten mit Bild und Text stehen im Pokédex, aber nichts führt sie gezielt zur Wunschliste.
3. **Ablehnungen gehen verloren:** Was der Halter nicht will, wird heute nirgends gelernt.

## Begriffe

| Begriff | Bedeutung |
|---|---|
| Vorschlag | Art aus dem Katalog, die der Halter weder besitzt noch entschieden hat, als Karte im Stil von US-POK-01. |
| Stapel | Begrenzte Folge von Vorschlägen (Startwert 10). Kein Endlos-Feed. |
| Ja / Nein / Später | Auf die Wunschliste / Verworfen / ohne Entscheidung überspringen. |
| Gedeiht | Aktives Exemplar mit mindestens 2 Messungen, Gesamtrate > 0 und letzter Qualität `Gesund` (US-WAC-03/04). Unter 2 Messungen: „unbekannt", nicht „gedeiht nicht". |
| Kümmert | Aktives Exemplar, dessen letzte Messung `Vergeilt/dünn` ist oder dessen Trend „langsamer" zeigt. |
| Grund | Belegbare Begründung aus eigenen Daten, warum eine Karte erscheint. |

## Userstories

### US-ENT-01 · Vorschläge einzeln als Karte sehen · ⬜ neu
Als **Pflanzenhalter** will ich Arten einzeln als große Karte vorgeschlagen bekommen, damit das Füllen der Wunschliste Spaß macht statt Recherche zu sein.

Akzeptanzkriterien:
- Die Karte zeigt Bild mit Quelle und Lizenz (FR-POK-07), Artname, deutschen Namen, Kurztext, Ziel-Lichtzone, Schwierigkeit (★☆☆ … ★★★) und die Merkmale aus DM-ENT-01, sofern bekannt (sonst „unbekannt").
- Unter der Karte stehen 1–3 **Gründe** (US-ENT-03), keine Prozentzahl und kein „Match".
- Aktionen: **Nein** · **Später** · **Ja**, am Handy auch per Wischgeste (links/rechts), immer zusätzlich als Buttons (NFR-13).
- Nach dem letzten Vorschlag: „Für heute durch. N neu auf der Wunschliste." Weitere Vorschläge nur über „Neuer Stapel".
- Ohne Kandidaten: „Keine neuen Vorschläge" mit dem Grund (alles besessen oder entschieden, oder Filter zu eng) und der passenden Aktion (Filter lockern, Art vorschlagen US-BES-01).

### US-ENT-02 · Nur Arten sehen, die in Frage kommen · ⬜ neu
Als **Pflanzenhalter** will ich keine Arten sehen, die ich habe oder schon entschieden habe.

Akzeptanzkriterien (harte Filter vor jeder Bewertung):
- Ausgeschlossen: gefangene Arten (US-POK-06, inkl. Stecklinge), Arten mit eigenem Wunsch beliebigen Status (`Wunschliste`, `Gekauft`, `Verworfen`), Arten ohne Ziel-Lichtzone 2–4, Arten ohne Epitheton.
- Katalogprofile mit Prüfstatus `KI-erstellt, ungeprüft` erscheinen nur mit Kennzeichnung (FR-BES-06).
- Optionale Filter des Halters (DM-ENT-03): Lichtzone, höchste Schwierigkeit, „haustiersicher". Ein Filter auf ein **unbekanntes** Merkmal schließt die Art nicht aus, sondern zeigt „Haustiere: unbekannt" (P-08, P-10).

### US-ENT-03 · Verstehen, warum etwas vorgeschlagen wird · ⬜ neu
Als **Pflanzenhalter** will ich sehen, warum eine Art auftaucht, damit ich den Vorschlägen vertraue.

Akzeptanzkriterien:
- Jeder Grund entspricht einem Bewertungsanteil aus FR-ENT-02 und nennt die eigenen Daten, z. B.:
  - „Lampe 4 hat am wenigsten Pflanzen (1)" (US-LIC-02)
  - „gleiche Familie wie deine *Echeveria*, die gedeiht" (WAC + Taxonomie)
  - „neue Ordnung: bringt dich zum Entdecker-Meilenstein" (US-POK-11)
  - „eine Stufe schwerer als deine bisherigen Erfolge"
  - „du hast 4 Kakteen auf die Wunschliste gelegt" (US-ENT-05)
- Höchstens die 3 stärksten Gründe. Gründe entstehen aus der Fachlogik, nie aus dem Modell (P-01, KI-R2).
- Erkundungs-Vorschläge (US-ENT-06) sind als „mal was anderes" gekennzeichnet.

### US-ENT-04 · Entscheidung landet sofort in der Wunschliste · ⬜ neu
Als **Pflanzenhalter** will ich, dass Ja und Nein ohne weiteres Formular gespeichert werden.

Akzeptanzkriterien:
- **Ja** legt einen Wunsch nach DM-WUN-01 an: `Art` (Katalogverweis), `Name`, `Deutsch`, `Ziel_Lichtzone`, `Schwierigkeit`, `Begründung` (die angezeigten Gründe), `Bild`, `Bildquelle`, `Lizenz`, `Typ: Pflanze`, `Status: Wunschliste`, dazu `Quelle: Entdecken` und `Entschieden_Am` (DM-ENT-02).
- **Nein** legt denselben Wunsch mit `Status: Verworfen` an.
- **Später** schreibt nichts; die Art kann in einem späteren Stapel wieder erscheinen.
- Das Datum ist das lokale Datum des Nutzers (NFR-08). Schreiben nur über die validierende Operation `entscheiden` (P-03).
- Idempotent: Gibt es für die Art schon einen Wunsch, entsteht kein zweiter (FR-WUN-06).
- Eine Fehlentscheidung lässt sich in der Wunschliste ändern (Status zurücksetzen); die Art erscheint dann wieder in Entdecken.

### US-ENT-05 · Vorschläge lernen aus meinen Entscheidungen · ⬜ neu
Als **Pflanzenhalter** will ich, dass meine Entscheidungen die nächsten Vorschläge verändern.

Akzeptanzkriterien:
- Vorlieben werden bei jedem Stapel **live** aus den eigenen Wünschen abgeleitet (`Wunschliste`/`Gekauft` = ja, `Verworfen` = nein) und nicht als zweite Kopie gespeichert (NFR-04).
- Je Merkmalswert (Familie, Gattung, Lichtzone, Schwierigkeit, Merkmale aus DM-ENT-01) gilt der Vorliebe-Faktor `(ja + 1) / (nein + 1)`. Ohne Entscheidungen ist jeder Faktor 1.
- Wünsche aus anderen Quellen (KI-Recherche, manuell) zählen als „ja", weil der Halter sie bewusst übernommen hat.
- Beispiel: Nach 5× Nein bei Crassulaceae und 0× Ja sinkt der Familienfaktor auf 1/6. Crassulaceae erscheinen deutlich seltener, aber nicht nie (US-ENT-06).
- Nur die eigenen Entscheidungen zählen; Entscheidungen anderer Nutzer fließen nicht ein (FR-ENT-07).

### US-ENT-06 · Auch Überraschendes sehen · ⬜ neu
Als **Pflanzenhalter** will ich ab und zu etwas außerhalb meines Musters sehen, damit der Katalog nicht auf eine Ecke schrumpft.

Akzeptanzkriterien:
- Je Stapel sind 2 von 10 Karten (Startwerte) Erkundungs-Vorschläge: Arten aus Ordnungen oder Familien ohne gefangene Art, Ordnungen mit den wenigsten Arten zuerst (wie *Entdecker*, US-POK-11).
- Harte Filter (US-ENT-02) gelten auch hier.
- Die Auswahl ist pro Konto, Tag und Stapel-Nummer fest, damit ein Neuladen denselben Stapel zeigt (FR-ENT-05).

### US-ENT-07 · Aus der Puffer-Warnung direkt entdecken · ⬜ neu
Als **Pflanzenhalter** will ich bei „Nachschub nötig" sofort passende Vorschläge sehen.

Akzeptanzkriterien:
- Die Puffer-Warnung (US-WUN-02) bietet neben „Vorschläge holen" (KI-Recherche, US-WUN-04) die Aktion „Entdecken für <Zone>", die einen Stapel mit Filter auf diese Zone öffnet.
- Reicht der Katalog für die Zone nicht (weniger Kandidaten als der Puffer nach Filtern), sagt die Ansicht das und bietet die KI-Recherche bzw. „Art vorschlagen" (US-BES-01) an. Neu recherchierte Arten gehen über den Katalog (US-POK-02), nicht an ihm vorbei.

### US-ENT-08 · Vorschläge über den KI-Client · ⬜ neu
Als **Pflanzenhalter** will ich fragen können „Was passt als Nächstes zu mir?" und dieselben Vorschläge bekommen wie in der Ansicht.

Akzeptanzkriterien:
- Der KI-Client ruft die Operation `vorschlaege` auf und gibt Reihenfolge und Gründe wieder; er bewertet nicht selbst (KI-R1, KI-R2).
- „Ja" oder „Nein" im Gespräch ruft `entscheiden` auf (Recht „schreiben", sonst Entwurf), mit derselben Wirkung wie US-ENT-04.
- Ergänzt der Client Wissen zur Art, kennzeichnet er, was nicht aus dem Katalog stammt (KI-R5).
- Entdecken funktioniert vollständig ohne KI (FR-KI-05).

## Datenmodell

### DM-ENT-01 Art-Merkmale (Erweiterung DM-BES-01)

Optionale Katalogfelder. Weil der Katalog gemeinsam ist, profitieren alle Nutzer von einer Anreicherung. Jedes gesetzte Feld braucht eine Quelle und unterliegt dem Prüfstatus (FR-BES-06).

| Feld | Werte | Bedeutung |
|---|---|---|
| Luftfeuchte | `niedrig` / `mittel` / `hoch` | Bedarf an relativer Luftfeuchte |
| Temperatur min. | Zahl (°C) | Mindesttemperatur |
| Braucht Ruhephase | ja / nein | abgeleitet aus Ruhephase von/bis, sofern gepflegt |
| Wuchsgröße | `klein` / `mittel` / `groß` | Platzbedarf in der Lichtzone |
| Giftig für Haustiere | ja / nein | für den Filter „haustiersicher"; Quelle Pflicht, keine KI-Aussage als Tatsache (US-KI-06) |
| Merkmal-Quelle | Link/Werk | Beleg je Eintrag |

### DM-ENT-02 Entscheidung (Erweiterung DM-WUN-01)

| Feld | Pflicht | Bedeutung |
|---|---|---|
| Quelle | ja | `Entdecken`, `KI-Recherche`, `manuell`, `Pokédex` (Aktion an der Karte, US-POK-09) |
| Entschieden_Am | nein | Lokales Datum der Ja/Nein-Entscheidung |

### DM-ENT-03 Entdecken-Einstellungen (je Konto)

`Stapelgröße` (Startwert 10), `Erkundung je Stapel` (Startwert 2), `Höchste Schwierigkeit` (leer), `Haustiersicher` (aus). Startwerte sind Annahmen und nachjustierbar.

## Anforderungen

| ID | Anforderung | Status |
|---|---|---|
| FR-ENT-01 | Auswahl, Bewertung, Gründe und Vorlieben sind reine Fachlogik ohne I/O mit Tests (P-02, P-06). Ansicht, KI-Client und spätere Clients nutzen dieselbe Logik. | ⬜ |
| FR-ENT-02 | **Bewertung** je Kandidat = Produkt der Vorliebe-Faktoren (US-ENT-05) × Summe der Anteile: **Platz** (Zone mit wenigen Exemplaren, US-LIC-02), **Nähe zu Gedeihendem** (gleiche Gattung > Familie > Ordnung wie ein Exemplar, das gedeiht; gleiche Zone; passende Merkmale aus DM-ENT-01), **Pokédex** (neue Familie/Ordnung oder fehlende Art eines offenen Meilensteins, US-POK-11), **Wachstum** (Schwierigkeit höchstens eine Stufe über dem Schwersten, das gedeiht). Gewichte sind Startwerte (Annahme) und konfigurierbar. | ⬜ |
| FR-ENT-03 | Nähe zu Exemplaren, die **kümmern**, gibt keinen Bonus. Ohne Messdaten zählt ein Exemplar nur als Besitz, nicht als Erfolg. Kein Vergleich mit Artdurchschnitten (P-08). | ⬜ |
| FR-ENT-04 | Unbekannte Merkmale wirken neutral: kein Bonus, kein Abzug, sichtbar als „unbekannt". | ⬜ |
| FR-ENT-05 | Gleiche Daten, gleiches Datum und gleiche Stapel-Nummer ergeben denselben Stapel in derselben Reihenfolge. | ⬜ |
| FR-ENT-06 | Keine Prozentzahl, kein „Match", keine Passungs-Sterne: Die Bewertung ordnet nur, angezeigt werden Gründe (P-08). | ⬜ |
| FR-ENT-07 | **Sozial:** Ein Chip „<Freund> bietet sie an" erscheint, wenn ein Freund die Art in der Tauschbörse hat (US-SOZ-09). Vorschläge aus dem Verhalten anderer Nutzer („Halter wie du mögen …") sind ausgeschlossen, bis es Mindestanzahl und angezeigte Stichprobengröße gibt (Nicht-Ziele in `16`). | ⬜ |
| FR-ENT-08 | Entscheidungen sind privat wie die Wunschliste (FR-WUN-07). Freunde sehen weder Ja noch Nein. | ⬜ |
| FR-ENT-09 | Out of Scope: Endlos-Feed, Benachrichtigungen über neue Vorschläge, Affiliate-/Shop-Links, maschinelles Lernen über die Faktoren aus US-ENT-05 hinaus, Arten außerhalb des Katalogs. | ⬜ (bewusst) |

## Offene Fragen

1. **Merkmale zuerst:** Welche Felder aus DM-ENT-01 werden zuerst angereichert? Vorschlag: Luftfeuchte und Giftig für Haustiere, weil sie die meisten Fehlkäufe verhindern. Wer recherchiert: Betreiber-Batch, KI mit Prüfstatus oder beides?
2. **Stapelgröße und Erkundungsanteil:** 10 und 2 als Start; nach einigen Wochen Nutzung nachziehen?
3. **Shop-/Gärtnerei-Partner** (Stufe 2/3 in `13-Business-Case.md`) bleiben aus Entdecken heraus (FR-ENT-09). Soll das später neu entschieden werden?

## Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| Der Katalog ist zu klein (Prototyp: 215 Arten); nach einigen Stapeln ist alles entschieden. | Katalogausbau (US-POK-02, Ziel 600+) ist Voraussetzung für dauerhaften Spaß; US-ENT-01 sagt ehrlich, wenn nichts mehr da ist. |
| Merkmale ohne Quelle oder falsch (besonders Giftigkeit) führen zu schlechten oder gefährlichen Vorschlägen. | Quelle Pflicht, Prüfstatus, unbekannt bleibt neutral (FR-ENT-04), keine KI-Aussage als Tatsache. |
| Wenige Messdaten machen „gedeiht" dünn, besonders bei neuen Konten. | Die Anteile Platz und Pokédex funktionieren ohne Messdaten; der Anteil Nähe wächst mit den Messungen. |
| Wischen wird zur Ablenkung statt zur Entscheidung. | Begrenzter Stapel, kein Endlos-Feed, keine Benachrichtigung (FR-ENT-09). |
