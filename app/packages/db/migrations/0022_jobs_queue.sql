-- module: jobs
-- Job queue (TE-06, US-QS-03): durable background jobs for reminders, the catalog build, photo processing and AI orders.
-- Forward-only: the previous app version does not know the table and keeps working. The table is installation-level
-- (no account id): a job is work of the installation, its payload carries only ids. The application role has no rights
-- on it; only the worker, which connects with the owner role, reads and writes it, and every handler that touches
-- user data does so through `withAccount` (P-04). Row security is on without any policy, so even a wrongly granted
-- right would show no row (like `invitation`).

create table job (
  id uuid primary key default gen_random_uuid(),
  -- `<module>.<job>`, lower case; 3 to 80 characters (assumption, the same as in core).
  type text not null check (char_length(type) between 3 and 80 and type ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  -- Open jobs with the same type and key are merged (US-QS-03).
  dedupe_key text check (char_length(dedupe_key) between 1 and 200),
  payload jsonb not null default '{}' check (jsonb_typeof(payload) = 'object' and char_length(payload::text) <= 8100),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'dead', 'expired')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  run_at timestamptz not null default now(),
  expires_at timestamptz,
  locked_by text,
  lease_until timestamptz,
  last_error text check (char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  check (attempts <= max_attempts),
  check ((status = 'running') = (locked_by is not null and lease_until is not null))
);
-- At most one open job per type and dedupe key: the database enforces the merge, not only the code.
create unique index job_open_dedupe on job (type, dedupe_key)
  where dedupe_key is not null and status in ('queued', 'running');
create index job_due on job (run_at) where status = 'queued';
create index job_lease on job (lease_until) where status = 'running';
create index job_finished on job (finished_at) where finished_at is not null;
revoke all on job from public;
alter table job enable row level security;
