-- module: catalog
-- US-LIC-01, DM-BES-01: marks a C3 plant with a soft leaf ("sun-loving"); the zone derivation never promotes it
-- automatically. Missing information means "not marked" (false); nothing is guessed (P-08).
-- Expand only: a column with a default; the previous app version ignores it.

alter table species add column soft_leaf boolean not null default false;
