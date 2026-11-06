-- module: collection
-- US-BES-18, DM-BES-02, P-05: the private notes of a specimen. One nullable text column; `null` means no note. The
-- keeper's own text is at most 2000 characters (starting value, assumption, the same as in `core`). `char_length` counts
-- characters the way the core does (code points), and an empty text is refused: the core stores `null` instead. Expand
-- only: the previous app version does not read or write the column and keeps working. The row rule of `specimen` covers
-- the column. No friend view, feed, swap card or AI read selects it; the keeper's data export carries it (US-ACC-04).

alter table specimen
  add column notes text,
  add constraint specimen_notes_length check (notes is null or char_length(notes) between 1 and 2000);
