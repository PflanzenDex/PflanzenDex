-- module: account
-- US-QS-33: the motion choice of an account. `system` (follow the device's `prefers-reduced-motion`, starting value) or
-- `reduced` ("Bewegung aus": no route transition, list entry, sliding layer or flying card on any device of the
-- keeper). One column next to the other settings of `account_data`, written through `account.update_profile`; the row
-- rule of the table applies. Additive with a default: the previous app version ignores the column and keeps working,
-- and its saves leave it as it is. `MOTION_SETTINGS` in core lists the same values.

alter table account_data add column motion text not null default 'system'
  check (motion in ('system', 'reduced'));
