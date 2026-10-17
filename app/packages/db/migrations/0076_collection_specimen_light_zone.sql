-- module: collection
-- US-LIC-02, US-BES-04, FR-LIC-02, P-04: a specimen may carry its own light zone, which overrides the zone of its species
-- and of its location in the effective zone (card, distribution, map). `null` means "not set" (the zone is derived).
-- The composite foreign key (account_id, light_zone_id) ties the zone to the own account (no foreign zone, same rule as
-- `specimen_location`); a zone that a specimen points to cannot be deleted unnoticed (P-10). The row rule of the table applies.
-- Expand only: a nullable column; the previous app version ignores it.

alter table specimen add column light_zone_id uuid;

alter table specimen add constraint specimen_light_zone
  foreign key (account_id, light_zone_id) references light_zone (account_id, id);

create index specimen_light_zone on specimen (account_id, light_zone_id);
