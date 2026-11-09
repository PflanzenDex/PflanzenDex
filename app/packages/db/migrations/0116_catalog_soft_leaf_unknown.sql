-- module: catalog
-- US-LIC-01, DM-BES-01 (owner decision 2026-11-09): whether a C3 plant has a soft leaf may be unknown (P-08). Until now a
-- missing answer was stored as false ("not marked"). The rows that hold false become unknown (null); only an explicit
-- true stays. The zone derivation treats null like false (the soft-leaf rule does not apply), so no zone changes by it.
-- Expand only: the column loses its NOT NULL and its default. The previous app version writes false and reads null
-- without failing (its zone derivation tests the flag for truth only).

alter table species alter column soft_leaf drop default;
alter table species alter column soft_leaf drop not null;

update species set soft_leaf = null where soft_leaf = false;
