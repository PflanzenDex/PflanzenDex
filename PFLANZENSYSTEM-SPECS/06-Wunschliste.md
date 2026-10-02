# 06 – Epic WUN: Wunschliste und Anschaffungsplanung

Ziel: Neue Pflanzen werden dort angeschafft, wo im Lampensystem Platz ist, und die Kandidatenliste läuft nicht unbemerkt leer.

Quellen: `02-Areas/Pflanzen/Wunschliste.md`, Dashboard-Block „🛒 Nächste Anschaffungen", `Lampen-Zuordnung.md`.

## Userstories

### US-WUN-01 · Kandidaten nach Platzbedarf priorisiert sehen · ✅
Als **Pflanzenhalter** will ich Kaufkandidaten sehen, deren Zielstufe im Schrank am dünnsten besetzt ist, damit ich sinnvoll kaufe.

Akzeptanzkriterien:
- Der Block zeigt Kandidaten mit `Status: "Wunschliste"`, sortiert aufsteigend nach Bestand der jeweiligen `Ziel_Lampe` (Exemplar-Zählung, Lampen 2–4; unbekannte Stufe zuletzt).
- Spalten: Foto (max. 120 px, mit Quelllink), Pflanze („Deutsch (Name)"), Ziel-Lampe mit aktuellem Bestand („— N Pflanzen"), Schwierigkeit, Begründung, Aktion.
- Gibt es keine offenen Kandidaten: „Keine offenen Kandidaten in der Wunschliste."

### US-WUN-02 · Vor leerer Liste gewarnt werden · ✅
Als **Pflanzenhalter** will ich eine Warnung, wenn für eine Lampenstufe zu wenige Kandidaten übrig sind, damit ich rechtzeitig Nachschub recherchiere.

Akzeptanzkriterien:
- Pro Lampenstufe 2, 3, 4 sollen mindestens **2** offene Kandidaten vorliegen (`PUFFER_MIN = 2`).
- Unterschreitet eine Stufe das, steht oben ⚠️ „Nachschub nötig: <Stufe> (N offene Kandidaten), …" mit Verweis auf die Prompt-Vorlage.
- Die Warnung ist der Trigger für den Recherche-Auftrag an Claude (US-WUN-04); die Recherche selbst ist nicht automatisierbar, nur das Erkennen des Bedarfs.

### US-WUN-03 · Kauf per Klick festhalten · ✅
Als **Pflanzenhalter** will ich „Gekauft ✔" klicken, damit der Status ohne YAML-Editing wechselt.

Akzeptanzkriterien:
- Klick setzt `Status: "Gekauft"` am Eintrag mit passendem `Name` in `Kandidaten` und deaktiviert den Button.
- Der Kandidat verschwindet aus der Liste, bleibt aber in der Datei.

### US-WUN-04 · Neue Kandidaten von Claude recherchieren lassen · ✅
Als **Pflanzenhalter** will ich eine Vorlage, mit der Claude neue, zur Lampenstufe passende Kandidaten recherchiert, damit die Einträge direkt ins Frontmatter passen.

Akzeptanzkriterien:
- Die Vorlage in `Wunschliste.md` verlangt Ziel-Lampe, Anzahl und eine Ausschlussliste (Bestand und bestehende Kandidaten).
- Der botanische Lichtbedarf muss zur Zielstufe **passen**, nicht sie nur tolerieren; dazu eine kurze Begründung (CAM, Herkunft, Blattmorphologie).
- Bild-URL und Bildquelle (Commons-Seite) werden per HTTP-Request auf Erreichbarkeit geprüft, nicht geraten.
- Ausgabe ist ausschließlich eine YAML-Liste im Format aus DM-04, die unter den letzten Eintrag eingefügt wird.

### US-WUN-05 · Vom Kauf zur Pflanze kommen · 🟡
Als **Pflanzenhalter** will ich nach dem Kauf möglichst wenig manuelle Schritte bis zum Exemplar, damit Kauf und Dokumentation nicht auseinanderlaufen.

Akzeptanzkriterien (Soll): Nach „Gekauft ✔" ist der Weg zur Art-Notiz und zum Exemplar geführt.

Ist: „Gekauft ✔" ändert nur den Status. Der Hinweis „danach die Art-Notiz über die Prompt-Vorlage anlegen" ist Text; es gibt keinen Übergang (z. B. vorbefüllte Vorlage mit dem Namen), und `Verworfen` wird nur von Hand gesetzt. Bild-URLs sind externe Hotlinks auf Wikimedia (keine lokalen Kopien). → Backlog B-09.

## Anforderungen

| ID | Anforderung | Status |
|---|---|---|
| FR-WUN-01 | `Kandidaten` ist ein Frontmatter-Array nach DM-04; `Status` ∈ {`Wunschliste`, `Gekauft`, `Verworfen`}. | ✅ |
| FR-WUN-02 | Als „offen" gilt ausschließlich `Status === "Wunschliste"`. | ✅ |
| FR-WUN-03 | `Ziel_Lampe` muss einer der drei Strings Lampe 2/3/4 sein, sonst wird der Kandidat in Zählung und Puffer-Check nicht berücksichtigt. | ✅ |
| FR-WUN-04 | `Schwierigkeit` in der Wunschliste ist Text (`Einfach`/`Medium`/`Schwer`), in `Arten.md` dagegen Zahl 1–3 (siehe B-05). | 🟡 |
| FR-WUN-05 | Die Wunschliste wird **nicht** mit dem Pokédex verknüpft (bewusst, Out-of-Scope in v1/v2). | ✅ |
| FR-WUN-06 | Der Namensabgleich beim „Gekauft ✔" erfolgt über `Name`; doppelte Namen würden den ersten Treffer ändern. | ✅ (Einschränkung) |
