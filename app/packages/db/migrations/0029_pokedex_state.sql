-- module: pokedex
-- The Pokédex state of an account (US-POK-12, DM-POK "pokedex_state", P-04, P-05). It holds only what cannot be derived:
-- the species the keeper has already seen. "Caught" and "newly caught" are derived on every request and have no
-- columns (P-01). One row per account. Forward-only (expand): the previous app version does not know the table and keeps
-- working. The row rule is the generic one of every tenant table (`tenant_protection`, as in 0019); nothing else is granted.

create table pokedex_state (
  account_id uuid primary key references account(id) on delete cascade,
  -- Species keys as the derivation names them (Latin name of the species). The operation `pokedex.mark_seen` only
  -- adds keys of caught species; the array never holds a key twice.
  seen_species text[] not null default '{}',
  updated_at timestamptz not null default now()
);
select tenant_protection('pokedex_state');
