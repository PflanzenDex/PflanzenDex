-- module: monitoring
-- US-MON-09, DM-MON-01, P-04: the fertilizing log per specimen. One row is one day on which the keeper fertilized the
-- specimen (a local calendar date of the keeper, NFR-08). It is a log of its own, like the watering log (US-MON-05): no
-- planned date, no interval, no amount and no source column, because no sensor measures fertilizing. Whether and when a
-- specimen was fertilized is read from this table on every request and has no column of its own (P-01).
-- Forward-only: the previous app version does not know the table.

create table fertilizing_log (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references account(id) on delete cascade,
  specimen_id uuid not null,
  fertilized_on date not null,
  created_at timestamptz not null default now(),
  -- One entry per specimen and day: a double tap or a repeat writes once (US-QS-03).
  constraint fertilizing_log_day unique (account_id, specimen_id, fertilized_on),
  -- The specimen must belong to the same account.
  constraint fertilizing_log_specimen foreign key (account_id, specimen_id)
    references specimen (account_id, id) on delete cascade
);
select tenant_protection('fertilizing_log');
