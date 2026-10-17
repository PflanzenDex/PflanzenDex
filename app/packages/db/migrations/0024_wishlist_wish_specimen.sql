-- module: wishlist
-- The link "bought -> specimen" (US-WUN-05, DM-WUN-01 `Specimen?`). A bought wish points at the specimen it became. Expand
-- only: one nullable column, the previous app version does not know it and keeps working. The row rules of `wish` stay as
-- they are (no policy or grant changes). The specimen must belong to the same account (composite foreign key on
-- (account_id, id), like the target zone): a specimen of another account is unknown to the database even if someone
-- guesses its ID (P-04). Only a bought wish carries a link, and a specimen belongs to at most one wish. A specimen is
-- archived, never deleted, so the link never dangles (P-10).

alter table wish add column specimen_id uuid;
alter table wish add constraint wish_specimen
  foreign key (account_id, specimen_id) references specimen (account_id, id);
alter table wish add constraint wish_specimen_only_when_bought
  check (specimen_id is null or status = 'bought');
create unique index wish_specimen_once on wish (account_id, specimen_id) where specimen_id is not null;
