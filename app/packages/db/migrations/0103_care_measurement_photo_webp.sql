-- module: care
-- US-WAC-06, NFR-12, issue 1289: the stored photo of a measurement is WebP, so its object name ends in `.webp`. The check
-- `measurement_photo_check` of migration 0031 allowed only `.jpg`; this replaces it and accepts only `.webp`.
-- Clean switch, decided by the owner on 2026-11-05: there is no production data, so there is no reader for the old
-- format and no conversion job. If a row still names a `.jpg` object, adding the check fails and the migration rolls
-- back, so old photos are never dropped or rewritten silently; such a database is re-seeded (test host, dev data).
-- Not expand/contract: after this migration the previous app version (which writes `.jpg` names) cannot store photos.
-- Take a fresh backup (`make backup`) before this runs anywhere that holds data.

alter table measurement drop constraint measurement_photo_check;
alter table measurement
  add constraint measurement_photo_check check (photo ~ '^[a-z0-9][a-z0-9-]{0,63}\.webp$');
