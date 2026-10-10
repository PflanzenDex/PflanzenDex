-- module: wishlist
-- Where a wish came from and when the keeper decided (DM-ENT-02, US-ENT-04). `source` says `manual` for every wish that
-- exists today and for every wish written without a source, `discover` for a decision on a Discover card; `decided_at`
-- is the local calendar date of that decision (NFR-08) and stays null for wishes that were not decided on a card.
-- Forward-only and compatible with the previous app version: the new columns have a default or are nullable, so the
-- previous version keeps inserting wishes without knowing them.

alter table wish add column source text not null default 'manual' check (source in ('manual', 'discover'));
alter table wish add column decided_at date;
