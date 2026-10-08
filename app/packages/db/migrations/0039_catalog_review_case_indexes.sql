-- module: catalog
-- Indexes for foreign keys / tenant columns the index gate found uncovered (NFR-12, QG-D5). Without an index on the
-- child side, every delete or key update in the parent table scans this table; (account_id, x) is also the access path
-- "rows of one account pointing at x". An index starting with account_id also covers the tenant column and the account
-- foreign key. Plain `create index` (small tables, one transaction). Forward-only and additive.

create index review_case_account on review_case (account_id);
create index review_case_merged_into on review_case (merged_into);
create index review_case_reviewed_by on review_case (reviewed_by);
-- Not covered on purpose: species (object_kind, id) -> review_case. species.id is the primary key and already serves every
-- lookup by (object_kind, id); a second index would duplicate the key. That entry stays in the gate baseline.
