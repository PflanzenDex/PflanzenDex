-- Anmeldung (US-ACC-01, FR-ACC-01, FR-ACC-03): Zuordnung Anmeldedienst-Subjekt -> Konto und Kontodaten.
-- Passwörter liegen nie hier, sie verwaltet der Anmeldedienst (Keycloak, E-03).

-- `subjekt` ist die `sub`-Kennung des geprüften Tokens. NULL bleibt für Konten ohne Anmeldedienst (Tests).
alter table konto add column subjekt text unique;

-- Eigener Weg für Registrierung und erste Anmeldung: Dort ist die Konto-Kennung noch unbekannt, also gilt
-- zusätzlich zur Regel `mandant` eine Regel über die Sitzungsvariable `app.subjekt`. Sie zeigt und erlaubt
-- ausschließlich die Zeile des einen, vom API-Prozess geprüften Subjekts, nie fremde Konten.
create policy anmeldung_lesen on konto for select
  using (subjekt is not null and subjekt = nullif(current_setting('app.subjekt', true), ''));
create policy anmeldung_anlegen on konto for insert
  with check (subjekt is not null and subjekt = nullif(current_setting('app.subjekt', true), ''));

-- Kontodaten sind von den Sammlungsdaten getrennt und nur dem Konto selbst zugänglich (FR-ACC-01).
-- E-Mail-Bestätigung: erst mit `email_bestaetigt` darf das Konto Daten mit Freunden teilen (US-ACC-01).
create table kontodaten (
  konto_id uuid primary key references konto(id) on delete cascade,
  email text not null,
  anzeigename text,
  email_bestaetigt boolean not null default false,
  aktualisiert_am timestamptz not null default now()
);
select mandantenschutz('kontodaten');
