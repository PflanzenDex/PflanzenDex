# 12 – Business Case und Produktstufen

Stand: 2026-10-02 · Entwurf aus dem Gespräch vom selben Tag. Keine Marktzahlen: Alles, was hier als Zahl auftaucht, ist eine **Annahme zum Prüfen**, keine Recherche.

## Ausgangslage

- Das System (Epics BES bis POK) läuft im Obsidian-Vault des Pflanzenhalters und wird dort genutzt.
- **Drei Personen** sind bereits Nutzer bzw. wollen es sein und finden den Stand „genial". Social (Epic SOZ) wäre für alle drei ein Gewinn.
- Ziel in drei Schritten: (1) mindestens für uns, (2) trägt sich selbst, (3) irgendwann Gewinn.

Das ist ein **Produkt mit Bindung zuerst, Geld später**. Die Reihenfolge ist Absicht: Wer zuerst monetarisiert, bevor es eine Community gibt, hat weder das eine noch das andere.

## Wertversprechen

Für Pflanzensammler mit mehr als etwa 10 Pflanzen, die ernsthaft pflegen, sammeln und tauschen:

1. Sagt, was heute zu tun ist (Phasen, Behandlungen, Licht), statt nur ans Gießen zu erinnern.
2. Misst Erfolg an eigenen Daten (Wachstumslog, Fotos, Trend).
3. Belohnt das Sammeln (Pokédex, Meilensteine).
4. Macht Stecklingstausch und Neuzugänge im Freundeskreis sichtbar und sauber (Epic SOZ).

Abgrenzung: Anfänger-Apps (Gießerinnerung, Pflanzenbestimmung) bedienen eine andere Zielgruppe. Konkurrenz ist Alltagswerkzeug: Tabellen, Notiz-Apps, Messenger-Gruppen, Kleinanzeigen.

## Stufen

### Stufe 1 · Für uns (Ziel: dauerhaft genutzt, Kosten ≈ 0)

Erfolgskriterien (Annahmen, vor Beginn bestätigen):
- Alle drei nutzen das System **mindestens wöchentlich**, auch ohne Erinnerung.
- Mindestens **ein echter Tausch** läuft vollständig über das System (Angebot → Zusage → Übergabe).
- Der Feed „Neu bei Freunden" wird geöffnet, ohne dass jemand daran erinnert.

Was dafür gebaut werden muss: Epic SOZ in kleinster Form (US-SOZ-01 bis -05, -08 bis -11) auf der einfachsten Austauschschicht (E-SOZ-01), Benachrichtigung über den Bot, falls vorhanden.

Kosten: Entwicklungszeit, Hosting im Cent- bis niedrigen Euro-Bereich, keine Einnahmen.

Ausstiegssignal: Nach 8 Wochen nutzt höchstens eine Person das Social-Feature. Dann das Tauschen verwerfen und bei Einzelnutzung bleiben.

### Stufe 2 · Trägt sich selbst (Ziel: laufende Kosten gedeckt)

Voraussetzung: Stufe 1 bestanden **und** weitere Nutzer außerhalb der drei, die ohne Einladung durch uns bleiben.

Laufende Kosten (zu ermitteln, nicht geschätzt): Hosting des Hubs, Domain, Speicher für Fotos, Anbindung Telegram bzw. Push, Wikipedia/GBIF/OpenTree-Aufrufe (bisher kostenlos, mit Drosselung), ggf. Zahlungsabwicklung.

Einnahmequellen in Reihenfolge der Eignung:

| Quelle | Passung | Hinweis |
|---|---|---|
| **Freiwilliger Beitrag / kleines Abo** („Unterstützer") | passt zu einer kleinen Community | Gegenleistung: mehr Fotospeicher, Sensor-Anbindung (MON), Export. Kernfunktionen bleiben frei, sonst bricht der Tausch weg. |
| **Affiliate-Links** (Lampen, Substrat, Sensoren) | passt: Die App kennt Lampenbedarf und Wunschliste, ab Epic EQU auch den Gerätebestand | nur kennzeichnen und nur zu Dingen, die die App ohnehin empfiehlt; Regeln in `13-Equipment-und-Affiliate.md` (FR-EQU-03…10) |
| **Shop-/Gärtnerei-Partner** über „Fehlt dir"-Arten | passt, braucht Nutzerzahl | erst ab messbarem Traffic |

Break-even-Rechnung (Platzhalter): `zahlende_Nutzer × Preis × (1 − Gebühren) ≥ laufende_Kosten`. Die Zahlen werden in Stufe 1 gemessen, nicht angenommen.

### Stufe 3 · Gewinn

Nur möglich, wenn Nutzerzahl und Bindung weit über Stufe 2 liegen. Optionen, jede mit eigener Entscheidung:

1. **Mehr Affiliate/Partner** bei wachsender Community.
2. **Marktplatz-Anteil** auf Verkäufe zwischen Freunden und ihren Freunden. Das ist ein anderes Geschäft (Zahlung, Versand, Betrug, Pflanzen- und Artenschutzrecht) und bräuchte eine ausdrückliche Entscheidung, weil FR-SOZ-11 Verkauf bisher ausschließt.
3. **Katalog und Daten:** kuratierter Pokédex (Arten, Pflegewissen) als Premium-Inhalt. Rechtlich beachten: Wikipedia-Texte stehen unter CC BY-SA (FR-POK-07).

## Risiken

| Risiko | Wirkung | Gegenmaßnahme |
|---|---|---|
| Netzwerkeffekt fehlt (Feed leer ab 1–2 Freunden) | Social wirkt tot | Nur mit Freundeskreis starten; Wert auch ohne Freunde (Pokédex, Pflege) |
| Zielgruppe zahlt wenig | Stufe 2 scheitert | Kosten niedrig halten, kein Abo-Zwang für Kernfunktionen |
| Einstiegshürde Obsidian/Dataview | Wachstum bleibt auf Technikaffine begrenzt | Eigene Oberfläche erst nach Stufe 1 entscheiden |
| Datenschutz und Standort/Fotos | Vertrauensverlust | Privat als Standard (FR-SOZ-01) |
| Tausch rechtlich (Artenschutz, Pflanzengesundheit) | Haftung | Hinweise (FR-SOZ-09), kein Versand/Verkauf in Stufe 1–2 |
| Betrieb zu aufwendig für wenige Nutzer | Projekt versandet | Einfachste Austauschschicht wählen, nichts bauen, was Stufe 1 nicht braucht |

## Entscheidungen, die diesen Case bestimmen

1. **E-SOZ-01 Austauschschicht:** Die Wahl bestimmt Kosten und Aufwand der Stufen 1 und 2 (Bot-Hub ist am günstigsten, eigener Server am skalierbarsten).
2. **Eigene App oder Obsidian-Plugin:** Stufe 1 geht in Obsidian, Stufe 2 mit Fremden voraussichtlich nicht. Entscheidung erst nach Stufe 1.
3. **Verkauf erlauben (Stufe 3):** bewusst offen, siehe FR-SOZ-11.
4. **Freiwillig-Beitrag oder Abo** in Stufe 2.

## Messgrößen

| Größe | Stufe | Wie gemessen |
|---|---|---|
| Wöchentlich aktive Nutzer | 1 | Hub-Zugriffe oder Dashboard-Öffnungen |
| Abgeschlossene Tausche | 1, 2 | `Tausch_Id` mit Status `übergeben` |
| Neue Nutzer ohne Einladung durch uns | 2 | Hub-Anmeldungen |
| Zahlende Nutzer, laufende Kosten | 2 | Zahlungsanbieter, Rechnungen |
| Wiederkehrrate nach 4 Wochen | 2, 3 | Hub-Daten |
