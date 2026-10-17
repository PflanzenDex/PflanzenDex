-- module: equipment
-- US-EQU-05, DM-EQU-03: the supply of a consumable (`available`, `low`, `empty`) and the link of a plant agent to the
-- text of `Treatment.Agent`. Only a consumable (a record without a state) has a supply; only a plant agent has a link.
-- A consumable recorded before this migration has no value and reads as `available` (no backfill: nothing is guessed
-- beyond the starting value). Forward-only and additive: the previous app version ignores the columns.

alter table equipment add column supply text check (supply in ('available', 'low', 'empty'));
alter table equipment add column agent_link text check (char_length(agent_link) between 1 and 80);
alter table equipment add constraint equipment_supply_consumables_only
  check (supply is null or status is null);
alter table equipment add constraint equipment_agent_link_plant_agents_only
  check (agent_link is null or type = 'Plant agent');
