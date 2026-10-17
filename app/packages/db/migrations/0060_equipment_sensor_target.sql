-- module: equipment
-- US-EQU-06: a sensor (a record of type Sensor) may be assigned to one specimen or to one location of the same account.
-- Both are optional and never set together. The location points at the own account through a composite foreign key and
-- is cleared if it is deleted (P-04). The specimen belongs to another module (AB-10), so it has no foreign key: the
-- operation checks through the port of `collection` that it is an active specimen of the account, and the view treats
-- an archived or missing specimen as not assigned. Raw sensor values are not stored (FR-MON-07).
-- Forward-only and additive: the previous app version ignores the columns.

alter table equipment add column assigned_specimen_id uuid;
alter table equipment add column assigned_location_id uuid;
alter table equipment add constraint equipment_sensor_target_one_place
  check (assigned_specimen_id is null or assigned_location_id is null);
alter table equipment add constraint equipment_sensor_target_sensors_only
  check (type = 'Sensor' or (assigned_specimen_id is null and assigned_location_id is null));
alter table equipment add constraint equipment_assigned_location
  foreign key (account_id, assigned_location_id) references location (account_id, id)
  on delete set null (assigned_location_id);
create index equipment_assigned_location_index on equipment (account_id, assigned_location_id);
