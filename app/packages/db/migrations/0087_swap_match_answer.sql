-- module: swap
-- US-TAU-02, DM-TAU-01, P-04, P-05, P-10: the private answers No and Later of a keeper to the offers of friends.
-- A tenant table: each account sees exactly its own answers under the normal row rule; the giver and everybody else
-- never see them (FR-TAU-02) and nothing here is evaluated across accounts. A Yes is not stored: it is the swap request
-- (DM-SOZ-03, NFR-04). Whether a card is open, requested, for later or declined is derived on every read.
-- `offer_id` points into the account of the giver, so it has no foreign key (AB-10). The species and giver name are
-- copied when the answer is given, so the entry stays readable when the offer ends (P-10, US-TAU-06).
-- `answered_on` is the local calendar date of the keeper (NFR-08); `reconsider_at` is reserved for US-TAU-06.
-- One answer per account and offer. Forward-only (expand): the previous app version does not know the table.

create table swap_match_answer (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references account(id) on delete cascade,
  offer_id uuid not null,
  answer text not null check (answer in ('no', 'later')),
  answered_on date not null,
  reconsider_at date,
  species_latin text,
  species_german text,
  giver_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, offer_id)
);
select tenant_protection('swap_match_answer');
