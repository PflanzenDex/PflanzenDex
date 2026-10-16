-- module: pokedex
-- US-POK-13, DM-POK-01, P-08: rarity in nature of a species, taken by the taxonomy build from GBIF (IUCN Red List category
-- and occurrence count), each value with its source and retrieval date in `provenance` (keys `iucn`, `occurrences`).
-- Unknown is NULL, never estimated; a count of 0 is stored as NULL. Written only by the build job with the rest of the
-- row (the table is replaced as a whole). Shared by all accounts, holds no user data: no account id.
-- Forward-only and expand only: the previous app version does not know the columns and keeps working.

alter table taxon
  add column nature_iucn_category text check (nature_iucn_category in ('LC', 'NT', 'VU', 'EN', 'CR', 'EW', 'EX', 'DD')),
  add column nature_gbif_occurrences bigint check (nature_gbif_occurrences > 0),
  add constraint taxon_nature_rarity_resolved
    check (status = 'resolved' or (nature_iucn_category is null and nature_gbif_occurrences is null));
