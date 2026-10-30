-- module: kernel
-- US-DEV-07, P-04, QG-D1 (#907): the policies that name the OWNER role follow the role that runs the migration. Several
-- migrations bound a policy to the owner at migration time (`to current_user`: owner_count, owner_decides, lock_for_merge,
-- ...); they let the checked `security definer` functions see what the application role must not see. Moving the schema
-- from the cluster superuser to a plain owner role in an existing database (docs/guides/operations/staging-deploy-and-backup.md,
-- "DB roles in production") leaves those policies on the old role, and the functions would stop seeing anything. This
-- migration re-targets every policy that is bound to a role other than the application role and does not include the
-- current user to the current user. With the owner unchanged nothing happens, so a second run and every fresh database
-- are unaffected. No schema change: the previous app version keeps working.

do $$
declare
  p record;
begin
  for p in
    select pol.polname as name, pol.polrelid::regclass::text as tbl
      from pg_policy pol
     where pol.polroles <> '{0}'::oid[]
       and not (pol.polroles @> array[(select oid from pg_roles where rolname = 'pflanzendex_app')])
       and not (pol.polroles @> array[(select oid from pg_roles where rolname = current_user)])
  loop
    execute format('alter policy %I on %s to current_user', p.name, p.tbl);
  end loop;
end
$$;
