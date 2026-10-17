-- module: pokedex
-- US-ENT-09, DM-ENT-01, P-08: researched attributes of a species (humidity, minimum temperature, growth size, toxic to
-- pets), one row per species and field, each with source, link, license and retrieval date. A row without all four
-- evidence columns cannot exist; an unknown field simply has no row. Only citable sources (gbif, wikipedia, wikidata),
-- never an AI statement (US-KI-06). Keyed by the catalog's Latin name without a foreign key because the build job replaces
-- `taxon` as a whole. Shared by all accounts, holds no user data: no account id, read-only for the application role,
-- written by the worker with the owner role.
-- Forward-only and expand only: the previous app version does not know the table and keeps working.

create table taxon_attribute (
  latin_name text not null check (char_length(latin_name) between 2 and 160),
  field text not null check (field in ('humidity', 'min_temperature', 'growth_size', 'toxic_to_pets')),
  value jsonb not null,
  source text not null check (source in ('gbif', 'wikipedia', 'wikidata')),
  source_url text not null check (source_url ~ '^https://[^/?#@]+' and char_length(source_url) <= 2000),
  license text not null check (license in ('CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'CC-BY-SA-3.0')),
  retrieved_on date not null,
  primary key (latin_name, field),
  check (
    (field = 'humidity' and value in ('"low"', '"medium"', '"high"'))
    or (field = 'growth_size' and value in ('"small"', '"medium"', '"large"'))
    or (field = 'min_temperature' and jsonb_typeof(value) = 'number' and (value #>> '{}')::numeric between -30 and 30)
    or (field = 'toxic_to_pets' and jsonb_typeof(value) = 'boolean')
  )
);
revoke all on taxon_attribute from public;
grant select on taxon_attribute to pflanzendex_app;
alter table taxon_attribute enable row level security;
create policy shared_read on taxon_attribute for select to pflanzendex_app using (true);
