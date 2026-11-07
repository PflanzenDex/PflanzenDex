-- module: collection
-- US-BES-19, DM-BES-09, P-04, P-10: the repot record and the repot observations of a specimen. `repot` keeps every repot
-- day of a specimen (a local calendar date of the keeper, NFR-08); the latest one is the last repot, earlier ones stay as
-- history. The backfill copies the repot day of every specimen that has one (`specimen.repotted_at`, US-BES-04). `repot_sign`
-- keeps the three observations ("Wurzeln aus dem Topf", "Erde trocknet zu schnell", "Pflanze kippt") with the day each
-- was ticked and, once a repot clears it, the day it was cleared. At most one open observation per sign and specimen; a
-- cleared one stays as history (P-10). Expand only: the previous app version does not know the tables and keeps working.
-- The pot a repot names is not here: it is a pot placement of equipment (DM-EQU-06), because equipment depends on
-- collection and never the other way round.

create table repot (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references account(id) on delete cascade,
  specimen_id uuid not null,
  repotted_on date not null,
  created_at timestamptz not null default now(),
  constraint repot_specimen foreign key (account_id, specimen_id)
    references specimen (account_id, id) on delete cascade
);
select tenant_protection('repot');
create index repot_specimen on repot (account_id, specimen_id, repotted_on);

insert into repot (account_id, specimen_id, repotted_on)
  select account_id, id, repotted_at from specimen where repotted_at is not null;

create table repot_sign (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references account(id) on delete cascade,
  specimen_id uuid not null,
  sign text not null check (sign in ('roots_out', 'dries_fast', 'tips_over')),
  ticked_on date not null,
  cleared_on date,
  created_at timestamptz not null default now(),
  check (cleared_on is null or cleared_on >= ticked_on),
  constraint repot_sign_specimen foreign key (account_id, specimen_id)
    references specimen (account_id, id) on delete cascade
);
select tenant_protection('repot_sign');
create unique index repot_sign_open on repot_sign (account_id, specimen_id, sign) where cleared_on is null;
create index repot_sign_specimen on repot_sign (account_id, specimen_id);
