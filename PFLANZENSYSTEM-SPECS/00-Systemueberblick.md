# 00 – Systemüberblick

## Zweck

Das Pflanzensystem verwaltet die eigenen Zimmerpflanzen unter einem Mehrstufen-Lampensystem und macht daraus ein Interaktions-System, das man gern öffnet: Es sagt, was heute zu tun ist (Standort wechseln, Behandlung fällig, nächste Anschaffung), misst Erfolg an echten eigenen Daten statt an erfundenen Durchschnitten, und belohnt das Sammeln im Pokédex.

Leitprinzip aus `03-Resources/Processes/System-Design-Prinzipien.md`: Der Mensch liefert nur, was nur er liefern kann (Standort umgestellt, Messzahl, Qualitätsurteil, Kaufentscheidung); alles Ableitbare berechnet das System. Eingaben laufen über Klick-Buttons und Formulare (`app.fileManager.processFrontMatter`), nie über rohes YAML-Editing.

## Akteure

| Akteur | Rolle |
|---|---|
| **Pflanzenhalter** | Der Nutzer. Stellt Pflanzen um, misst, bewertet Vergeilung, kauft, pflegt `Arten.md` und `Wunschliste.md`, liest gegen, was Claude recherchiert. |
| **Claude** | Recherchiert Art-Notizen aus der Prompt-Vorlage, recherchiert Wunschlisten-Kandidaten, bewertet Fotos qualitativ, kuratiert `Arten.md`, führt Skripte aus. Committet nicht (macht der Nutzer). |
| **System** | `post-commit`-Hook, `build_pokedex.py`, `foto_import.py`, `dataviewjs`-Blöcke in Obsidian, künftig der Telegram-Bot. |

## Architektur

```
                         ┌──────────────────────────────────────┐
  Pflanzenhalter ───────►│ 🌿 Mein Pflanzen-Dashboard (dataviewjs)│◄── liest live
  (Klicks/Formulare)     │  Anlegen · Arten · Exemplare · Licht │
                         │  Pflegephasen · Wachstum · Behand-   │
                         │  lungen · Anschaffungen · Vorlagen   │
                         └───────┬───────────────┬──────────────┘
                 schreibt per    │               │ liest
              processFrontMatter │               │
                                 ▼               ▼
 02-Areas/Pflanzen/
   Arten/<Art>.md          ← Artwissen (1× je Art), Frontmatter + Botanik-Story
   Meine Pflanzen/<…>.md   ← Exemplar (1× je Topf): Art-Link, Standort, Log, Behandlungen
   Lampen-Zuordnung.md     ← Lampenstufen-Referenz + Live-Verteilung
   Wunschliste.md          ← Kaufkandidaten (Frontmatter-Array)
   Fotos/<Exemplar>/<Datum>.jpg ← von foto_import.py geschrieben
 04-Archive/Pflanzen/      ← eingegangene/abgegebene Exemplare

 03-Resources/Pflanzen-Pokedex/
   Arten.md                ← kuratierte Artenliste (manuell)
   Pokedex-Baum.json       ← generiert (build_pokedex.py, nie manuell)
   Pflanzen-Pokedex.md     ← Sammelkarten-Dashboard
   .pokedex-state.json     ← "Neu gefangen"-Zustand (gitignored)

 scripts/pflanzen/
   build_pokedex.py  ← OpenTree + Wikidata + Wikipedia + GBIF → Baum
   pokedex-core.js   ← reine Logik (Karten, Meilensteine, Suche)  [66 Tests]
   pokedex.css       ← Aussehen
   foto_import.py    ← Foto verkleinern, EXIF/GPS entfernen, verknüpfen
   test_build_pokedex.py                                          [73 Tests]

 .git/hooks/post-commit  → build_pokedex.py, wenn Arten.md im Commit geändert
```

Geplant, nicht vorhanden: Bot-Job `pflanzen_status.py`, `Sensor-Status.md`, MQTT/ESPHome-Pfad (siehe `08-Monitoring-Sensorik.md`).

## Datenmodell

### DM-01 Art-Notiz (`02-Areas/Pflanzen/Arten/<Art>.md`)

Frontmatter (Pflichtfelder der Prompt-Vorlage; alle 13 vorhandenen Notizen tragen sie):

| Feld | Typ | Bedeutung |
|---|---|---|
| `Lateinischer_Name` | Text | Gattung + Epitheton, optional Sorte (`var.`, `subsp.`, `'Cultivar'`); speist Pokédex-Besitz |
| `Englischer_Name`, `Familie_DE`, `Familie_LAT` | Text | Stammdaten |
| `Schwierigkeit` | Text | `Einfach` / `Medium` / `Schwer` |
| `Licht_Hardware` | Text | genau einer von vier Lampen-Strings (siehe DM-05) |
| `Licht_Lux_Bedarf` | Zahl | Lux-Bedarf für maximales Wachstum (steuert Position unter der Lampe) |
| `Ruhephase_Von`, `Ruhephase_Bis` | `MM-DD` | darf über den Jahreswechsel gehen |
| `Standort_Wachstumsphase`, `Standort_Ruhephase` | Text | Soll-Standorte, **exakter Text-Match** mit `Standort_Aktuell` |
| `Wachstumsmaß` | Text | exakt eine Messdimension (Höhe, Rosettendurchmesser, Trieblänge) |
| `Vergeilung_Anzeichen` | Text | artspezifische Symptome von Lichtmangel |
| `Gießen_Messer`, `Substrat_Kurz`, `Rückschnitt_Kurz`, `Wuchs_Hack_Kurz` | Text | Kurzpflege, je ein Satz |
| `Erfolgskriterien_Kurz` | Text | ein Satz: beobachtbare Zeichen optimaler Pflege |
| `created`, `last_updated` | Datum | |

Body: Abschnitte `🌿 Botanische Story & Familie`, `💧 Pflege, Substrat & Gießkalender`, `✂️ Der perfekte Rückschnitt`, `💡 Pro-Tipps & Wuchs-Hacks`, `🏆 Erfolgskriterien` (Callouts wie `[!abstract]`, `[!book]`, `[!todo]`, `[!sun]`, `[!drop]`, `[!scissors]`, `[!tip]`, `[!success]`).

### DM-02 Exemplar-Notiz (`02-Areas/Pflanzen/Meine Pflanzen/<Name>.md`)

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `Art` | ja | Vollpfad-Wikilink `"[[02-Areas/Pflanzen/Arten/<Art>\|<Art>]]"` (Vollpfad, weil Exemplar und Art sonst gleich heißen) |
| `Kennzeichen` | bei >1 Exemplar | Wäscheklammer: `Klammer` oder `Klammer <Farbe>` |
| `Standort_Aktuell` | ja | Ist-Standort, einziges manuell gepflegtes Standortfeld |
| `Gefangen_Am` | nein | `YYYY-MM-DD`, speist Pokédex-Fangdatum |
| `Status` | nein | `"Steckling"` überschreibt die Phasenlogik |
| `Licht_Hardware` | nein | überschreibt den Artwert (Steckling → Lampe 1) |
| `Wachstumslog` | ja (`[]`) | Array `{Datum, Hoehe_cm, Qualität, Notiz?, Foto?}` |
| `Behandlungen` | ja (`[]`) | Array `{Grund, Mittel, Datum, Erledigt}` |

Lookup-Regel: Jedes Feld im Exemplar hat Vorrang vor dem gleichnamigen Artfeld (`p[k] ?? art[k]`).

### DM-03 Namensregel Exemplare

1 Exemplar: `Art` · 2 Exemplare: `Art` und `Art – Klammer` · ab 3: jedes `Art – <Farbe>`. Trennzeichen ist ein Gedankenstrich mit Leerzeichen.

### DM-04 Wunschliste (`02-Areas/Pflanzen/Wunschliste.md`)

Frontmatter-Array `Kandidaten` mit `Name`, `Deutsch`, `Ziel_Lampe`, `Schwierigkeit` (Text), `Begruendung`, `Bild`, `Bildquelle`, `Status` (`Wunschliste` / `Gekauft` / `Verworfen`).

### DM-05 Lampenstufen

| Stufe | String im Feld `Licht_Hardware` | Zweck |
|---|---|---|
| Lampe 1 | `Lampe 1 (1.500 Lux / ~36 µmol/m²/s)` | Stecklingslampe, keine Zuordnungsstufe |
| Lampe 2 | `Lampe 2 (15.000 Lux / ~300 µmol/m²/s)` | Unterholz, Halbschatten |
| Lampe 3 | `Lampe 3 (100.000 Lux / ~1600 µmol/m²/s)` | subtropische Vollsonne, Stammsukkulenten |
| Lampe 4 | `Lampe 4 (110.000 Lux / ~2000 µmol/m²/s)` | Wüsten-Vollsonne, CAM-Kakteen |

Die Strings sind in Dashboard, Lampen-Zuordnung, Wunschliste und Vorlagen **identisch** hart kodiert; Änderungen müssen überall passieren.

### DM-06 Pokédex-Daten

- `Arten.md`: Array `Arten` mit `Name` (Gattung + Epitheton), `Deutsch`, `Schwierigkeit` (1–3), `Lampe` (2–4), optional `Notiz`.
- `Pokedex-Baum.json`: `ordnungen → familien → gattungen → arten`, je Gattung `arten_anzahl_gattung`, je Art `wiki_titel`, `kurztext`, `bild`, `bild_quelle`, `schwierigkeit`, `lampe`, `ott_id`; Meta `stand`, `fehler`, `hinweis`.

## Glossar

| Begriff | Bedeutung |
|---|---|
| Art / Exemplar | Art = Wissen (1×), Exemplar = ein Topf. Pokédex sammelt Arten, Dashboard pflegt Exemplare. |
| Pflegephase | Wachstumsphase oder Ruhephase, berechnet aus `Ruhephase_Von/Bis` und dem heutigen Datum. |
| Steckling | Exemplar mit `Status: "Steckling"`, noch nicht eingetopft; Lampe 1, ausgenommen vom Phasen-Tracker. |
| Vergeilung | Etiolierung durch Lichtmangel: Längenzuwachs, aber dünn und blass. Zählt nicht als Erfolg. |
| Kennzeichen | Wäscheklammer am Topf, trennt Exemplare derselben Art. |
| Puffer | Mindestzahl offener Wunschlisten-Kandidaten je Lampenstufe (2). |
| Gefangen | Art ist im Pokédex besessen: Exemplar in `Meine Pflanzen/` verweist auf eine Art-Notiz mit passendem `Lateinischer_Name`. |
| Artenarm | Gattung mit höchstens 10 Arten laut GBIF; Badge auf der Art-Karte. |
