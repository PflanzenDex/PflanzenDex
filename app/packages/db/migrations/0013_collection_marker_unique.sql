-- module: collection
-- Markers are unique per species and account, case-insensitive (US-BES-03, DM-BES-03). The name already is unique per
-- account (specimen_name_per_account); this index states the marker rule itself, so that renaming a specimen can never
-- give two pots of one species the same marker, whatever the display name says. Archived specimens count: their marker
-- stays taken like their name (US-BES-07). Specimens without a marker (the first of a species) are not covered.
-- Safe for existing data: a repeated marker of one species always produced the same name, which was refused already.
create unique index specimen_marker_per_species on specimen (account_id, species_id, lower(marker))
  where marker is not null;
