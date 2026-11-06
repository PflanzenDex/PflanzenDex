-- module: account
-- US-QS-11, WCAG 2.1.4: how the keyboard shortcuts of an account are taken. `plain` (the single keys h, s, p, w, /, ?
-- work, starting value), `modifier` (the same keys with Alt+Shift, so a single key never fires alone) or `disabled` (no
-- shortcut fires). One column next to the other settings of `account_data`, written through `account.update_profile`;
-- the row rule of the table applies. Additive with a default: the previous app version ignores the column and keeps
-- working, and its saves leave it as it is. `KEYBOARD_SHORTCUT_MODES` in core lists the same values.

alter table account_data add column keyboard_shortcuts text not null default 'plain'
  check (keyboard_shortcuts in ('plain', 'modifier', 'disabled'));
