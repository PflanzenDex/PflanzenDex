-- module: wishlist
-- US-WUN-04, P-05: the stored local copy of a wish image. `image_object` is the object name in the object store
-- (`<account id>/<name>`, see `objectKey` in `core`); null means "no copy yet". Only the processed JPEG is stored. The
-- address in `image_url` stays the origin; a viewer never loads it. Forward-only and additive (nullable), so the
-- previous app version keeps working.

alter table wish
  add column image_object text check (image_object ~ '^[a-z0-9][a-z0-9-]{0,63}\.jpg$');
