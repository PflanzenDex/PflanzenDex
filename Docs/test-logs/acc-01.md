# Testprotokoll: US-ACC-01 Registrieren und anmelden (Issue #52)

**Branch:** `feat/acc-01-anmeldung` (Basis `origin/dev` @ `257be45`)
**Umgebung:** WSL2/Linux, Node 24, Docker; Keycloak 26.8.0 (`make auth-up`) mit Mailpit, PostgreSQL 16 (eigene Datenbank `pflanzendex_acc01`), API auf Port 3000, Web (Vite) auf Port 5173; Browser Chromium über Playwright, Locale `en`/Keycloak per `ui_locales=de` auf Deutsch; Datum 2026-10-03.
**Methode:** `make ci`, danach der Ablauf von Hand im Browser gegen den echten Keycloak. Screenshots Desktop 1440×900 und Mobil 375×812 in `acc-01/`. Testkonto: `lena@example.test`.

Legende: ✅ wie erwartet · ⚠️ funktioniert, aber Auffälligkeit · ❌ Fehler · ⏭️ nicht geprüft

---

## 0. Gates

**Erwartet:** `make ci` läuft grün (Lint, Typen, Grenzen, Format, Tests, Build).

**Beobachtet:**
- ✅ `make ci` Exit-Code 0 mit eigener Test-Datenbank. Tests: api 15, core 31, db 19, web 12, Prüfskripte 17.
- ✅ Die Tests laufen ohne Keycloak (Token mit lokal erzeugtem Schlüssel; Konto-Routen gegen echte PostgreSQL).
- ⚠️ In CI (GitHub) läuft kein Keycloak: Der Ablauf unten ist **nur manuell** belegt, nicht automatisiert.

## 1. Kriterium: Registrierung mit E-Mail und etabliertem Verfahren (E-03)

**Erwartet:** Start → „Konto anlegen“ → Registrierungsformular des Anmeldedienstes (E-Mail, Name), Passwort wird nicht von uns verarbeitet; nach der Registrierung steht die Person angemeldet in der App.

**Beobachtet:**
- ✅ Startseite mit „Konto anlegen“ und „Anmelden“ (`01-start-mobil.png`, `01-start-desktop.png`).
- ✅ „Konto anlegen“ öffnet bei Keycloak direkt die Registrierung (`prompt=create`), deutsch dank `ui_locales=de` (`02-registrierung-mobil.png`, `02-registrierung-desktop.png`).
- ⚠️ Ohne `ui_locales` erschien die Seite englisch (Browsersprache); mit dem Parameter behoben.
- ✅ Das Registrierformular fragt **kein Passwort**; Keycloak 26.8 verlangt zuerst die E-Mail-Bestätigung und danach die Passwortvergabe (siehe 2). Die Passwort-Richtlinie (mindestens 10 Zeichen) greift: „Ungültiges Passwort: Es muss mindestens 10 Zeichen lang sein.“ (`04-passwort-zu-kurz-mobil.png`).
- ✅ Nach gültigem Passwort Rückkehr in die App, angemeldet: „Hallo, Lena Beispiel“, E-Mail sichtbar (`05-angemeldet-mobil.png`, `06-angemeldet-desktop.png`).
- ✅ In der Datenbank steht genau ein Konto mit `subjekt` = Keycloak-`sub`, Kontodaten (E-Mail, Anzeigename „Lena Beispiel“, `email_bestaetigt = true`). Es gibt keine Passwortspalte (FR-ACC-03).
- ⏭️ Magic Link und Drittanbieter-Anmeldung: nicht konfiguriert (das Kriterium nennt sie als Alternativen; umgesetzt ist Passwort).
- ⏭️ Registrierung mit bereits vergebener E-Mail: nicht geprüft; Keycloak meldet dort standardmäßig, dass die Adresse vergeben ist (Hinweis auf Existenz, bewusst nicht Teil des Kriteriums „falsche Anmeldedaten“).

## 2. Kriterium: E-Mail-Adresse wird bestätigt, bevor Daten mit Freunden geteilt werden

**Erwartet:** Das Konto erhält eine Bestätigungsmail; ohne Bestätigung ist das Teilen gesperrt.

**Beobachtet:**
- ✅ Nach „Registrieren“ zeigt Keycloak „E-Mail verifizieren“ (`03-email-bestaetigen-mobil.png`); die Mail liegt in Mailpit mit 5 Minuten gültigem Link; der Link führt zur Passwortvergabe und danach in die App.
- ✅ Gegenprobe: `emailVerified` per Admin-API auf `false` gesetzt, Anmeldung → Keycloak verlangt die Bestätigung erneut und lässt die Person nicht in die App (`13-email-erneut-bestaetigen-mobil.png`). Nach dem Klick auf den neuen Link ist sie angemeldet.
- ✅ API: Ein Token mit `email_verified: false` liefert `emailBestaetigt: false` und `darfMitFreundenTeilen: false`; die Schranke `nurMitBestaetigterEmail` antwortet `403 email_unbestaetigt` (API-Test mit echter Datenbank).
- ⚠️ Der Hinweis „E-Mail-Adresse bestätigen …“ in der App (unbestätigter Zustand) ist nur per Komponententest belegt: Unter dieser Realm-Konfiguration kommt eine unbestätigte Person gar nicht bis in die App (siehe oben). Er ist Rückfallebene für spätere Anmeldewege.
- ⏭️ Das Teilen mit Freunden selbst existiert noch nicht (SOZ); geprüft ist nur die Schranke.

## 3. Kriterium: Anmeldung bleibt erhalten, ist aber widerrufbar

**Erwartet:** Seite neu laden bleibt angemeldet; „Auf allen Geräten abmelden“ beendet alle Sitzungen.

**Beobachtet:**
- ✅ Neuladen der Seite: weiterhin angemeldet (Token im Browserspeicher, Verlängerung über Refresh-Token).
- ✅ „Abmelden“ beendet die Sitzung bei Keycloak und in der App; danach „Du bist abgemeldet.“ (`07-abgemeldet-mobil.png`).
- ✅ „Auf allen Geräten abmelden“ (zweiter Browser-Kontext als zweites Gerät): vorher 3 Sitzungen in der Account-API, danach „Du bist auf allen Geräten abgemeldet.“ (`10-ueberall-abgemeldet-mobil.png`). Der Refresh-Token des zweiten Geräts liefert danach `invalid_grant`.
- ⚠️ **Fund beim Test:** Der erste Versuch scheiterte (in der Oberfläche „… fehlgeschlagen“), weil die Account-API ohne `Accept: application/json` keine CORS-Kopfzeilen liefert. Behoben (Kopfzeile gesetzt, Test angepasst), danach erneut geprüft.
- ⚠️ Zugriffstoken sind JWTs mit 5 Minuten Laufzeit und werden von der API nur lokal geprüft: Ein bereits ausgestelltes Token des zweiten Geräts bleibt bis zu 5 Minuten gültig, bis es abläuft. Nicht gemessen, folgt aus dem Aufbau.
- ⚠️ Nach dem Abmelden fehlte zunächst der Hinweis „Du bist abgemeldet.“ (Merker wurde im doppelten Effektlauf des React-Strict-Mode gelöscht). Behoben und erneut gesehen.

## 4. Kriterium: Falsche Anmeldedaten verraten nicht, ob die E-Mail existiert

**Erwartet:** Bekannte E-Mail mit falschem Passwort und unbekannte E-Mail zeigen dieselbe Meldung.

**Beobachtet:**
- ✅ Beide Fälle: „Ungültiger Benutzername oder Passwort.“ (Text identisch, `09-login-falsch-desktop.png` für den bekannten Fall; Login-Seite `08-login-desktop.png`, `12-login-mobil.png`).
- ⏭️ Keine Messung von Antwortzeiten; Brute-Force-Schutz ist im Realm eingeschaltet (5 Fehlversuche), das Sperren selbst wurde nicht ausgelöst.

## 5. API: Token prüfen und Konto je Anfrage setzen

**Erwartet:** Ohne oder mit ungültigem Token 401; gültiges Token setzt das Konto über `mitKonto`; fremde Konten sind unsichtbar.

**Beobachtet:**
- ✅ `curl /konto` ohne Token: `401`, `WWW-Authenticate: Bearer`, Antwort `nicht_angemeldet` ohne Grund.
- ✅ Tests mit lokalem Schlüssel: falscher Aussteller, falsches Ziel, abgelaufen, fremde Signatur, `alg: none` und Unsinn werden abgewiesen.
- ✅ Mit echtem Keycloak-Token liefert die App das eigene Konto (Abschnitt 1).
- ✅ DB-Tests: gleichzeitige Erstanmeldung (3 parallele Aufrufe) ergibt genau ein Konto; der Anmeldeweg sieht ohne Subjekt keine Zeilen; Kontodaten sind je Konto getrennt; der generische Mandantentest bleibt grün.
- ⏭️ Token mit falschem Ziel gegen den echten Keycloak: nur im Komponententest geprüft.

## 6. Mobil (375 px)

- ✅ Startseite, Anmeldung, Registrierung (Keycloak), angemeldete Ansicht und Abmelden sind in den Screenshots ohne abgeschnittene Inhalte lesbar; Schaltflächen 48 px hoch.
- ⏭️ Kein automatischer Test auf horizontales Scrollen und keine Kontrastmessung.
- ⚠️ Die Seiten von Keycloak verwenden das Standard-Theme (nicht PflanzenDex-Design); Anpassung ist nicht Teil dieser Story.
- ⚠️ `favicon.ico` fehlt (404 in der Konsole).

## Offene Punkte

- Keycloak-Ablauf ist nur manuell geprüft (kein Keycloak in der CI); ein Integrationstest mit Container wäre Folgearbeit.
- Das Realm-Export ist für die Entwicklung (`start-dev`, H2, `http`). Produktionsbetrieb (Datenbank, HTTPS, echtes Mail-Relay, Domains der Redirect-URIs) gehört zu TE-03/Betrieb.
- Keycloak warnt, dass „Full scope allowed“ für den Web-Client veraltet ist.
