-- module: care
-- US-WAC-07, DM-WAC-02, P-04, P-05, P-10: the leaves of a plant, logged at the detail the keeper chooses (a tap, or with a
-- size, a note). One row is one leaf. `date` is the local calendar date of the keeper (NFR-08), not a point in time; the
-- comparison and the count are derived on every read and have no columns here (P-01). Sizes are whole millimetres from 1
-- to 5000 and the note has at most 500 characters: starting values (assumption), the same as in `core`. The photo of a
-- leaf is a follow-up of issue 1325 and has no column yet. Forward-only (expand): the previous app version does not know
-- the table and keeps working. The row rule is the generic one of every tenant table (`tenant_protection`).

create table leaf (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references account(id) on delete cascade,
  specimen_id uuid not null,
  date date not null,
  length_mm integer check (length_mm between 1 and 5000),
  width_mm integer check (width_mm between 1 and 5000),
  note text check (char_length(note) between 1 and 500),
  created_at timestamptz not null default now(),
  -- The plant must belong to the same account.
  constraint leaf_specimen foreign key (account_id, specimen_id)
    references specimen (account_id, id) on delete cascade
);
-- The leaves of one plant, newest first (count, list and comparison, US-WAC-07).
create index leaf_specimen_date on leaf (account_id, specimen_id, date desc, created_at desc);
select tenant_protection('leaf');
