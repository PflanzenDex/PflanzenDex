-- modul: pflege
-- Messungen (US-WAC-01, DM-WAC-01, P-04). Rate, Trend und Bewertung des Verlaufs sind abgeleitet und haben hier keine
-- Spalten (P-01). Das Foto (Teil von US-WAC-01) fehlt noch: es braucht die Medienverarbeitung (FR-WAC-09).

create table messung (
  id uuid primary key default gen_random_uuid(),
  konto_id uuid not null references konto(id) on delete cascade,
  exemplar_id uuid not null,
  -- Lokales Kalenderdatum des Nutzers, kein Zeitpunkt (NFR-08); mehrere Messungen am selben Tag sind erlaubt (FR-WAC-07).
  datum date not null,
  -- In der Einheit des Wachstumsmaßes der Art (cm). Schritt 0,5 (US-WAC-01), eine Nachkommastelle, damit nichts still gerundet wird (P-10). Obergrenze 10000 ist eine Annahme (Startwert), wie in `core`.
  wert numeric(7, 1) not null check (wert >= 0 and wert <= 10000),
  -- Eine Messung ohne Qualität gilt als gesund (US-WAC-02); neue Messungen tragen sie immer.
  qualitaet text not null default 'gesund' check (qualitaet in ('gesund', 'vergeilt')),
  notiz text check (char_length(notiz) between 1 and 1000),
  bewertung_durch text not null default 'halter' check (bewertung_durch in ('halter', 'ki_uebernommen')),
  angelegt_am timestamptz not null default now(),
  -- Das Exemplar muss zum selben Konto gehören.
  constraint messung_exemplar foreign key (konto_id, exemplar_id) references exemplar (konto_id, id) on delete cascade
);
create index messung_exemplar_datum on messung (konto_id, exemplar_id, datum desc, angelegt_am desc);
select mandantenschutz('messung');
