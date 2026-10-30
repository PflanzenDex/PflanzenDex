-- module: swap
-- US-SOZ-09, US-TAU-03, P-04, P-05 (#891): `request_swap()` and `friend_offers()` no longer depend on row security for
-- the account they read. Both are `security definer`; when the owner of the tables bypasses row security (a superuser,
-- as the cluster user of the Docker image and of `make dev` is), every row of every account was visible to them: the
-- own-offer test `exists (select from offer where id = ...)` then found the offer of a friend and refused every request
-- with `own_offer`, and `friend_offers()` listed the open offers of strangers for each friend. Every read now names its
-- account explicitly (`account_id = me / giver / f.other_id`), so the result is the same under a superuser and under a
-- plain owner. Same signatures and columns, behaviour with a plain owner unchanged: the previous app version keeps working.

create or replace function friend_offers()
returns table (
  owner_id uuid, owner_name text, offer_id uuid, specimen_id uuid, type text, mode text, wish text, note text,
  offered_at timestamptz, share_photos boolean
)
language plpgsql security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  me uuid := current_account();
  mine text := nullif(current_setting('app.account_id', true), '');
  f record;
begin
  if me is null then
    raise exception 'Reading offers of friends needs an account' using errcode = '42501';
  end if;
  for f in select fr.other_id, fr.other_name from public.friendship fr
            where fr.account_id = me and fr.status = 'confirmed' order by fr.other_id loop
    perform set_config('app.account_id', f.other_id::text, true);
    if exists (select from public.friendship where account_id = f.other_id and other_id = me and status = 'confirmed')
       and not exists (select from public.account_data where account_id = f.other_id and everything_private) then
      return query
        select f.other_id, f.other_name, o.id, o.specimen_id, o.type, o.mode, o.wish, o.note, o.created_at, sh.share_photos
          from public.offer o
          join public.sharing sh on sh.account_id = o.account_id and sh.specimen_id = o.specimen_id
         where o.account_id = f.other_id and o.status = 'open'
         order by o.created_at desc, o.id;
    end if;
  end loop;
  perform set_config('app.account_id', coalesce(mine, ''), true);
end
$$;

create or replace function request_swap(p_offer_id uuid, p_counter_specimen uuid, p_counter_text text)
returns table (outcome text, swap_id uuid)
language plpgsql security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  me uuid := current_account();
  mine text := nullif(current_setting('app.account_id', true), '');
  f record;
  o public.offer;
  giver uuid;
  giver_name text;
  my_name text;
  found_offer boolean := false;
  visible boolean := false;
  latin text;
  german text;
  counter_label text;
  new_id uuid := gen_random_uuid();
begin
  if me is null then
    raise exception 'Requesting an offer needs an account' using errcode = '42501';
  end if;
  if exists (select from public.offer where id = p_offer_id and account_id = me) then
    return query select 'own_offer'::text, null::uuid;
    return;
  end if;
  -- Find the offer among the friends' offers, as each friend in turn.
  for f in select fr.other_id, fr.other_name from public.friendship fr
            where fr.account_id = me and fr.status = 'confirmed' order by fr.other_id loop
    perform set_config('app.account_id', f.other_id::text, true);
    select * into o from public.offer where id = p_offer_id and account_id = f.other_id;
    if found then
      found_offer := true;
      giver := f.other_id;
      giver_name := f.other_name;
      visible := exists (select from public.friendship where account_id = giver and other_id = me and status = 'confirmed')
        and not exists (select from public.account_data where account_id = giver and everything_private)
        and exists (select from public.sharing where account_id = giver and specimen_id = o.specimen_id);
      select sp.latin_name, sp.german_name into latin, german from public.species sp
       where sp.id = (select e.species_id from public.specimen e where e.account_id = giver and e.id = o.specimen_id);
      select fr.other_name into my_name from public.friendship fr where fr.account_id = giver and fr.other_id = me;
      exit;
    end if;
  end loop;
  perform set_config('app.account_id', coalesce(mine, ''), true);
  if not found_offer or not visible then
    return query select 'offer_unknown'::text, null::uuid;
    return;
  end if;
  if o.status <> 'open' then
    return query select 'not_open'::text, null::uuid;
    return;
  end if;
  if exists (select from public.swap s where s.account_id = me and s.offer_id = o.id and s.role = 'recipient'
                and s.status in ('requested', 'accepted')) then
    return query select 'already_requested'::text, null::uuid;
    return;
  end if;
  if p_counter_specimen is not null then
    if o.mode <> 'swap' then
      return query select 'counter_not_allowed'::text, null::uuid;
      return;
    end if;
    select e.name into counter_label from public.specimen e where e.account_id = me and e.id = p_counter_specimen and e.status <> 'archived';
    if not found then
      return query select 'counter_unknown'::text, null::uuid;
      return;
    end if;
    if not exists (select from public.sharing where account_id = me and specimen_id = p_counter_specimen) then
      return query select 'counter_not_shared'::text, null::uuid;
      return;
    end if;
  elsif p_counter_text is not null and o.mode <> 'swap' then
    return query select 'counter_not_allowed'::text, null::uuid;
    return;
  end if;
  -- The giver's side, written as the giver.
  perform set_config('app.account_id', giver::text, true);
  insert into public.swap (account_id, swap_id, role, other_id, other_name, offer_id, species_latin, species_german,
                           type, mode, counter_name, counter_text)
  values (giver, new_id, 'giver', me, my_name, o.id, latin, german, o.type, o.mode, counter_label, p_counter_text);
  perform set_config('app.account_id', coalesce(mine, ''), true);
  -- The requester's side.
  insert into public.swap (account_id, swap_id, role, other_id, other_name, offer_id, species_latin, species_german,
                           type, mode, counter_specimen_id, counter_name, counter_text)
  values (me, new_id, 'recipient', giver, giver_name, o.id, latin, german, o.type, o.mode, p_counter_specimen,
          counter_label, p_counter_text);
  return query select 'requested'::text, new_id;
end
$$;
