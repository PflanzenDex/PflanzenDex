# 00 – Produktüberblick

## Vision

PflanzenDex ist die Web-App für Pflanzensammler: Sie sagt, was heute zu tun ist, misst Erfolg an den eigenen Daten, belohnt das Sammeln und verbindet Sammler untereinander, damit Neuzugänge sichtbar werden und Stecklinge sauber den Besitzer wechseln.

Der Prototyp (Obsidian-Vault) hat die Pflege- und Sammellogik erprobt. Drei Personen nutzen ihn bzw. wollen ihn nutzen. Die Web-App macht daraus ein Produkt ohne Obsidian-Hürde, mit Konten, mobilem Zugang und sozialen Funktionen.

## Zielgruppe

Pflanzensammler mit mehr als etwa 10 Pflanzen, die ernsthaft pflegen, Stecklinge ziehen, sammeln und tauschen: Kakteen, Sukkulenten, Hoya, Philodendron, Begonien und Ähnliches, oft unter Pflanzenlampen. Anfänger, die nur ans Gießen erinnert werden wollen, sind nicht die Zielgruppe (siehe `13-Business-Case.md`).

Start-Nutzer: die drei Personen aus dem Prototyp-Kreis.

## Wertversprechen

1. **Sagt, was zu tun ist.** Standort wechseln, Behandlung fällig, Messung überfällig, Lampenstufe passt nicht. Nicht nur Gießen.
2. **Misst am eigenen Verlauf.** Wachstumstrend gegen den eigenen Schnitt, Vergeilung zählt nie als Erfolg.
3. **Belohnt das Sammeln.** Pokédex mit Rang, Meilensteinen und „noch N bis …".
4. **Verbindet.** Neu bei Freunden, Tauschbörse, Herkunft jeder Pflanze.
5. **KI als Eingang.** Pflege per Sprache und Foto, Profile und Recherche auf Zuruf, ohne dass die KI rechnet oder frei Daten schreibt.

## Akteure

| Akteur | Rolle |
|---|---|
| **Pflanzenhalter** | Nutzer mit Konto. Pflegt Sammlung, misst, wünscht, tauscht. |
| **Freund** | Anderer Pflanzenhalter mit bestätigter Freundschaft. Sieht nur Freigegebenes. |
| **Betreiber** | Wer die App betreibt: Hosting, Katalogpflege, Partnerprogramme, Moderation. |
| **KI-Client** | Der KI-Assistent des Halters (beliebiger Anbieter), verbunden über die offene Schnittstelle. Nimmt Freitext und Fotos entgegen, schlägt vor, recherchiert. Ruft ausschließlich freigegebene, validierende Operationen auf; Ergebnisse sind Entwürfe. Die App betreibt selbst keine KI. |
| **System** | Hintergrundjobs: Erinnerungen, Katalog-Anreicherung, Foto-Verarbeitung, Sensor-Auswertung. |

## Produktprinzipien

Aus den Prinzipien des Prototyps und der Zielarchitektur-Skizze. Sie gelten für alle Epics.

| ID | Prinzip |
|---|---|
| P-01 | **Die KI urteilt, der Code rechnet und schreibt.** Phasen, Raten, Zählungen, Namensregel, Validierung sind deterministische, getestete Logik. Das Modell wird nie als Rechner benutzt. |
| P-02 | **Ein Kern, viele Oberflächen.** Web, KI-Client, Benachrichtigungen und spätere Clients nutzen dieselbe Fachlogik. Keine Kopie der Phasenlogik (im Prototyp Befund B-02). |
| P-03 | **Schreiben nur über validierende Operationen.** Auch die KI darf nichts außerhalb des Schemas schreiben. Ungültiges wird abgelehnt, nicht korrigiert. |
| P-04 | **Mandantenfähig von Anfang an.** Jede nutzerbezogene Zeile gehört einem Konto; Nutzer A sieht nie Daten von Nutzer B ohne Freigabe. |
| P-05 | **Privat als Standard.** Nichts verlässt das Konto ohne ausdrückliche Freigabe. |
| P-06 | **Specs sind ausführbar.** Akzeptanzkriterien werden zu Tests. |
| P-07 | **Der Mensch liefert nur, was nur er liefern kann:** Standort umgestellt, Messzahl, Qualitätsurteil, Kaufentscheidung. Alles Ableitbare rechnet das System. |
| P-08 | **Keine erfundenen Zahlen.** Vergleich nur gegen eigene Historie oder zitierbare Quellen. Unbekannt heißt „unbekannt". |
| P-09 | **Jede Ansicht sagt, was zu tun ist.** Daten ohne Handlungsanweisung sind kein Ziel. |
| P-10 | **Kein stilles Verschwinden.** Unvollständige Daten werden gemeldet, nicht ausgeblendet. |
| P-11 | **Mobile zuerst.** Foto, Messen, Gießen und Umstellen passieren neben der Pflanze, nicht am Schreibtisch. |

## Domänenmodell

Technikneutral. Jede Entität gehört einem Konto, außer dem Artenkatalog.

| Entität | Bedeutung | Epic |
|---|---|---|
| **Konto / Profil** | Person, Anzeigename, Einstellungen, Zeitzone | ACC |
| **Art** (Katalog) | Wissen zu einer Pflanzenart, gemeinsam für alle Nutzer, mit Herkunft und Prüfstatus | BES, POK |
| **Exemplar** | Ein Topf einer Art im Besitz eines Halters | BES |
| **Pflegeprofil** | Kontoeigene Abweichungen von den Katalogwerten einer Art (Soll-Standorte, Zone, Ruhephase, Gießintervalle) | BES |
| **Standort** | Benannter Platz des Halters (Schrank 2, Fensterbank Süd), einer Lichtzone zugeordnet | LIC |
| **Lichtzone** | Lichtstufe mit Lux-Decke und Position; Voreinstellung vier Stufen, anpassbar | LIC |
| **Messung** | Zeitpunkt, Wert, Qualität, Notiz, Foto an einem Exemplar | WAC |
| **Behandlung** | Geplante oder erledigte Maßnahme an einem Exemplar | BEH |
| **Wunsch** | Kaufkandidat (Pflanze oder Equipment) | WUN, EQU |
| **Equipment** | Gerät oder Verbrauchsmaterial | EQU |
| **Sensor, Messreihe** | Gerät mit Messwerten und Aggregaten | MON |
| **Freundschaft, Freigabe** | Beziehung und Sichtbarkeit | SOZ |
| **Angebot, Tausch** | Anbieten, Anfragen, Übergabe | SOZ |
| **Ereignis** | Abgeleitete Feed-Einträge | SOZ |
| **Erinnerung** | Fälliger Anlass mit Kanal und Zustand | MON |

**Wichtigste Modellentscheidungen gegenüber dem Prototyp:**

- **Artenkatalog ist gemeinsam**, nicht je Nutzer. Der Prototyp pflegt 13 Art-Notizen allein; viele Nutzer sollen das nicht jeder neu erzeugen. Persönliche Abweichungen (Soll-Standorte, Lichtzone, Ruhephase) liegen im **Pflegeprofil** des Nutzers (DM-BES-04) bzw. am Exemplar (E-02, entschieden).
- **Standorte und Lichtzonen sind Entitäten**, keine Texte. Das beendet den exakten Text-Match (FR-PHA-03) und die hartkodierten Lampen-Strings (B-07).
- **`Schwierigkeit` ist eine Zahl 1–3** mit Anzeigetext (löst B-05).
- **Zeiten sind in der Zeitzone des Nutzers** (löst B-01).

## Glossar

| Begriff | Bedeutung |
|---|---|
| Art / Exemplar | Art = Wissen (1× im Katalog), Exemplar = ein Topf eines Halters. |
| Pflegephase | Wachstumsphase oder Ruhephase, berechnet aus Kalender und Art-Zeitraum. |
| Steckling | Exemplar im Status Steckling: noch nicht eingetopft, Stecklingslicht, ausgenommen vom Phasen-Tracker. |
| Vergeilung | Etiolierung durch Lichtmangel: Länge, aber dünn und blass. Zählt nicht als Erfolg. |
| Kennzeichen | Unterscheidung mehrerer Exemplare derselben Art (im Prototyp Wäscheklammer-Farbe). |
| Lichtzone | Stufe mit definierter Lichtstärke (Lampe 1 bis 4 im Prototyp). |
| Puffer | Mindestzahl offener Wunschkandidaten je Lichtzone. |
| Gefangen | Art ist im Pokédex besessen: der Halter hat ein aktives Exemplar. |
| Artenarm | Gattung mit höchstens 10 Arten laut GBIF; Badge auf der Karte. |
| Freigabe | Pro Exemplar festgelegte Sichtbarkeit für Freunde. |
| Tausch | Anfrage → Zusage → beidseitig bestätigte Übergabe; Besitz wechselt. |
| Herkunft | Vermerk, von wem und wann ein Exemplar kam. |
| Bedarf | Aus eigenen Daten abgeleitete Lücke (Lampe fehlt, Vorrat leer), Grundlage für Empfehlungen. |
| Vorschlag / Stapel | Art aus dem Katalog, die Entdecken als Karte anbietet (Ja/Nein/Später); ein Stapel ist eine begrenzte Folge davon (Epic ENT). Nicht zu verwechseln mit einer Equipment-Empfehlung. |
| KI-Client / Verbindung | Der KI-Assistent des Halters und seine Freigabe mit Rechten `lesen`, `Entwürfe anlegen`, `schreiben` (Epic KI). |
| Auftrag (KI) | Aus der App angestoßene Aufgabe, die der verbundene KI-Client abholt und als Entwurf beantwortet (US-KI-08). |
| Entwurf | KI-Ergebnis, das erst nach Prüfung des Halters zählt (US-KI-09). |
| Pflegeprofil | Kontoeigene Abweichungen von den Katalogwerten einer Art; privat (DM-BES-04). |
| Vorschlag (Katalog) | Von einem Nutzer vorgeschlagene Art, nur für ihn sichtbar, bis ein Prüfer sie freigibt (US-BES-10). Nicht zu verwechseln mit einem Vorschlag in Entdecken. |
| Gedeiht | Aktives Exemplar mit ≥ 2 Messungen, Gesamtrate > 0 und letzter Qualität `Gesund`; Grundlage für Vorschläge (Epic ENT). |
