-- module: equipment
-- US-EQU-03, DM-EQU-02, FR-LIC-06, P-04, P-08: the manufacturer's statement about a lamp (power, light intensity), the
-- measurement log per lamp and the keeper's deviation limit. A missing value is null (unknown), never a guess. The
-- log is append-only: the application has no update or delete (P-10). Measurements point at a lamp of the same
-- account (composite foreign key). Forward-only: the previous app version does not know the columns and tables.

alter table equipment add column power_w integer check (power_w between 1 and 10000);
alter table equipment add column lux_statement integer check (lux_statement between 1 and 200000);
alter table equipment add constraint equipment_lamp_data_only
  check (type = 'Lamp' or (power_w is null and lux_statement is null));
create unique index equipment_account_id on equipment (account_id, id);

create table lamp_measurement (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references account(id) on delete cascade,
  equipment_id uuid not null,
  -- A local calendar date (NFR-08), no time of day.
  measured_on date not null,
  lux integer not null check (lux between 1 and 200000),
  distance_cm integer check (distance_cm between 1 and 1000),
  method text check (char_length(method) between 1 and 60),
  created_at timestamptz not null default now(),
  constraint lamp_measurement_equipment foreign key (account_id, equipment_id)
    references equipment (account_id, id)
);
create index lamp_measurement_equipment_index on lamp_measurement (account_id, equipment_id, measured_on);
select tenant_protection('lamp_measurement');

-- The share (percent) by which the last measurement may deviate from the zone ceiling before "Check zone" appears.
-- null (or no row) means the keeper has not set it and no check runs: no invented threshold (P-08).
create table equipment_setting (
  account_id uuid primary key references account(id) on delete cascade,
  deviation_percent smallint check (deviation_percent between 1 and 100)
);
select tenant_protection('equipment_setting');
