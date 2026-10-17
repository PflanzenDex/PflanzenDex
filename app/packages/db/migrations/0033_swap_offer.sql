-- module: swap
-- Offers to swap or give away a specimen (US-SOZ-08, DM-SOZ-02, ADR 0012, P-04, P-05).
-- A tenant table: `account_id` is the giver, so every account sees exactly its own offers under the normal row rule.
-- Friends read open offers only through a function of the next story (US-SOZ-09), never through this table. The health
-- details (open treatment, last treatment) and the dormancy hint are derived on every read and have no columns (P-01).
-- At most one open or reserved offer per specimen (partial unique index). The specimen is tied to the same account by the
-- composite foreign key. Forward-only: the previous app version does not know the table.

create table offer (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references account(id) on delete cascade,
  specimen_id uuid not null,
  type text not null check (type in ('cutting', 'plant', 'offshoot')),
  mode text not null check (mode in ('swap', 'give_away')),
  -- What the giver wishes in return (free text); 1 to 200 and 1 to 500 characters are assumptions (starting values), the same as in core.
  wish text check (char_length(wish) between 1 and 200),
  note text check (char_length(note) between 1 and 500),
  status text not null default 'open' check (status in ('open', 'reserved', 'handed_over', 'withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, id),
  constraint offer_specimen foreign key (account_id, specimen_id) references specimen (account_id, id)
);
create unique index offer_one_open on offer (account_id, specimen_id) where status in ('open', 'reserved');
create index offer_by_account on offer (account_id, created_at desc);
select tenant_protection('offer');
