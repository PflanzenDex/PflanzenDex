# 12 – Zielarchitektur: AI-first und Tech-Stack

Stand: 2026-10-02 · **Entwurf, nichts davon ist umgesetzt** (alles ⬜). Dieses Dokument beschreibt die Zielarchitektur, nicht den Ist-Zustand. Es ersetzt keine Anforderung aus 01–11, sondern legt fest, *womit* und *in welcher Reihenfolge* sie umgesetzt werden.

Das **fachliche** Verhalten von Social steht in `11-Soziales.md` (Epic SOZ). Dieses Dokument liefert dazu nur die **technische Antwort** auf die offene Entscheidung E-SOZ-01 (Austauschschicht) und legt fest, was jetzt schon vorzubereiten ist.

## Ausgangslage

Das System ist heute **UI-first** und **Ein-Personen-Vault**: ein `dataviewjs`-Dashboard in Obsidian mit Buttons, Claude arbeitet zu (Recherche, Foto-Bewertung, Skripte). Die Logik liegt teils inline im Dashboard ohne Tests (B-02), teils in getesteten Kernen (`pokedex-core.js`, `finanz-core.js`). Zwei Zielbilder kommen dazu:

1. **AI-first:** Claude ist die Hauptoberfläche, das Dashboard wird reine Ansicht.
2. **Social (Epic SOZ):** Freunde, Feed, Tauschen. Hub-Technik offen (E-SOZ-01).

Soziales Teilen setzt Konten und eine Austauschschicht voraus. Der Vault allein trägt das nicht. Gleichzeitig fordert `FR-SOZ-02`, dass der **Vault die Quelle der Wahrheit für die eigene Sammlung bleibt** und der Hub nur Freigaben, Angebote, Vorgänge und Freundschaften hält. Dieses Dokument folgt dieser Vorgabe (siehe ADR-01).

## Leitprinzipien

| ID | Prinzip |
|---|---|
| P-01 | **Das LLM urteilt, der Code rechnet und schreibt.** Phasen, Raten, Zählungen, Namensregel und Validierung kommen aus getestetem Code, nie aus dem Modell (NFR-05). |
| P-02 | **Ein Kern, viele Oberflächen.** Claude (MCP/CLI), Web, Dashboard und Bot rufen dieselbe `core`-Logik auf. Keine Kopie der Phasenlogik (B-02). |
| P-03 | **Schreiben nur über validierende Operationen.** Kein freies Editieren von Frontmatter durch das Modell. Schlüsselnamen sind Teil des Formats (NFR-01). |
| P-04 | **Speicher ist austauschbar.** `core` greift nur über ein Repository-Interface zu, nicht direkt auf Dateien oder SQL. |
| P-05 | **Mandantenfähig von Anfang an,** auch wenn zunächst nur ein Nutzer existiert. |
| P-06 | **Specs sind ausführbar.** Akzeptanzkriterien (Gegeben/Wenn/Dann) werden zu Tests, damit Claude Umsetzungen selbst prüfen kann. |

## Architekturentscheidungen

### ADR-01 · Vault bleibt Wahrheit, Hub als Server mit Postgres · ⬜
Vorschlag als Antwort auf **E-SOZ-01**, Variante „eigener Server mit Konten":

- **Vault = Wahrheit** für die eigene Sammlung (konform zu `FR-SOZ-02`). Fällt der Hub aus, bleibt alles außer den sozialen Blöcken nutzbar (`FR-SOZ-03`).
- **Hub = Server mit PostgreSQL** für Freundschaften (DM-S5), Angebote (DM-S2), Tauschvorgänge (DM-S3) und freigegebene Auszüge (DM-S1). Er hält keine Wachstumslogs, Behandlungen oder Standorte.
- **Synchronisation:** Der Vault veröffentlicht nur Exemplare mit `Teilen: freunde` (bereinigte Fotos, `FR-WAC-06`). Der Hub liefert Feed-Ereignisse und Vorgänge zurück; der Vault führt Archivierung und Anlegen bei Übergabe selbst aus (`FR-SOZ-05`).

Alternativen für E-SOZ-01, nicht gewählt, aber offen: **Telegram-Bot als Hub** (kein eigener Server, aber Identität und Datenhaltung an Telegram gebunden; passt, wenn der Kreis klein bleibt) und **dateibasierter Sync** (kein Server, dafür Konfliktbehandlung und keine Echtzeit-Tauschzustände).

Der Postgres-Hub wird erst gebaut, wenn E-SOZ-01 entschieden ist (siehe Phasen). Bis dahin bleibt alles hinter dem Repository-Interface aus ADR-03.

### ADR-02 · TypeScript durchgehend · ⬜
Eine Sprache für Kern, API, Web und MCP-Server. Begründung: bestehende Logik (`pokedex-core.js`, `finanz-core.js`) ist bereits JavaScript und wird ohne Sprachwechsel übernommen.

Ausnahme: `build_pokedex.py` und `foto_import.py` bleiben Python (73 Tests, bewährte Datenquellen). Sie schreiben später in die Datenbank statt in JSON, werden aber nicht neu geschrieben.

### ADR-03 · `core` mit Repository-Interface · ⬜
`packages/core` enthält reine Logik ohne I/O und greift über Schnittstellen wie `ExemplarRepo`, `ArtRepo`, `WunschlisteRepo` auf Daten zu. Zwei Adapter:

1. `markdown-adapter` (Vault, zuerst, ersetzt die Inline-Logik des Dashboards)
2. `postgres-adapter` (später, mit Social)

Damit lässt sich der Speicher tauschen, ohne Fachlogik anzufassen.

### ADR-04 · MCP-Server als KI-Schnittstelle · ⬜
Ein MCP-Server stellt `core` als schmale, idempotente Operationen bereit. Dadurch funktioniert derselbe Zugang in Claude Code, im Claude-Chat und auf dem Handy. Alternativ genügt für den Anfang eine CLI plus Skills in Claude Code (siehe Offene Entscheidungen).

### ADR-05 · Web als PWA · ⬜
Hauptkontext ist das Handy (Foto, Gießen, Erinnerung). Zuerst eine PWA, native App nur bei nachgewiesenem Bedarf.

## Tech-Stack

| Bereich | Wahl | Begründung |
|---|---|---|
| Sprache | TypeScript | siehe ADR-02 |
| Struktur | Monorepo (pnpm + Turborepo): `packages/core`, `packages/db`, `packages/api`, `packages/mcp`, `apps/web` | `core` ohne I/O, von allen Oberflächen genutzt |
| Datenbank (nur Hub) | PostgreSQL (Supabase oder Neon, selbst hostbar) | Freundschaften, Angebote, Vorgänge; Row-Level-Security. Der Vault bleibt Wahrheit für die Sammlung (ADR-01). |
| ORM/Migrationen | Drizzle (Alternative Prisma) | typsicher, Migrationen im Repo |
| Web | Next.js oder SvelteKit, als PWA | siehe ADR-05 |
| Auth | Supabase Auth, Clerk oder Better Auth | nicht selbst bauen |
| Medien | S3-kompatibler Speicher (R2/Supabase Storage), Resize und EXIF-/GPS-Entfernung serverseitig | übernimmt `foto_import.py`, bei Social Pflicht |
| KI | MCP-Server auf `core`, Claude API für Foto-Bewertung und Recherche | AI-first-Schicht |
| Jobs | Postgres-Queue (pg-boss) oder Inngest | Erinnerungen, Pokédex-Build, Foto-Verarbeitung |
| Push | Web Push, optional Telegram-Bot | ersetzt das geplante `pflanzen_status.py` (Epic MON) |
| Pokédex-Build | Python-Skript, unverändert | siehe ADR-02 |
| Tests | Vitest (`core`), Playwright (E2E) | Akzeptanzkriterien als Tests (P-06) |

Alternativen, bewusst nicht gewählt: **PocketBase** (schnellster Prototyp, skaliert schlechter, nur bei kleinem Freundeskreis sinnvoll) und **Local-first-Sync** (PowerSync, ElectricSQL, Jazz; nur falls Offline-Betrieb zum harten Muss wird, sonst zu viel Komplexität).

## Userstories

### US-ARC-01 · Pflege per Sprache · ⬜
Als **Pflanzenhalter** will ich Änderungen in natürlicher Sprache eingeben („Aloe steht jetzt unter Lampe 3, 12,5 cm, Foto anbei"), statt Formulare zu klicken.

Akzeptanzkriterien:
- Gegeben eine Eingabe in Freitext, wenn Claude sie in Operationen zerlegt, dann ruft er ausschließlich `core`-Operationen auf (`standort_setzen`, `messung_eintragen`, …).
- Gegeben eine mehrdeutige Eingabe (zwei Exemplare derselben Art), dann fragt Claude nach, statt zu raten.
- Gegeben eine ungültige Eingabe (unbekanntes Feld, falsche Lampenstufe), dann lehnt die Operation ab und schreibt nichts.
- NFR-02 bleibt erfüllt: Der Halter editiert nie rohes YAML.

### US-ARC-02 · Tagesstatus auf Zuruf · ⬜
Als **Pflanzenhalter** will ich fragen können „Was ist heute fällig?" und eine priorisierte Antwort erhalten.

Akzeptanzkriterien:
- Der Status kommt aus `core` (`status`), nicht aus dem Modell. Claude formuliert nur.
- Die Antwort nennt je Punkt, was zu tun ist (NFR-07).
- Dasselbe `status` speist Dashboard und Bot (kein dritter Code-Pfad, B-02).

### US-ARC-03 · Validierung findet stille Lücken · ⬜
Als **Pflanzenhalter** will ich unvollständige Daten gemeldet bekommen.

Akzeptanzkriterien:
- `validate` meldet Exemplare ohne `Art`, ohne `Standort_Aktuell`, mit nicht auflösbarer Art und Lampen-Strings außerhalb der definierten Stufen (B-04, B-07, NFR-06).
- Das Ergebnis ist maschinenlesbar (für Claude und CI) und lesbar (für den Halter).

### US-ARC-04 · Specs prüfen sich selbst · ⬜
Als **Entwickler (Claude/Halter)** will ich Akzeptanzkriterien als Tests ausführen.

Akzeptanzkriterien:
- Jede Story mit Status ✅ hat mindestens einen Test, der ihr Akzeptanzkriterium prüft; die Test-Datei nennt die Story-ID.
- Eine Änderung an `core` ohne grüne Tests gilt nicht als fertig.

### US-ARC-05 · Eigene Daten, ohne Plattformzwang · ⬜
Als **Pflanzenhalter** will ich nicht an den Hub gebunden sein.

Akzeptanzkriterien:
- Die eigene Sammlung liegt vollständig im Vault (DM-01…DM-04); der Hub ist nicht Voraussetzung (FR-SOZ-02).
- Hub-Daten (Freundschaften, Angebote, Vorgänge) lassen sich als Datei exportieren; der Export ist idempotent (gleiche Daten ergeben byte-identische Dateien, vgl. US-QS-03).

## Technische Anforderungen an den Hub

Fachliches Verhalten, Datenschutz-Regeln und Datenmodell stehen in `11-Soziales.md` (FR-SOZ-01…11, DM-S1…S5) und gelten unverändert. Hier nur, was die Technik zusätzlich festlegt. Alle ⬜ und nur relevant, wenn E-SOZ-01 zugunsten eines Servers entschieden wird.

| ID | Anforderung |
|---|---|
| FR-ARC-01 | **Mandantentrennung:** `user_id` an jeder nutzerbezogenen Zeile ab der ersten Migration, Row-Level-Security in Postgres (P-05). Test: Nutzer A sieht nie Daten von Nutzer B (NFR-ARC-06). |
| FR-ARC-02 | **Datensparsamkeit:** Der Hub speichert nur DM-S1…S5 und die freigegebenen Auszüge. Nie Standort, Wachstumslog, Behandlungsmittel oder Finanzdaten (FR-SOZ-01, US-SOZ-04). |
| FR-ARC-03 | **Löschung:** Ein Halter kann seine Hub-Daten vollständig löschen und exportieren (FR-SOZ-10). Der Vault bleibt unberührt. |
| FR-ARC-04 | **Zustandsmaschine im Kern:** Tauschzustände (DM-S3) und Feed-Ableitung liegen in `core`/`soziales-core` (FR-SOZ-04), der Hub führt sie nur aus und speichert sie. |
| FR-ARC-05 | **Idempotente Synchronisation:** Wiederholtes Veröffentlichen oder Abrufen führt zu identischem Zustand (US-QS-03). Fällt der Hub aus, zeigen soziale Blöcke den letzten Stand (FR-SOZ-03). |
| FR-ARC-06 | **Identität:** Anmeldung über einen etablierten Dienst (Supabase Auth, Clerk oder Better Auth), nicht selbst gebaut. Konkrete Wahl mit E-SOZ-01 (offene Frage 2 in `11-Soziales.md`). |

## Phasen

| Phase | Inhalt | Abhängig von | Berührt |
|---|---|---|---|
| **0** | `packages/core` mit Tests und `validate`; Lampenstufen zentral definiert | – | B-02, B-04, B-07, US-QS-02 |
| **1** | Markdown-Adapter, CLI/MCP mit 4–5 Kernoperationen (`status`, `standort_setzen`, `messung_eintragen`, `behandlung_eintragen`, `validate`), Skills in `CLAUDE.md` | 0 | US-ARC-01…03 |
| **2** | Dashboard auf `core` umstellen; Bugfixes B-01, B-11 | 0 | US-QS-02 |
| **3** | Monitoring Phase 1 (Gießlog, `status`-Job, Bot) | 0, 1 | Epic MON |
| **4** | `soziales-core.js` (Freigabe, Feed-Ableitung, Tauschzustände) mit Tests, ohne Hub (FR-SOZ-04) | 0, E-SOZ-01 fachlich | Epic SOZ |
| **5** | Hub (ADR-01), Konten, Freundschaft, Freigabe-Sync; zuerst Feed „Neu bei Freunden" (US-SOZ-05), danach Tausch | 1, 4, E-SOZ-01 entschieden | Epic SOZ |
| **6** | PWA als zusätzliche Oberfläche neben Obsidian (ADR-05) | 5 | – |

Phase 0–4 kommen ohne Server aus und sind unabhängig von der Hub-Entscheidung. Erst Phase 5 legt sich fest. Die Reihenfolge deckt sich mit dem Backlog (B-02 vor MON und SOZ).

## Nicht-funktionale Anforderungen

| ID | Anforderung | Status |
|---|---|---|
| NFR-ARC-01 | `core` hat keine Abhängigkeit auf Dateisystem, Datenbank oder Netz. | ⬜ |
| NFR-ARC-02 | Jede schreibende Operation ist idempotent und validiert ihre Eingabe vollständig (P-03). | ⬜ |
| NFR-ARC-03 | Jede Operation ist ohne Modell aufrufbar (CLI/Test) und liefert strukturierte Ausgabe. | ⬜ |
| NFR-ARC-04 | Rohsensorwerte kommen nicht in den Git-Vault, nur Aggregate (NFR-MON-01). | ⬜ |
| NFR-ARC-05 | Claude committet nicht (bestehende Regel); Änderungen sind als Diff prüfbar. Gilt für den Vault-Adapter. | ⬜ |
| NFR-ARC-06 | Migrationen sind versioniert und reproduzierbar; Mandantentrennung hat Tests (Nutzer A sieht nie Daten von Nutzer B). | ⬜ |

## Risiken

| ID | Risiko | Gegenmaßnahme |
|---|---|---|
| R-01 | Aus einem Vault-Skript wird ein Produkt (Hosting, Moderation, Datenschutz, Betrieb). | Phasen 0–4 liefern Nutzen ohne Server; Hub (Phase 5) erst nach E-SOZ-01. |
| R-02 | Das Modell schreibt Felder oder Werte, die nicht im Schema stehen. | P-03: nur validierende Operationen, keine freien Dateiedits. |
| R-03 | Zwei Wahrheiten (Vault und Hub) laufen auseinander. | Vault führt für die eigene Sammlung, Hub für Vorgänge und Freundschaften (ADR-01); Übergabe atomar nach FR-SOZ-05. |
| R-04 | Spätere Auswertungen über viele Nutzer („so lief es bei anderen unter Lampe 3") sind bei kleiner Stichprobe irreführend. Nicht Teil von SOZ. | Nur mit Mindestanzahl und angezeigter Stichprobengröße einführen; bleibt Idee, bis SOZ läuft. |
| R-05 | Datenschutz: Standort, Fotos, Wohnumfeld sind sensibel. | FR-SOZ-01, FR-ARC-02, Standard `privat`. |

## Offene Entscheidungen für den Halter

1. **E-SOZ-01 (Hub-Technik):** Server mit Postgres (ADR-01), Telegram-Bot als Hub oder dateibasierter Sync? Für einen Freundeskreis von etwa 10 Personen kann der Bot genügen und spart den Server; ein eigener Server lohnt, wenn Konten, Echtzeit-Tauschzustände oder eine PWA gebraucht werden. Siehe auch offene Fragen in `11-Soziales.md`.
2. **MCP-Server oder CLI plus Skills?** MCP funktioniert auch im Chat und auf dem Handy; die CLI genügt für Claude Code.
3. **Liegt der Code im Vault-Repo oder in einem eigenen Repo?** Dieses Repo ist reine Spec-Ablage.
4. **Monorepo und TypeScript wie vorgeschlagen,** oder bei `pokedex-core.js`-Stil (einzelne JS-Dateien) bleiben, solange kein Hub existiert?
