-- module: account
-- US-ACC-05, issue 1616 (P-03, P-04, NFR-15): `invitation` and `access_setting` get FORCE row security, and the table
-- owner gets the rules its `security definer` functions need. Migration 0018 left both on ENABLE only, so the functions
-- (which run as the owner) bypassed row security. With FORCE and no rule they would see nothing: `invitation_required()`
-- would return NULL (read as open registration), the operator's switch in `set_invitation_only()` would change no row
-- (registration stays open although the operator switched it on), and `create_invitation()` would be refused.
-- The rules name the owner role at migration time (`to current_user`, like `owner_count` in 0023); the application role
-- keeps no rule and no grant on these tables, so it still reaches them only through the checked functions. The rules
-- cover exactly what the functions do: select, insert and update. Nothing deletes an invitation or the mode row, so
-- there is no delete rule: a delete by the owner matches no row. Expand only: no function changes, nothing removed; the
-- previous app version keeps working.

alter table invitation force row level security;
create policy owner_read on invitation for select to current_user using (true);
create policy owner_create on invitation for insert to current_user with check (true);
create policy owner_update on invitation for update to current_user using (true) with check (true);

alter table access_setting force row level security;
create policy owner_read on access_setting for select to current_user using (true);
create policy owner_update on access_setting for update to current_user using (true) with check (true);
