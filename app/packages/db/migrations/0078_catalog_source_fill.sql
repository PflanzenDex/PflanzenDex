-- module: catalog
-- US-BES-12, DM-BES-05, DM-BES-06, FR-BES-12: raw answers of the open sources per species and the origin of every
-- catalog value the fill job sets. Both tables are shared like the catalog (no account id, P-05) and visible exactly
-- like the species they belong to; the application role can only read, the worker (owner role) writes.
-- Forward-only and expand only: new tables and one owner-only update policy; the previous app version ignores them.

create table catalog_source_snapshot (
  species_id uuid not null references species (id) on delete cascade,
  source text not null check (source in ('gbif', 'wikidata', 'wikipedia')),
  source_id text check (char_length(source_id) between 1 and 200),
  retrieved_at timestamptz not null,
  link text not null check (link ~ '^https://[^/?#@]+' and char_length(link) <= 2000),
  license text not null check (char_length(license) between 1 and 40),
  -- The answer as received; null = the source answered "no hit" (kept so the job does not ask again, P-08).
  raw jsonb,
  primary key (species_id, source)
);

create table catalog_field_provenance (
  species_id uuid not null references species (id) on delete cascade,
  field text not null check (field in ('family_latin', 'german_name', 'botanical_story')),
  -- The catalog version of the species that set the value (FR-BES-12); older rows form the history.
  version integer not null check (version >= 1),
  value text not null check (char_length(value) between 1 and 1000),
  origin text not null check (origin in ('source', 'ai', 'community', 'reviewer', 'operator')),
  source text check (source in ('gbif', 'wikidata', 'wikipedia')),
  link text check (link ~ '^https://[^/?#@]+' and char_length(link) <= 2000),
  license text check (char_length(license) between 1 and 40),
  retrieved_on date,
  disputed boolean not null default false,
  set_at timestamptz not null default now(),
  primary key (species_id, field, version),
  -- A value from a source never exists without source, link, license and date (FR-BES-16, P-08).
  check (origin <> 'source' or (source is not null and link is not null and license is not null and retrieved_on is not null))
);

revoke all on catalog_source_snapshot, catalog_field_provenance from public;
grant select on catalog_source_snapshot, catalog_field_provenance to pflanzendex_app;
alter table catalog_source_snapshot enable row level security;
alter table catalog_field_provenance enable row level security;
create policy visible on catalog_source_snapshot for select to pflanzendex_app using (species_status(species_id) is not null);
create policy visible on catalog_field_provenance for select to pflanzendex_app using (species_status(species_id) is not null);

-- `species` has forced row security and no UPDATE policy for the owner (see lock_for_merge, 0017). The fill job fills
-- empty fields as the owner role; it opens the policy for its own transaction only (set_config(..., true)), so no other
-- owner session changes species rows by accident. The application role has no UPDATE privilege on species.
do $$
begin
  execute format(
    'create policy catalog_fill on species for update to %I using (current_setting(''app.catalog_fill'', true) = ''on'')',
    current_user
  );
end
$$;
