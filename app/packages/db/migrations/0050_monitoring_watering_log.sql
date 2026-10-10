-- module: monitoring
-- US-MON-05, DM-MON-01, P-04: the watering log per specimen. One row is one day on which the specimen was watered
-- (a local calendar date of the keeper, NFR-08) and where the entry came from (`manual` by the keeper; `sensor` is
-- reserved for the later soil moisture sensors, US-MON-06). The watering interval per species and phase is not a table
-- of its own: it is the keeper's own entry in the care profile (`care_profile.watering_*_days`, US-BES-09), so nothing
-- is invented (P-08). Whether a specimen is due is derived on every request and has no column here (P-01).
-- Forward-only: the previous app version does not know the table.

create table watering_log (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references account(id) on delete cascade,
  specimen_id uuid not null,
  watered_on date not null,
  source text not null default 'manual' check (source in ('manual', 'sensor')),
  created_at timestamptz not null default now(),
  -- One entry per specimen, day and source: a double tap or a repeat writes once (US-QS-03).
  constraint watering_log_day unique (account_id, specimen_id, watered_on, source),
  -- The specimen must belong to the same account.
  constraint watering_log_specimen foreign key (account_id, specimen_id)
    references specimen (account_id, id) on delete cascade
);
select tenant_protection('watering_log');
