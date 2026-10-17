-- module: collection
-- Care profile per account and species (US-BES-09, DM-BES-04, FR-BES-09, P-04, P-05). Deviations from the catalog
-- values only: a column that is null means "no deviation, the catalog applies", so an empty profile is valid. The
-- effective profile (specimen before profile before catalog) and the zone derived from the lux need are derived on
-- every request and have no columns here (P-01). The catalog itself is never changed by this table.

create table care_profile (
  account_id uuid not null references account(id) on delete cascade,
  -- The species is a global reference table without account_id (AB-10, registered in modules.config.mjs): a plain
  -- foreign key on (id) with on delete restrict, so deleting a species in use fails instead of leaving a dangling
  -- reference (P-10). The operation still reads the species through the catalog, which hides foreign proposals.
  species_id uuid not null,
  -- Locations and the zone must belong to the same account: composite foreign keys (account_id, id). A null column
  -- is not checked ("no deviation").
  growth_location_id uuid,
  dormancy_location_id uuid,
  light_zone_id uuid,
  -- Month-day MM-DD, both or none (like the dormancy period of the species); may span the turn of the year.
  dormancy_from text check (dormancy_from ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  dormancy_until text check (dormancy_until ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  -- Whole days between waterings (US-MON-05); 1 to 365 is an assumption (starting value), the same as in core.
  watering_growth_days smallint check (watering_growth_days between 1 and 365),
  watering_dormancy_days smallint check (watering_dormancy_days between 1 and 365),
  own_hints text check (char_length(own_hints) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, species_id),
  check ((dormancy_from is null) = (dormancy_until is null)),
  constraint care_profile_species foreign key (species_id) references species (id) on delete restrict,
  constraint care_profile_growth_location foreign key (account_id, growth_location_id)
    references location (account_id, id),
  constraint care_profile_dormancy_location foreign key (account_id, dormancy_location_id)
    references location (account_id, id),
  constraint care_profile_light_zone foreign key (account_id, light_zone_id)
    references light_zone (account_id, id)
);
select tenant_protection('care_profile');
