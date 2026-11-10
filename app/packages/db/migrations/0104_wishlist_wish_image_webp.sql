-- module: wishlist
-- US-WUN-04, NFR-12, issue 1289: the stored copy of a wish image is WebP, so its object name ends in `.webp`. The check
-- `wish_image_object_check` of migration 0042 allowed only `.jpg`; this replaces it and accepts only `.webp`.
-- Clean switch, decided by the owner on 2026-11-05: there is no production data, so there is no reader for the old
-- format and no conversion job. If a row still names a `.jpg` object, adding the check fails and the migration rolls
-- back, so old copies are never dropped or rewritten silently; such a database is re-seeded (test host, dev data).
-- Not expand/contract: after this migration the previous app version (which writes `.jpg` names) cannot store wish
-- images. Take a fresh backup (`make backup`) before this runs anywhere that holds data.

alter table wish drop constraint wish_image_object_check;
alter table wish
  add constraint wish_image_object_check check (image_object ~ '^[a-z0-9][a-z0-9-]{0,63}\.webp$');
