# 01 – Epic ACC: Konten und Onboarding

Ziel: Jede Person hat ein eigenes Konto mit eigenen Daten. Der Einstieg ist in wenigen Minuten geschafft, auch für die drei Start-Nutzer mit Daten aus dem Prototyp.

Im Prototyp gab es kein Konto. Alles in diesem Epic ist neu.

## Userstories

### US-ACC-01 · Registrieren und anmelden · ⬜ neu
Als **Pflanzenhalter** will ich mir ein Konto anlegen und mich sicher anmelden.

Akzeptanzkriterien:
- Registrierung mit E-Mail und einem etablierten Anmeldeverfahren (Passwort, Magic Link oder Anmeldung über Drittanbieter; Wahl in E-03).
- E-Mail-Adresse wird bestätigt, bevor das Konto Daten mit Freunden teilen kann.
- Anmeldung bleibt auf dem Gerät erhalten, ist aber widerrufbar („auf allen Geräten abmelden").
- Falsche Anmeldedaten verraten nicht, ob die E-Mail existiert.

### US-ACC-02 · Profil und Einstellungen · ⬜ neu
Als **Pflanzenhalter** will ich Anzeigename, Zeitzone und Benachrichtigungen einstellen.

Akzeptanzkriterien:
- Anzeigename (frei wählbar, nicht eindeutig; Freunde erkennen sich über Einladung, nicht über Namenssuche, siehe FR-SOZ-08).
- Zeitzone, vorbelegt aus dem Gerät. Phasen, Fälligkeiten und Erinnerungen nutzen sie (NFR-08).
- Benachrichtigungen je Anlass an- und abschaltbar (US-MON-08).
- Globale Schalter „Alles privat" (US-SOZ-04) und „Keine Empfehlungen" (US-EQU-11).

### US-ACC-03 · Geführter Einstieg · ⬜ neu
Als **Pflanzenhalter** will ich schnell zur ersten Pflanze kommen.

Akzeptanzkriterien:
- Der Einstieg fragt: Standorte (wo stehen Pflanzen), Lichtzonen (Voreinstellung vier Stufen übernehmen oder anpassen), erste Pflanze, optional Import aus dem Prototyp (Epic MIG).
- Jeder Schritt ist überspringbar; die App ist danach nutzbar. Fehlende Angaben werden später als Hinweis angezeigt, nie als Fehler.
- Ohne Pflanze zeigt die Startseite eine klare nächste Handlung statt einer leeren Seite.

### US-ACC-04 · Daten exportieren und Konto löschen · ⬜ neu
Als **Pflanzenhalter** will ich meine Daten mitnehmen oder vollständig entfernen können.

Akzeptanzkriterien:
- Export aller eigenen Daten (Exemplare, Messungen, Behandlungen, Wunschliste, Equipment, Tausch- und Freundesdaten) in einem offenen Format; Fotos als Dateien. Der Export ist reproduzierbar (gleiche Daten, gleiche Datei).
- Konto löschen entfernt alle personenbezogenen Daten, Fotos und Freigaben. Abgeschlossene Tausche bleiben beim Tauschpartner mit dem gespeicherten Anzeigenamen, ohne weitere Verbindung.
- Löschen verlangt eine Bestätigung und nennt, was entfällt. Laufende Tausche werden abgebrochen (`abgebrochen`, siehe US-SOZ-10).

### US-ACC-05 · Zugang nur per Einladung (Anfangsphase) · ⬜ neu
Als **Betreiber** will ich den Zugang zu Beginn begrenzen.

Akzeptanzkriterien:
- Registrierung nur mit gültigem Einladungscode, solange der Betreiber das so eingestellt hat. Codes sind einmalig und laufen ab.
- Der Betreiber sieht Zahl der Konten, aktive Nutzer und Kosten je Nutzer (NFR-16), keine Inhalte.

## Anforderungen

| ID | Anforderung | Status |
|---|---|---|
| FR-ACC-01 | Kontodaten (E-Mail, Anzeigename) sind getrennt von Sammlungsdaten gespeichert und nur dem Konto selbst zugänglich. | ⬜ |
| FR-ACC-02 | Jede nutzerbezogene Zeile trägt die Konto-Kennung ab der ersten Version (P-04, NFR-09). | ⬜ |
| FR-ACC-03 | Passwörter und Anmeldedaten werden nie selbst gespeichert, wenn ein etablierter Dienst sie verwaltet (NFR-10). | ⬜ |
| FR-ACC-04 | Minderjährige: Altersgrenze und Hinweise klären, bevor die App öffentlich wird (NFR-11). | ⬜ |
| FR-ACC-05 | Der Anmeldedienst muss zugleich als Autorisierungsserver für KI-Verbindungen taugen (OAuth mit eigenen Scopes, Zustimmungsseite, Widerruf; E-03, FR-KI-13). | ⬜ |
