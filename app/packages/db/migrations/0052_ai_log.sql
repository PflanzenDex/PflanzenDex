-- module: ai
-- US-KI-02, US-KI-10, DM-KI-04, KI-R6, P-04, P-10: the log of what an AI connection did.
-- One row per operation called through a connection: which connection, which operation, when, and a short effect
-- (no content beyond what is necessary). Under the row rule, so a log never leaves its account. The row keeps
-- the connection it belongs to through a tenant-safe foreign key (account_id, connection_id).
-- Forward-only: the previous app version does not know the table.

alter table ai_connection add constraint ai_connection_account_id unique (account_id, id);

create table ai_log (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references account(id) on delete cascade,
  connection_id uuid not null,
  operation text not null check (char_length(operation) between 1 and 100),
  effect text not null check (char_length(effect) <= 500),
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  constraint ai_log_connection foreign key (account_id, connection_id)
    references ai_connection (account_id, id) on delete cascade
);
create index ai_log_list on ai_log (account_id, created_at desc);
select tenant_protection('ai_log');
