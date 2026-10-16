-- module: account
-- US-LIC-03, FR-LIC-05, US-ACC-02, P-04: the position thresholds of the light overview as an account setting. `null` means
-- the standard values (kept in `core`, so there is one place for the defaults); otherwise a JSON list of four whole lux
-- values, strictly descending, from 1 to 200,000 (assumption, decided by the PO). Written through `account.update_profile`,
-- which validates the same rules; the check here only keeps the shape sound. The row rule of the table applies.
-- Expand only: a nullable column; the previous app version ignores it.

alter table account_data add column position_thresholds jsonb;

alter table account_data add constraint account_data_position_thresholds_shape check (
  position_thresholds is null
  or (
    jsonb_typeof(position_thresholds) = 'array'
    and jsonb_array_length(position_thresholds) = 4
  )
);
