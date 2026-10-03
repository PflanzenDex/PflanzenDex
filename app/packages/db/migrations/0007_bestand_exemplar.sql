-- modul: bestand
-- Exemplare (US-BES-02, DM-BES-02, FR-BES-01, P-04). Messreihe und Behandlungsliste sind abgeleitet und haben hier
-- keine Spalten und keine Tabellen (WAC und BEH legen ihre eigenen an).

create table exemplar (
  id uuid primary key default gen_random_uuid(),
  konto_id uuid not null references konto(id) on delete cascade,
  -- Verweis auf eine Art des gemeinsamen Katalogs. Bewusst ohne Fremdschlüssel: der Katalog hat keine Konto-Kennung,
  -- AB-10 erlaubt über Modulgrenzen nur (konto_id, id). Die Operation prüft die Sichtbarkeit der Art; die Anwendung
  -- kann keine Art löschen (nur select und insert auf art), der Verweis hängt also nie.
  art_id uuid not null,
  -- Anzeigename nach DM-BES-03, vor dem Speichern festgelegt; die Identität ist die Kennung.
  name text not null check (char_length(name) between 1 and 250),
  kennzeichen text check (char_length(kennzeichen) between 1 and 40),
  -- Leer heißt „unbekannt“ (P-08): kein Soll-Standort bekannt und keiner gewählt; erscheint später in „Hinweise“ (BES-08).
  standort_id uuid,
  status text not null default 'pflanze' check (status in ('pflanze', 'steckling', 'archiviert')),
  -- Lokales Kalenderdatum des Nutzers, kein Zeitpunkt (NFR-08); fehlt es, gilt das Anlagedatum als „≈“ (US-POK-07).
  gefangen_am date,
  angelegt_am timestamptz not null default now(),
  -- Der Standort muss zum selben Konto gehören; ohne Standort (null) wird nichts geprüft.
  constraint exemplar_standort foreign key (konto_id, standort_id) references standort (konto_id, id)
);
-- Der Name ist je Konto eindeutig, ohne Beachtung der Schreibweise. Archivierte Exemplare zählen mit (BES-07 klärt, ob
-- ein archivierter Name wieder frei wird).
create unique index exemplar_name_je_konto on exemplar (konto_id, lower(name));
create index exemplar_art on exemplar (konto_id, art_id);
select mandantenschutz('exemplar');
