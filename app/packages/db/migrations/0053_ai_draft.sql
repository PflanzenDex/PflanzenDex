-- module: ai
-- US-KI-09, DM-KI-03, KI-R3, KI-R5, KI-R6, P-04, P-10: drafts that an AI connection delivers for the keeper to review.
-- A draft holds the content already validated against the schema of the target operation (the same schema as the form),
-- its source (mandatory) and the connection it came from. It is never adopted automatically: the keeper adopts or
-- discards it. `content_key` (canonical content) makes delivering the same draft twice one open draft. An open draft
-- older than 14 days counts as expired (assumption) and stays viewable (derived on read, nothing is deleted).
-- Forward-only: the previous app version does not know the table.

create table ai_draft (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references account(id) on delete cascade,
  connection_id uuid not null,
  type text not null check (char_length(type) between 1 and 50),
  reference text check (char_length(reference) <= 200),
  content jsonb not null,
  content_key text not null check (char_length(content_key) <= 20000),
  source text not null check (char_length(source) between 1 and 1000),
  status text not null default 'open' check (status in ('open', 'adopted', 'discarded')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint ai_draft_connection foreign key (account_id, connection_id)
    references ai_connection (account_id, id) on delete cascade
);
create unique index ai_draft_open on ai_draft (account_id, type, md5(content_key)) where status = 'open';
create index ai_draft_list on ai_draft (account_id, created_at desc);
create index ai_draft_connection on ai_draft (account_id, connection_id);
select tenant_protection('ai_draft');
