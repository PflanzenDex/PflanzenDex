-- module: achievements
-- US-ACH-04, DM-ACH-03, P-04, P-05: explicit pauses of the care rhythm (holiday, illness). A pause is a closed range of
-- calendar days (local dates, NFR-08) of at most 28 days (4 weeks, assumption, decided by the PO); tasks due inside it
-- are neutral. Several pauses per account, so a later pause never rewrites an earlier one (the rhythm is derived and
-- would otherwise change its past). Forward-only (expand): the previous app version does not know the table and keeps
-- working. The row rule is the generic one of every tenant table (`tenant_protection`).

create table achievement_rhythm_pause (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references account(id) on delete cascade,
  from_on date not null,
  until_on date not null,
  constraint achievement_rhythm_pause_range check (until_on >= from_on and until_on - from_on <= 27)
);
create index achievement_rhythm_pause_account_idx on achievement_rhythm_pause (account_id, from_on);
select tenant_protection('achievement_rhythm_pause');
