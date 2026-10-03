# Spike TE-15: OAuth-Autorisierungsserver für den KI-Zugang (MCP)

Stand: 2026-10-03 · Ticket TE-15 · Absicherung der Entscheidungen E-03 (Anmeldedienst) und E-04 (KI-Zugang).

## Kurzfassung

- **Empfehlung und Entscheidung: Keycloak** (selbst gehostet) als Anmeldedienst und OAuth-Autorisierungsserver. Von den zwei getesteten Kandidaten erfüllt nur Keycloak unser Rechte-Modell (eigene Scopes mit Step-up, `resource`/Audience, Zustimmung, Domain-Beschränkung der Registrierung, JWT-Token).
- **Nicht nachgewiesen:** Die Verbindung mit den echten Clients. **Claude** scheiterte beim Verbinden über die Client-ID-Metadata-Variante (CIMD) an einer Keycloak-Ablehnung (Ursache eingegrenzt, nicht behoben). **ChatGPT** und **Claude Code** wurden nicht getestet. Das ist ein offener Punkt, kein Erfolg (Folgeticket TE-16).
- **Zwei Keycloak-Funktionen, auf die wir bauen, sind in 26.8.0 noch „experimentell":** `cimd` und `resource-indicators`. Das ist ein Betriebs- und Änderungsrisiko.
- Der Spike wurde auf Wunsch des Projektverantwortlichen an dieser Stelle beendet; die unten genannten Lücken sind bewusst offen geblieben.

## Aufbau

Alles selbst gehostet per Docker, Wegwerf-Setup in diesem Ordner:

| Teil | Inhalt |
|---|---|
| `keycloak/` | Keycloak 26.8.0 mit `--features=cimd,resource-indicators`, `start-dev`, H2 |
| `zitadel/` | Zitadel v4.19.4 nach dem offiziellen Compose-Setup (Traefik, API, Login-UI, Postgres) |
| `mcp-test-server/` | Minimaler MCP-Server (Streamable HTTP, SDK 1.32.0) als OAuth Resource Server: Protected Resource Metadata (RFC 9728), JWT-Prüfung (Issuer, Audience), drei Tools mit den Klassen `lesen`, `Entwurf`, `schreiben`, Step-up per `403 insufficient_scope` |
| `checks/` | Prüfskripte: Discovery und DCR, vollständiger Ablauf mit Browser-Login (Playwright), CIMD-Simulation, Policies |

Getestet wurde zuerst lokal, danach über öffentliche Quick-Tunnel (Cloudflare) mit den echten Clients.

## Ergebnis je Kriterium

| Kriterium | Keycloak 26.8.0 | Zitadel v4.19.4 |
|---|---|---|
| Discovery | RFC 8414 und OIDC | nur OIDC (reicht laut MCP-Spec) |
| PKCE | S256 und `plain` beworben | nur S256 |
| Anonyme DCR (RFC 7591) | ja; **Domain-Beschränkung** über Policy „Trusted Hosts" (`client-uris-must-match`) | ja; **keine Beschränkung der Redirect-Hosts**, auch `http://evil.example.org/cb` wurde akzeptiert |
| Unbekannte Felder in DCR | **400** (`UnrecognizedPropertyException`, Issue #53363, offen) | werden ignoriert (RFC 7591 §2) |
| CIMD | ja (experimentell); sauberes Dokument akzeptiert; **Dokument mit ChatGPT-typischem Feld `token_endpoint_auth_methods_supported` abgelehnt**; **Dokument mit Grant `jwt-bearer` (wie Claudes echtes Dokument) abgelehnt** | nicht vorhanden |
| `resource` (RFC 8707) | ja, mit Feature `resource-indicators`; falsche `resource` → `invalid_target`; `aud` = MCP-URL | wird akzeptiert und **ignoriert** (Token auch bei falscher `resource`) |
| Eigene Scopes, Step-up | ja; `pflanzen:read/draft/write`; `403 insufficient_scope` → erneute Autorisierung liefert höheres Recht | eigene Scopes nicht belegt: Token-Antwort ohne `scope`-Feld, Inhalt des opaken Tokens nicht prüfbar |
| `iss`-Parameter (RFC 9207) | ja | nicht beworben |
| Consent | Seite vorhanden (deutsch), **aber ohne Auswahl einzelner Scopes** („Ja"/„Nein") | **keine Zustimmungsseite** |
| Token | JWT, 5 Minuten, Prüfung per JWKS | opak (Introspektion mit eigener API-Anwendung nötig, nicht ausprobiert) |
| Refresh | Rotation (neues Refresh-Token), Widerruf wirksam (`invalid_grant`) | Rotation, Widerruf wirksam (`invalid_request`) |
| Betrieb | 1 Container (plus Datenbank in Produktion), ca. 800 MiB RAM im Dev-Modus, Start 10 s, Image 474 MB | 4 Container (Proxy, API, Login-UI, Postgres), zusammen ca. 360 MiB RAM |
| Oberfläche | Login und Zustimmung auf Deutsch, Theme anpassbar | Login auf Deutsch |

![Zustimmungsseite von Keycloak](consent-keycloak.png)

## Befunde zu Keycloak (Konfiguration, die man kennen muss)

1. **Audience nur über Mapper:** Die Funktion `resource-indicators` engt die Audience nur auf Werte ein, die schon als Kandidaten im Token stehen. Der MCP-Server muss als Client mit Attribut `resource_url` registriert sein **und** an den `pflanzen:*`-Scopes hängt ein Audience-Mapper. Ohne Mapper: `invalid_target`. Ohne `resource`-Parameter steht die Client-ID statt der URL in `aud` (der Server lehnt das ab, gewollt).
2. **Registrierung absichern:** Standardmäßig blockiert „Trusted Hosts" jede anonyme DCR. Für öffentliche Clients wird die Prüfung der Absender-IP abgeschaltet und stattdessen `client-uris-must-match` mit den Domains `claude.ai`, `chatgpt.com` gesetzt. Dann sind nur Clients mit Redirect-URIs auf diesen Domains registrierbar.
3. **Scopes:** Die drei Scopes müssen als optionale Realm-Scopes angelegt und in der Policy „Allowed Client Scopes" erlaubt sein. Der Consent zeigt sonst zusätzlich Standard-Scopes („Benutzerprofil", „Nutzerrollen", „E-Mail"), die wir für diese Clients ausblenden würden.
4. **Zustimmung ist alles oder nichts.** Eine Abwahl einzelner Rechte, wie in US-KI-07 beschrieben, geht mit dem Standard nicht. Dafür braucht es ein eigenes Consent-Theme bzw. einen eigenen Zustimmungsschritt, oder die Story wird angepasst.
5. **PKCE `plain`** wird mitbeworben. ChatGPT verlangt S256; die Beschränkung auf S256 sollte per Client-Policy erzwungen werden.
6. **CIMD-Policy:** Konfiguriert über Client-Policy-Profil (`client-id-metadata-document`: `cimd-allow-permitted-domains`, `cimd-resource-indicator-allow-list`, …) und Bedingung `client-id-uri`. Die Domains gelten für **alle** URL-Felder des Dokuments, nicht nur für die Client-ID.

## Befunde zu den echten Clients

- **Claude (claude.ai, Custom Connector):** Claudes Server holte `initialize` und die Protected Resource Metadata (beides korrekt beantwortet), der Login-Versuch endete in Keycloak mit „invalid request" (Ereignis `LOGIN_ERROR`, `client_policy_error`). Claude verwendete offenbar die Client-ID `https://claude.ai/oauth/mcp-oauth-client-metadata` (CIMD; aus dem Fehlerbild geschlossen, die Anfrage selbst war in den Logs nicht sichtbar). Deren öffentliches Dokument deklariert `token_endpoint_auth_method: none` **und** den Grant `urn:ietf:params:oauth:grant-type:jwt-bearer`. Eine Kopie dieses Dokuments, nur mit dem Grant `jwt-bearer` als Unterschied, löst denselben Fehler aus. Das Executor-Flag `accept-public-client-with-confidential-client-only-grant` hätte das nach der Beschreibung im Quellcode ändern sollen, hatte in den Tests aber keine Wirkung. **Ob der Wert in der Policy tatsächlich gespeichert wurde, ist ungeklärt** (die abgefragte Konfiguration enthielt den Schlüssel nicht). Nicht getestet: die Claude-Option „automatisch registrieren" (DCR) und „eigener OAuth-Client".
- **ChatGPT:** nicht getestet. Simulation: Ein CIMD-Dokument mit `token_endpoint_auth_methods_supported` scheitert in Keycloak 26.8.0 mit „Client Metadata fetch failed" (Ursache im Log: `UnrecognizedPropertyException`). Das Keycloak-Issue #51039 zu genau diesem Fall ist geschlossen, der Fix wirkt in dieser Version nicht. Laut OpenAI-Doku unterstützt ChatGPT auch DCR und vorab registrierte Clients; ob ChatGPTs DCR-Body das Feld enthält, ist unbekannt.
- **Claude Code:** nicht getestet.

## Nicht geprüft

Ory Hydra (nur mit eigener Login- und Nutzerverwaltung), Authentik, Gemini und weitere Clients, Introspektion bei Zitadel, Dauerbetrieb und Upgrade-Verhalten, Theme-Anpassung, Lasttests, Ausfall- und Backup-Verhalten von Keycloak.

## Bewertung und Empfehlung

Keycloak ist der einzige Kandidat, mit dem unser Rechte-Modell (Scopes, Step-up, Audience, Zustimmung, kontrollierte Registrierung) ohne Eigenbau-Schicht funktioniert. Zitadel scheidet nach dem Test aus: eigene Scopes nicht belegt, `resource` wird ignoriert, keine Zustimmung, offene Registrierung ohne Host-Beschränkung, opake Token.

Preis der Entscheidung für Keycloak:

- **Experimentelle Features** (`cimd`, `resource-indicators`) in der Produktion; Updates sind sorgfältig zu testen.
- **Client-Kompatibilität offen:** Die zwei wichtigsten Clients konnten nicht erfolgreich verbunden werden. Mögliche Wege (in dieser Reihenfolge prüfen): Claude über DCR statt CIMD; ChatGPT über einen **vorab registrierten gemeinsamen Client** (Redirect-Muster `https://chatgpt.com/connector/oauth/*` und der stabile URI); ein kleiner Proxy, der DCR-Bodies von unbekannten Feldern bereinigt; Fix oder Patch bei Keycloak (Issues #53363, #51039).
- **Zustimmung ohne Abwahl:** US-KI-07 anpassen oder ein eigenes Consent-Theme bauen.
- **Betrieb:** ein zusätzlicher Dienst mit Java-Laufzeit, Backups und Updates (Risiko R-09 in `16`).

## Folgen für Spec und Backlog

- E-03: Keycloak als Anmeldedienst im Grundsatz entschieden (Spec `16`, Ticket #22).
- E-04: offener Punkt „Test an realen Clients" bleibt, jetzt mit konkretem Stand (Spec `16`, Ticket #23).
- Neues Ticket **TE-16**: Anbindung von Claude und ChatGPT an Keycloak nachweisen (Folgearbeit aus diesem Spike).
- Spec `12`, offene Fragen: Zustimmung ohne Abwahl einzelner Rechte.
- Keine Termine, keine Zahlen ohne Messung: Die Betriebskennzahlen oben stammen aus dem Dev-Modus mit einem Nutzer und sind nicht auf Produktion übertragbar.

## Reproduktion

```bash
# Keycloak (Hostname bei Tunnel-Tests per KC_HOSTNAME setzen)
cd keycloak && docker compose -p te15-kc up -d
cd ../checks && npm install && npx playwright install chromium
node setup-keycloak.mjs && node 02-kc-policies.mjs && node 03-kc-resource.mjs http://localhost:18081/mcp && node 05-kc-audience.mjs
# MCP-Testserver
cd ../mcp-test-server && npm install && AS_ISSUER=http://localhost:18080/realms/pflanzendex RESOURCE_URL=http://localhost:18081/mcp node server.mjs
# Ablauf-Test (anderes Terminal)
cd ../checks && node 04-flow-keycloak.mjs
```

Für Tests mit Cloud-Clients braucht es öffentliche HTTPS-Adressen für Keycloak und den MCP-Server. In dieser Umgebung funktionierte `cloudflared` nur im Docker-Container mit `--dns 1.1.1.1` (der DNS-Resolver des WSL löste die SRV-Einträge von Cloudflare nicht auf). Admin- und Testpasswörter in `checks/11-kc-harden.mjs` sind Zufallswerte, die in einer nicht eingecheckten Datei landen.

## Quellen

- MCP-Spezifikation, Abschnitt Authorization: https://modelcontextprotocol.io/specification/latest/basic/authorization
- Keycloak, MCP als Autorisierungsserver: https://www.keycloak.org/securing-apps/mcp-authz-server
- Keycloak Issues: #51039 (CIMD, geschlossen), #53363 (DCR mit unbekannten Feldern, offen)
- Zitadel, Dynamic Client Registration: https://zitadel.com/docs/guides/integrate/dynamic-client-registration
- OpenAI, OAuth-Anforderungen für Konnektoren: https://developers.openai.com/plugins/build/auth
- Claude, Custom Connectors: https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
