-- module: equipment
-- Equipment (US-EQU-01, DM-EQU-01, P-04, P-05). One record per device or consumable type. Everything but type and name
-- is optional; null means "unknown" (P-08). The product id says what the product is and is never a URL (FR-EQU-03).
-- The status is null for consumables. Lamp, consumable and maintenance fields follow with their stories (US-EQU-02 to
-- US-EQU-05). Forward-only: the previous app version does not know the table and keeps working.

create table equipment (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references account(id) on delete cascade,
  type text not null check (type in ('Lamp', 'Timer', 'Sensor', 'Ventilation', 'Pump', 'Pot', 'Substrate', 'Fertilizer', 'Plant agent', 'Other')),
  -- 1 to 80 characters: an assumption (starting value), the same as in core. Unique per account, case-insensitive.
  name text not null check (char_length(name) between 1 and 80),
  status text check (status in ('active', 'defective', 'retired')),
  manufacturer text check (char_length(manufacturer) between 1 and 80),
  model text check (char_length(model) between 1 and 80),
  product_id text check (char_length(product_id) between 1 and 60 and product_id !~* '://' and product_id !~* '^www\.'),
  price_eur numeric(10, 2) check (price_eur between 0 and 100000),
  -- A local calendar date (NFR-08), no time of day.
  bought_at date,
  note text check (char_length(note) between 1 and 500),
  created_at timestamptz not null default now(),
  check ((status is null) = (type in ('Substrate', 'Fertilizer', 'Plant agent')))
);
create unique index equipment_name on equipment (account_id, lower(name));
select tenant_protection('equipment');
