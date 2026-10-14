-- module: equipment
-- US-EQU-08, DM-WUN-01: a wish of type equipment (`wish.type = 'equipment'`, allowed since 0019) carries the equipment
-- type, an optional product id and an optional planned price. Plant wishes keep all three empty and every plant query
-- still filters on `type = 'plant'`, so the buffer and the zone hints of the plant wishes stay as they are. Forward-only
-- and additive (expand): the previous app version ignores the columns. No existing row has type 'equipment', so the
-- constraints hold for the data already there.

alter table wish add column equipment_type text check (equipment_type in
  ('Lamp', 'Timer', 'Sensor', 'Ventilation', 'Pump', 'Pot', 'Substrate', 'Fertilizer', 'Plant agent', 'Other'));
alter table wish add column product_id text check (char_length(product_id) between 1 and 60
  and product_id !~* '://' and product_id !~* '^www\.');
alter table wish add column price_eur numeric(10, 2) check (price_eur between 0 and 100000);
-- An equipment wish has a type and no target zone; a plant wish has neither type, product id nor price.
alter table wish add constraint wish_equipment_fields check (
  case when type = 'equipment'
    then equipment_type is not null and target_zone_id is null
    else equipment_type is null and product_id is null and price_eur is null
  end);
