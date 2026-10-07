-- module: care
-- Photo of a measurement (US-WAC-06, FR-WAC-09, P-04). The column holds the object name of the processed image in the
-- object store (`<account id>/<name>`, see `objectKey` in `core`); null means "no photo". Only the cleaned version
-- exists, the original is never stored. The table already has tenant isolation (US-WAC-01), so the new column is
-- covered by the same row rule. Forward-only and additive: the previous app version selects named columns and ignores it.

alter table measurement
  add column photo text check (photo ~ '^[a-z0-9][a-z0-9-]{0,63}\.jpg$');
