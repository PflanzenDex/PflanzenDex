# 13 – Business Case und Produktstufen

Stand: 2026-10-02 · Entwurf. Keine Marktzahlen: Alles, was hier als Zahl auftaucht, ist eine **Annahme zum Prüfen**, keine Recherche.

Ablösung: ersetzt `../PFLANZENSYSTEM-SPECS/12-Business-Case.md`. Änderung: Das Produkt ist die Web-App, nicht mehr ein Vault mit Zusatzdiensten. Das entfernt die Obsidian-Hürde und macht Stufe 2 mit Fremden möglich, bringt aber **echte Betriebskosten** (Hosting, Foto-Speicher, KI) und **Rechtspflichten** (Datenschutz, Impressum) von Anfang an.

## Ausgangslage

- Der Prototyp zeigt, dass Pflege-, Wachstums- und Sammellogik funktioniert. **Drei Personen** nutzen ihn bzw. wollen ihn nutzen und finden ihn „genial". Social ist für alle drei ein Gewinn.
- Ziel in drei Schritten: (1) mindestens für uns, (2) trägt sich selbst, (3) irgendwann Gewinn.

Das ist ein **Produkt mit Bindung zuerst, Geld später**. Wer zuerst monetarisiert, bevor es eine Community gibt, hat weder das eine noch das andere.

## Wertversprechen

Für Pflanzensammler mit mehr als etwa 10 Pflanzen (siehe `00-Produktueberblick.md`):

1. Sagt, was heute zu tun ist (Phasen, Behandlungen, Licht, Messungen).
2. Misst Erfolg an eigenen Daten (Messungen, Fotos, Trend).
3. Belohnt das Sammeln (Pokédex, Meilensteine).
4. Macht Neuzugänge und Stecklingstausch im Freundeskreis sichtbar und sauber.
5. Nimmt Eingaben per Sprache und Foto entgegen, über den eigenen KI-Client des Halters (offene Schnittstelle, kein Anbieter-Zwang).

Abgrenzung: Anfänger-Apps (Gießerinnerung, Pflanzenbestimmung) bedienen eine andere Zielgruppe. Konkurrenz ist Alltagswerkzeug: Tabellen, Notiz-Apps, Messenger-Gruppen, Kleinanzeigen.

## Stufen

### Stufe 1 · Für uns (Ziel: dauerhaft genutzt, Kosten niedrig)

Erfolgskriterien (Annahmen, vor Beginn bestätigen):
- Alle drei **wechseln vom Vault in die App** (Parität der Kernfunktionen, siehe `16-Releases-und-Entscheidungen.md` R1) und nutzen sie **mindestens wöchentlich**, auch ohne Erinnerung.
- Mindestens **ein echter Tausch** läuft vollständig über die App.
- Der Feed „Neu bei Freunden" wird geöffnet, ohne dass jemand daran erinnert.

Was dafür gebaut werden muss: Releases R0 bis R2 (Fundament, Parität, Soziales); Erinnerungen (R3) erhöhen die Bindung, sind aber keine Bedingung für den Start.

Kosten: Entwicklungszeit; Hosting, Foto-Speicher und Last durch KI-Verbindungen für drei Konten (sehr gering, aber **zu messen**, NFR-16); Domain. Keine Einnahmen.

Ausstiegssignale: Nach 8 Wochen nutzt höchstens eine Person das Social-Feature → Tauschen überdenken. Wechselt jemand nach Parität nicht in die App → die Ursache vor dem weiteren Ausbau klären.

### Stufe 2 · Trägt sich selbst (Ziel: laufende Kosten gedeckt)

Voraussetzung: Stufe 1 bestanden **und** weitere Nutzer außerhalb der drei, die ohne Einladung durch uns bleiben. Datenschutzerklärung, Impressum, Löschkonzept stehen (NFR-11).

Laufende Kosten (zu ermitteln, nicht geschätzt): Hosting, Datenbank, Foto-Speicher, Last der KI-Verbindungen je Nutzer, Push, Domain, E-Mail, Backups, externe Quellen (Wikipedia/GBIF/OpenTree, bisher kostenlos mit Drosselung), ggf. Zahlungsabwicklung.

Einnahmequellen in Reihenfolge der Eignung:

| Quelle | Passung | Hinweis |
|---|---|---|
| **Freiwilliger Beitrag / kleines Abo** („Unterstützer") | passt zu einer kleinen Community | Gegenleistung: mehr Foto-Speicher, höhere Rate-Limits der KI-Verbindung, Sensor-Anbindung (MON), Export. Kernfunktionen bleiben frei, sonst bricht der Tausch weg. |
| **Affiliate-Links** (Lampen, Substrat, Sensoren) | passt: Die App kennt Lichtzonen, Wunschliste und Gerätebestand | nur gekennzeichnet und nur zu abgeleitetem Bedarf; Regeln in `11-Equipment-und-Empfehlungen.md` (FR-EQU-03 bis -10) |
| **Shop-/Gärtnerei-Partner** über „Fehlt dir"-Arten | passt, braucht Nutzerzahl | erst ab messbarem Traffic |

KI-Kosten entstehen beim Halter (eigener KI-Client), nicht beim Betreiber; bei uns fällt nur die Last der Schnittstelle an, begrenzt durch Rate-Limits je Verbindung (US-KI-06). Ein eingebauter Chat mit Betreiber-Kontingent würde das ändern (E-19).

Break-even-Rechnung (Platzhalter): `zahlende_Nutzer × Preis × (1 − Gebühren) ≥ laufende_Kosten`. Die Zahlen werden in Stufe 1 gemessen, nicht angenommen.

### Stufe 3 · Gewinn

Nur möglich, wenn Nutzerzahl und Bindung weit über Stufe 2 liegen. Optionen, jede mit eigener Entscheidung:

1. **Mehr Affiliate/Partner** bei wachsender Community.
2. **Marktplatz-Anteil** auf Verkäufe. Ein anderes Geschäft (Zahlung, Versand, Betrug, Pflanzen- und Artenschutzrecht) mit eigener Entscheidung, weil FR-SOZ-11 Verkauf bisher ausschließt (E-07).
3. **Katalog und Daten:** kuratierter Artenkatalog (Pflegewissen, Taxonomie) als Premium-Inhalt. Rechtlich beachten: Wikipedia-Texte stehen unter CC BY-SA (FR-POK-07).
4. **Aggregierte Erkenntnisse** („so lief es bei anderen unter Lampe 3") erst mit Mindestanzahl und angezeigter Stichprobengröße (Nicht-Ziel, bis die Datenmenge reicht).

## Risiken

| Risiko | Wirkung | Gegenmaßnahme |
|---|---|---|
| **Neubau ohne Parität:** Die drei nutzen den Vault weiter, weil die App weniger kann | Stufe 1 scheitert | Release R1 hat Parität als Ziel; Prototyp und App laufen parallel, Wechsel erst nach Bestätigung des Halters; Neu-Erfassung statt Import (Risiko R-10 in `16`) |
| Aufwand: Aus dem Vault-Prototyp wird ein Produkt (Konten, Betrieb, Datenschutz) | Projekt versandet | Kleinste Releases, jedes nutzbar; Betrieb einfach halten (E-01) |
| Netzwerkeffekt fehlt (Feed leer bei 1–2 Freunden) | Social wirkt tot | Mit Freundeskreis starten; Wert auch ohne Freunde (Pokédex, Pflege) |
| Zielgruppe zahlt wenig | Stufe 2 scheitert | Kosten niedrig halten, kein Abo-Zwang für Kernfunktionen |
| Last der KI-Verbindungen wächst schneller als Einnahmen; Nutzer ohne bezahlten KI-Client sehen weniger Wert | Verlust je Nutzer bzw. schwächeres Wertversprechen 5 | Rate-Limits je Verbindung, Messung (NFR-16), manuelle Wege immer verfügbar (FR-KI-05); E-19 prüft später einen eingebauten Chat |
| Datenschutz und Standort/Fotos | Vertrauensverlust, Bußgeld | Privat als Standard (FR-SOZ-01), EXIF/GPS entfernen, DSGVO-Konzept vor dem ersten Externen |
| Tausch rechtlich (Artenschutz, Pflanzengesundheit) | Haftung | Hinweise (FR-SOZ-09), kein Versand/Verkauf in Stufe 1–2 |
| Katalogqualität (KI-erstellte Profile mit Fehlern) | falsche Pflegehinweise | Prüfstatus (FR-BES-06), Quellen, Betreiber-Prüfliste |

## Entscheidungen, die diesen Case bestimmen

Gesammelt in `16-Releases-und-Entscheidungen.md`. Für den Case relevant:

1. **E-01 Technik und Hosting** (Kosten und Betriebsaufwand der Stufen 1 und 2).
2. **E-04 KI-Zugang (Schnittstelle statt eingebautem Anbieter) und E-19 eingebauter Chat.**
3. **E-07 Verkauf erlauben** (Stufe 3).
4. **E-08 Freiwilliger Beitrag oder Abo** (Stufe 2).

## Messgrößen

| Größe | Stufe | Wie gemessen |
|---|---|---|
| Wöchentlich aktive Konten | 1 | Anmeldungen und Aktionen, ohne Inhalte auszuwerten |
| Wechsel vom Vault in die App | 1 | alle drei nutzen die App für die tägliche Pflege |
| Abgeschlossene Tausche | 1, 2 | Tausch mit Status `übergeben` |
| Kosten je aktivem Konto (Hosting, Speicher, KI) | 1, 2 | Betreiber-Messung (NFR-16) |
| Neue Konten ohne Einladung durch uns | 2 | Registrierungen (US-ACC-05 nach Öffnung) |
| Zahlende Nutzer, laufende Kosten | 2 | Zahlungsanbieter, Rechnungen |
| Wiederkehrrate nach 4 Wochen | 2, 3 | Konto-Aktivität |
