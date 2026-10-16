-- module: achievements
-- US-ACH-08, DM-ACH-03, P-04, P-05: settings of the achievements per account. `calm_mode` hides every game element (banner,
-- overview entry, rhythm, records, anniversaries, year in review); false (the default) means everything is shown, so an
-- account without a row behaves as before (assumption, decided by the PO, revisable). Earned achievements are derived and
-- have no column (FR-ACH-02). One row per account. Forward-only (expand): the previous app version does not know the table
-- and keeps working. The row rule is the generic one of every tenant table (`tenant_protection`).

create table achievement_setting (
  account_id uuid primary key references account(id) on delete cascade,
  calm_mode boolean not null default false
);
select tenant_protection('achievement_setting');
