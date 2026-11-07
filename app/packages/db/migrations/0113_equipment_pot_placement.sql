-- module: equipment
-- US-BES-19, DM-EQU-06, P-04, P-10: the pot a plant sits in, as a placement of the plant into an own pot. A placement
-- starts on the local day of the repot (`placed_on`, NFR-08) and ends on the day the plant left it (`left_on`); the
-- placements stay as history (P-10). A pot has at most one open placement and a plant at most one; a pot is free when it
-- is active and no plant that is not archived holds it. An archived plant keeps its open placement (no write on archiving);
-- the next placement into that pot closes the stale one first, in the same transaction (`placePotOn`, db/src/equipment).
-- The plant belongs to the collection module, which equipment may depend on (AB-10): the composite foreign key ties the
-- plant to the own account. Expand only: the previous app version does not know the table.

create table pot_placement (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references account(id) on delete cascade,
  pot_id uuid not null,
  specimen_id uuid not null,
  placed_on date not null,
  left_on date,
  created_at timestamptz not null default now(),
  check (left_on is null or left_on >= placed_on),
  constraint pot_placement_pot foreign key (account_id, pot_id)
    references equipment (account_id, id) on delete cascade,
  constraint pot_placement_specimen foreign key (account_id, specimen_id)
    references specimen (account_id, id) on delete cascade
);
select tenant_protection('pot_placement');
-- One open placement per pot and per plant (DM-EQU-06).
create unique index pot_placement_open_pot on pot_placement (account_id, pot_id) where left_on is null;
create unique index pot_placement_open_specimen on pot_placement (account_id, specimen_id) where left_on is null;
-- The foreign keys are covered by these (the index gate, NFR-12).
create index pot_placement_pot on pot_placement (account_id, pot_id, placed_on);
create index pot_placement_specimen on pot_placement (account_id, specimen_id, placed_on);
