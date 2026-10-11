-- module: account
-- US-WUN-02: the buffer of open wishlist candidates per light zone 2 to 4 below which the wishlist warns, as an account
-- setting next to the others of US-ACC-02. Whole number 0 to 10, 2 until changed (assumption, decided by the PO); the same
-- limits as `REPLENISH_BUFFER_LIMITS` in core. Additive with a default: the previous app version ignores it and keeps working.

alter table account_data add column replenish_buffer smallint not null default 2
  check (replenish_buffer between 0 and 10);
