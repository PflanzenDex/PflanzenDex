-- module: ai
-- US-KI-07, DM-KI-01, KI-R6, KI-R8, FR-KI-04, P-04, P-05, P-10: the connection of an AI client to one account.
-- One row per connection: the OAuth client (`client_id`, the `azp` of its token), its display name, the rights the keeper
-- allows (`read < drafts < write`, ascending; the access token can only narrow them), a higher right the client asked
-- for and the keeper has not confirmed yet (step-up: never more is allowed silently), the use and the revocation.
-- A revoked row stays as history (P-10) and keeps blocking the client; "allow again" adds a new row. At most one
-- active row per client and account (partial unique index). Under the row rule, so a connection never leaves its account.
-- Forward-only: the previous app version does not know the table.

create table ai_connection (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references account(id) on delete cascade,
  client_id text not null check (char_length(client_id) between 1 and 500),
  client_name text not null check (char_length(client_name) between 1 and 100),
  rights text not null default 'drafts' check (rights in ('read', 'drafts', 'write')),
  requested_rights text check (requested_rights in ('read', 'drafts', 'write')),
  created_at timestamptz not null default now(),
  last_use timestamptz,
  revoked_at timestamptz
);
create unique index ai_connection_active on ai_connection (account_id, client_id) where revoked_at is null;
create index ai_connection_list on ai_connection (account_id, created_at desc);
select tenant_protection('ai_connection');
