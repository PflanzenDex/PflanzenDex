-- module: light
-- Indexes for foreign keys / tenant columns the index gate found uncovered (NFR-12, QG-D5). Without an index on the
-- child side, every delete or key update in the parent table scans this table; (account_id, x) is also the access path
-- "rows of one account pointing at x". An index starting with account_id also covers the tenant column and the account
-- foreign key. Plain `create index` (small tables, one transaction). Forward-only and additive.

create index location_light_zone on location (account_id, light_zone_id);
