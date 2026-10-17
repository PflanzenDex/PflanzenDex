-- Lichtzonen und Standorte (US-LIC-05, FR-LIC-01, P-04) sowie Wiederholungsschutz für Operationen (AB-3).

-- Lichtzonen sind Daten des Kontos, nicht hartkodiert. Die Grenzen entsprechen den Annahmen in core (LICHT_GRENZEN).
create table lichtzone (
  id uuid primary key default gen_random_uuid(),
  konto_id uuid not null references konto(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  lux_decke integer not null check (lux_decke between 1 and 200000),
  ppfd integer check (ppfd between 1 and 3000),
  reihenfolge integer not null check (reihenfolge between 0 and 999),
  angelegt_am timestamptz not null default now(),
  -- Ziel des zusammengesetzten Fremdschlüssels von standort: eine Zone ist nur im eigenen Konto zuordenbar.
  unique (konto_id, id)
);
create unique index lichtzone_name_je_konto on lichtzone (konto_id, lower(name));
select mandantenschutz('lichtzone');

-- Der Standort verweist über die Kennung auf die Zone (kein Textvergleich, FR-PHA-03 des Prototyps entfällt).
-- Ohne Zone (lichtzone_id leer) ist er zulässig und erscheint in „Hinweise“. Kein ON DELETE-Verhalten: Eine Zone mit
-- Standorten lässt sich nicht löschen (NO ACTION, am Ende der Anweisung geprüft, damit das Löschen eines Kontos
-- beide Tabellen in einem Zug räumen kann).
create table standort (
  id uuid primary key default gen_random_uuid(),
  konto_id uuid not null references konto(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  lichtzone_id uuid,
  art text not null check (art in ('innen', 'aussen')),
  angelegt_am timestamptz not null default now(),
  foreign key (konto_id, lichtzone_id) references lichtzone (konto_id, id)
);
create unique index standort_name_je_konto on standort (konto_id, lower(name));
create index standort_zone on standort (lichtzone_id);
select mandantenschutz('standort');

-- Wiederholungsschutz (IdempotenzSpeicher in core): derselbe Schlüssel zweier Konten ist nie derselbe Eintrag.
-- Einträge gelten 24 Stunden (Startwert, Annahme); danach zählt der Schlüssel wieder als neu.
create table idempotenz (
  konto_id uuid not null references konto(id) on delete cascade,
  operation text not null,
  schluessel text not null,
  fingerabdruck text not null,
  ergebnis jsonb,
  fertig boolean not null default false,
  angelegt_am timestamptz not null default now(),
  primary key (konto_id, operation, schluessel)
);
select mandantenschutz('idempotenz');
