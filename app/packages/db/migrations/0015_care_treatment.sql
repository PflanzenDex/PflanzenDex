-- module: care
-- Treatments (US-BEH-01, DM-BEH-01, P-04). Status ("overdue", "due today", "in N days"), sorting and the open count are
-- derived on every request and have no columns here (P-01). Forward-only: the previous app version does not know the
-- table and keeps working.

create table treatment (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references account(id) on delete cascade,
  specimen_id uuid not null,
  -- Free text, 1 to 200 characters: an assumption (starting value), the same as in core.
  reason text not null check (char_length(reason) between 1 and 200),
  -- Free text for now; a reference to equipment follows with US-EQU-05. null means "no agent given" (P-08).
  agent text check (char_length(agent) between 1 and 200),
  -- Local calendar date of the user, not a point in time (NFR-08).
  due_at date not null,
  done boolean not null default false,
  -- Local calendar date of ticking off (US-BEH-03); stored with `done`, never without it (FR-BEH-03).
  done_at date,
  -- Shared by the dates of one course of one specimen (DM-BEH-01); null for a single treatment.
  course_id uuid,
  created_at timestamptz not null default now(),
  check (done = (done_at is not null)),
  -- The specimen must belong to the same account.
  constraint treatment_specimen foreign key (account_id, specimen_id)
    references specimen (account_id, id) on delete cascade
);
-- The open treatments of a specimen, earliest first (cards, US-BEH-02).
create index treatment_open on treatment (account_id, specimen_id, due_at) where not done;
select tenant_protection('treatment');
