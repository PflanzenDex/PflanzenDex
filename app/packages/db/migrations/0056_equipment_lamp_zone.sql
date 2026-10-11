-- module: equipment
-- US-EQU-02, DM-EQU-02, P-04, P-10: a lamp belongs to one light zone of the same account. The composite foreign key
-- (account_id, light_zone_id) makes the zone of another account unknown to the database and refuses the deletion of a
-- zone that still has a lamp (nothing disappears silently). Only lamps have a zone. The column stays nullable: lamps
-- recorded before this migration have none and are shown as "without zone" until the keeper assigns one; the operation
-- `equipment.record` requires the zone for every new lamp. Forward-only: the previous app version ignores the column.

alter table equipment add column light_zone_id uuid;
alter table equipment add constraint equipment_light_zone
  foreign key (account_id, light_zone_id) references light_zone (account_id, id);
alter table equipment add constraint equipment_zone_lamp_only check (light_zone_id is null or type = 'Lamp');
create index equipment_light_zone on equipment (account_id, light_zone_id);
