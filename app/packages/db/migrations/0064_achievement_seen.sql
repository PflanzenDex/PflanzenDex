-- module: achievements
-- US-ACH-03, DM-ACH-02, P-04, P-05: the "seen" state of the achievements per account. It holds only what cannot be
-- derived: the achievements the keeper has seen. Earned state and `earned on` stay derived and have no column (FR-ACH-02);
-- "new" is earned minus seen. One row per account (assumption, decided by the PO: an array like `pokedex_state`, and the
-- row doubles as the marker that the first evaluation happened, so existing achievements are created silently as seen);
-- `updated_at` is the "seen at" of the last write. `known_definitions` holds the definitions the account knew at its
-- last write, so a definition added later whose criterion is already met is created silently as seen (FR-ACH-09).
-- Forward-only (expand): the previous app version does not know the table and keeps working. The row rule is the
-- generic one of every tenant table (`tenant_protection`).

create table achievement_seen (
  account_id uuid primary key references account(id) on delete cascade,
  seen_achievements text[] not null default '{}',
  known_definitions text[] not null default '{}',
  updated_at timestamptz not null default now()
);
select tenant_protection('achievement_seen');
