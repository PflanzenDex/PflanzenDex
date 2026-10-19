-- Hands every object of the app database in schema public to the schema owner role (#907). Idempotent: a second run
-- finds nothing to move. Run it as a superuser connected to the APP database, after
-- `select set_config('pflanzendex.new_owner', '<role>', false)` in the same session (init-db-roles.sh does that).
-- Needed once per database that was created and migrated by the cluster superuser (the default of the postgres image):
-- a superuser as table owner makes every `security definer` function ignore row security (see
-- docs/guides/reference/security-definer-audit.md). Policies bound to the old owner follow in migration 0094.
-- Objects that belong to an extension are left alone.
do $$
declare
  new_owner constant text := current_setting('pflanzendex.new_owner');
  new_oid constant oid := (select oid from pg_roles where rolname = new_owner);
  r record;
begin
  if new_oid is null then
    raise exception 'owner role % does not exist', new_owner;
  end if;
  if (select rolsuper or rolbypassrls from pg_roles where oid = new_oid) then
    raise exception 'owner role % must not be a superuser and must not have BYPASSRLS', new_owner;
  end if;
  -- Since PostgreSQL 15 the schema belongs to pg_database_owner (the database owner); older clusters name a role.
  if exists (select from pg_namespace
              where nspname = 'public'
                and nspowner not in (new_oid, coalesce((select oid from pg_roles where rolname = 'pg_database_owner'), 0))) then
    execute format('alter schema public owner to %I', new_owner);
  end if;
  -- Tables, views, sequences: one pass, tables first so that owned sequences move with them.
  for r in
    select c.oid::regclass::text as name,
           case c.relkind when 'v' then 'view' when 'm' then 'materialized view' when 'S' then 'sequence' else 'table' end as kind
      from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'S')
       and c.relowner <> new_oid
       and not exists (select from pg_depend d where d.objid = c.oid and d.deptype = 'e')
     order by (c.relkind = 'S'), c.oid
  loop
    execute format('alter %s %s owner to %I', r.kind, r.name, new_owner);
  end loop;
  for r in
    select p.oid::regprocedure::text as name
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p') and p.proowner <> new_oid
       and not exists (select from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter routine %s owner to %I', r.name, new_owner);
  end loop;
  for r in
    select t.oid::regtype::text as name
      from pg_type t
     where t.typnamespace = 'public'::regnamespace and t.typtype in ('e', 'd') and t.typowner <> new_oid
       and not exists (select from pg_depend d where d.objid = t.oid and d.deptype = 'e')
  loop
    execute format('alter type %s owner to %I', r.name, new_owner);
  end loop;
end
$$;
