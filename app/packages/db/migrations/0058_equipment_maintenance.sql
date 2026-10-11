-- module: equipment
-- US-EQU-04, DM-EQU-01, DM-EQU-02, P-08: operation and maintenance of a device. Since when it runs, how often the keeper
-- wants it checked, the date of the last check the keeper confirmed and what the manufacturer states about the
-- lifetime (always with its source). A missing value is null (unknown), never a guess. Only a device (a record with a
-- state) has these; a consumable does not. Forward-only and additive: the previous app version ignores the columns.

alter table equipment add column in_operation_since date;
alter table equipment add column check_interval_days integer check (check_interval_days between 1 and 3650);
alter table equipment add column last_checked_on date;
alter table equipment add column lifetime_value text check (char_length(lifetime_value) between 1 and 80);
alter table equipment add column lifetime_source text check (char_length(lifetime_source) between 1 and 80);
alter table equipment add constraint equipment_lifetime_with_source
  check ((lifetime_value is null) = (lifetime_source is null));
alter table equipment add constraint equipment_maintenance_devices_only
  check (status is not null or (in_operation_since is null and check_interval_days is null
    and last_checked_on is null and lifetime_value is null));
