-- module: wishlist
-- US-ENT-04 undo: the last Yes or No a keeper wrote on a Discover card. The wish that decision created carries
-- `yes` or `no`; at most one wish per account carries it, so the undo can name exactly one decision. A new Yes or No moves
-- the mark (the application clears the old one in the same transaction); a row that never had a Discover decision stays
-- null. Forward-only and compatible with the previous app version: the column is nullable and the previous version
-- inserts wishes without it.

alter table wish add column last_decision text check (last_decision in ('yes', 'no'));
create unique index wish_last_decision_once on wish (account_id) where last_decision is not null;
