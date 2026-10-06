-- module: pokedex
-- Taxonomy tree of the Pokédex (US-POK-03, FR-POK-03, DM-POK-01, P-08). One row per species name of the approved
-- catalog: resolved (order, family, genus, Wikipedia text and image, GBIF species count of the genus, each with its
-- source) or unresolved (reason code, the error list of the build). Written only by the build job, which replaces all
-- rows in one transaction (the previous good tree stays when a build fails). Unknown values are NULL, never invented.
-- Forward-only and expand only: the previous app version does not know the table and keeps working.
-- The table is shared by all accounts and holds no user data: no account id, read-only for the application role
-- (the Pokédex views read it, US-POK-04/05), written by the worker with the owner role.

create table taxon (
  -- Name as the catalog writes it (genus and epithet): the key.
  latin_name text primary key check (char_length(latin_name) between 2 and 160),
  status text not null check (status in ('resolved', 'unresolved')),
  -- `taxonomy.<reason>` exactly for unresolved rows (stable error code, FR-QG-11).
  failure_code text check (failure_code ~ '^[a-z_]+\.[a-z_]+$'),
  -- Current name when the catalog name is a synonym (Sansevieria -> Dracaena).
  accepted_name text check (char_length(accepted_name) between 2 and 160),
  genus text check (char_length(genus) between 2 and 60),
  family text check (char_length(family) between 2 and 120),
  order_name text check (char_length(order_name) between 2 and 120),
  ott_id bigint,
  summary text check (char_length(summary) between 1 and 240),
  summary_language text check (summary_language in ('de', 'en')),
  image_url text check (char_length(image_url) between 1 and 2000),
  page_url text check (char_length(page_url) between 1 and 2000),
  -- 0 means unknown and is stored as NULL.
  genus_species_count integer check (genus_species_count > 0),
  -- Source, URL and retrieval time per value group: {"lineage": {...}, "text": {...}, "genus_count": {...}}.
  provenance jsonb not null default '{}' check (jsonb_typeof(provenance) = 'object'),
  -- Fingerprint of the catalog names of the build: equal fingerprint, nothing to build.
  catalog_fingerprint text not null check (char_length(catalog_fingerprint) between 1 and 64),
  built_at timestamptz not null,
  check ((status = 'unresolved') = (failure_code is not null)),
  check (status = 'resolved' or (accepted_name is null and genus is null and summary is null and image_url is null
                                 and genus_species_count is null)),
  check (status = 'unresolved' or (accepted_name is not null and genus is not null))
);
create index taxon_family on taxon (family) where status = 'resolved';
revoke all on taxon from public;
grant select on taxon to pflanzendex_app;
alter table taxon enable row level security;
create policy shared_read on taxon for select to pflanzendex_app using (true);
