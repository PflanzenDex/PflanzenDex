-- module: wishlist
-- Wishes (US-WUN-01, DM-WUN-01, P-04, P-05). The rank in the candidate list, the stock of the target zone and the texts
-- are derived on every request and have no columns here (P-01). Forward-only: the previous app version does not know the
-- table and keeps working. The species link, the specimen link (US-WUN-05) and the discover source (DM-ENT-02) are not
-- needed yet and follow with their stories.

create table wish (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references account(id) on delete cascade,
  -- Latin or working name; unique per account, case-insensitive (FR-WUN-06). 1 to 120 characters: an assumption
  -- (starting value), the same as in core.
  name text not null check (char_length(name) between 1 and 120),
  german text check (char_length(german) between 1 and 120),
  -- Must be a zone of the same account (composite foreign key, no cascade). null means "unknown" (P-08). A zone in use cannot be
  -- deleted: nothing disappears silently (P-10).
  target_zone_id uuid,
  -- The same number 1 to 3 everywhere (FR-WUN-04); null means "unknown" (P-08).
  difficulty smallint check (difficulty between 1 and 3),
  reasoning text check (char_length(reasoning) between 1 and 500),
  -- A picture always comes with its source, and only over https without credentials (user:password@) in the address.
  -- The address is shown only as a link, never loaded by the app (P-05) until it is saved locally (US-WUN-04).
  image_url text check (char_length(image_url) between 1 and 500 and image_url ~* '^https://' and image_url !~* '^https://[^/?#]*@'),
  image_source text check (char_length(image_source) between 1 and 300),
  license text check (char_length(license) between 1 and 100),
  type text not null default 'plant' check (type in ('plant', 'equipment')),
  status text not null default 'wishlist' check (status in ('wishlist', 'bought', 'discarded')),
  created_at timestamptz not null default now(),
  check ((image_url is null) = (image_source is null)),
  constraint wish_target_zone foreign key (account_id, target_zone_id)
    references light_zone (account_id, id)
);
create unique index wish_name on wish (account_id, lower(name));
-- The open candidates of an account, oldest first (US-WUN-01).
create index wish_open on wish (account_id, created_at) where status = 'wishlist';
select tenant_protection('wish');
