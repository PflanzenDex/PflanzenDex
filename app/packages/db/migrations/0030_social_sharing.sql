-- module: social
-- Sharing settings per specimen (US-SOZ-04, DM-SOZ-04, P-04, P-05, P-10, FR-SOZ-01).
-- A row means "this specimen is shared with my friends"; no row means private, so every specimen is private by
-- default and nothing has to be written for that. `share_photos` is the second switch (photos come with US-WAC-05; the
-- setting is stored now so the choice is already made when they do). The composite foreign key keeps a row from ever
-- pointing at a specimen of another account; deleting the specimen takes the setting along. The global switch
-- "Everything private" lives in the profile (US-ACC-02) and suspends all rows without deleting them: it is applied
-- when friends read, not here.
-- `friend_shares()` is the only way to read the sharing rows of another account (AB-5): it returns them only while
-- the caller has a confirmed friendship with the owner, so ending a friendship (US-SOZ-03) withdraws everything at
-- once and nothing has to be deleted. Forward-only: the previous app version does not know the table.

create table sharing (
  account_id uuid not null references account(id) on delete cascade,
  specimen_id uuid not null,
  share_photos boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (account_id, specimen_id),
  constraint sharing_specimen foreign key (account_id, specimen_id)
    references specimen (account_id, id) on delete cascade
);
select tenant_protection('sharing');

-- The specimens `p_owner` shares with the caller: nothing unless both rows of the friendship are confirmed. The owner's
-- rows are read as the owner, then the caller's account is restored (like `answer_friendship()`).
create function friend_shares(p_owner uuid)
returns table (specimen_id uuid, share_photos boolean)
language plpgsql security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  me uuid := current_account();
  mine text := nullif(current_setting('app.account_id', true), '');
begin
  if me is null then
    raise exception 'Reading shared specimens needs an account' using errcode = '42501';
  end if;
  if not exists (select from public.friendship
                  where account_id = me and other_id = p_owner and status = 'confirmed') then
    return;
  end if;
  perform set_config('app.account_id', p_owner::text, true);
  if exists (select from public.friendship
              where account_id = p_owner and other_id = me and status = 'confirmed') then
    return query select s.specimen_id, s.share_photos from public.sharing s order by s.created_at, s.specimen_id;
  end if;
  perform set_config('app.account_id', coalesce(mine, ''), true);
end
$$;

revoke all on function friend_shares(uuid) from public;
grant execute on function friend_shares(uuid) to pflanzendex_app;
