-- module: ai
-- US-KI-08, DM-KI-02, KI-R6, P-04, P-10: tasks from the app to the keeper's AI client. A task has a type, a reference
-- (a species name, a light zone or a measurement id) and a status `open -> in_progress -> done | declined`; `expired` is
-- derived on read and stored when a new task takes its place (open or in-progress and older than 14 days, assumption); nothing
-- is deleted. At most one open or
-- in-progress task per account, type and reference (tasks are merged, repeating is idempotent). The result of a task is a
-- draft (`draft_id`, US-KI-09). Forward-only: the previous app version does not know the table.

create unique index ai_draft_account_id on ai_draft (account_id, id);

create table ai_task (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references account(id) on delete cascade,
  type text not null check (type in ('species_profile', 'wish_candidates', 'photo_assessment')),
  reference text not null check (char_length(reference) between 1 and 200),
  label text not null check (char_length(label) between 1 and 200),
  status text not null default 'open' check (status in ('open', 'in_progress', 'done', 'declined', 'expired')),
  connection_id uuid,
  draft_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_task_connection foreign key (account_id, connection_id)
    references ai_connection (account_id, id) on delete cascade,
  constraint ai_task_draft foreign key (account_id, draft_id)
    references ai_draft (account_id, id) on delete cascade
);
create unique index ai_task_active on ai_task (account_id, type, md5(reference))
  where status in ('open', 'in_progress');
create index ai_task_list on ai_task (account_id, created_at desc);
create index ai_task_connection on ai_task (account_id, connection_id);
create index ai_task_draft on ai_task (account_id, draft_id);
select tenant_protection('ai_task');
