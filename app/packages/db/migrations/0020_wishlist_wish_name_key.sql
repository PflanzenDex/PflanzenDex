-- module: wishlist
-- Wish names are unique per account after folding diacritics and Unicode composition, not only after lower case
-- (US-WUN-01, FR-WUN-06). The app computes the key (`wishNameKey` in core) and stores it in `name_key`; the unique index
-- on it is the hard rule. Forward-only and compatible with the previous app version: the column is nullable (the
-- previous version does not write it and is still guarded by `wish_name`; a null key is exempt from the new index), and
-- `wish_name` stays in place.

alter table wish add column name_key text;

-- The owner must see the rows to fill the column: the row rules are forced for the owner too (as in 0012).
alter table wish no force row level security;

-- Same steps as `wishNameKey`: decompose (NFD), drop combining marks U+0300..U+036F, lower case.
update wish set name_key = lower(regexp_replace(normalize(name, NFD), '[̀-ͯ]', '', 'g'));

-- Wishes that only now collide with an older wish of the same account: nothing is deleted or renamed (P-10). The newer
-- ones keep their name and get no key, so they are exempt from the new rule; each one is reported here, so the operator
-- can ask the owner to merge them. New wishes are checked against all keys.
do $$
declare
  r record;
begin
  for r in
    select id, account_id, name from (
      select id, account_id, name,
             row_number() over (partition by account_id, name_key order by created_at, id) as n
        from wish
    ) w
    where n > 1
  loop
    raise warning 'wish % (account %, name "%") collides with an older wish after folding diacritics; kept as is, without key',
      r.id, r.account_id, r.name;
    update wish set name_key = null where id = r.id;
  end loop;
end
$$;

alter table wish force row level security;

create unique index wish_name_key on wish (account_id, name_key);
