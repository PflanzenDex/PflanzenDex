-- module: collection
-- Indexes for foreign keys / tenant columns the index gate found uncovered (NFR-12, QG-D5). Without an index on the
-- child side, every delete or key update in the parent table scans this table; (account_id, x) is also the access path
-- "rows of one account pointing at x". An index starting with account_id also covers the tenant column and the account
-- foreign key. Plain `create index` (small tables, one transaction). Forward-only and additive.

create index care_profile_dormancy_location on care_profile (account_id, dormancy_location_id);
create index care_profile_growth_location on care_profile (account_id, growth_location_id);
create index care_profile_light_zone on care_profile (account_id, light_zone_id);
create index care_profile_species on care_profile (species_id);
create index specimen_location on specimen (account_id, location_id);
create index specimen_species on specimen (species_id);
