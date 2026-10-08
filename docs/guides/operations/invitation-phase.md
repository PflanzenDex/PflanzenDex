# Runbook: start the invitation phase on a public deployment

Issue #301. Basis: US-ACC-05 (`docs/specs/product/01-accounts-and-onboarding.md`), owner decisions of 2026-10-05 (#298): close self-registration in the sign-in service (Keycloak realm) when the invitation phase starts, and run public deployments with "registration only with invitation code" switched on. Host setup, deploy and backup: `staging-deploy-and-backup.md`.

## What stays as it is

- **Local development and tests:** the realm export `app/dev/keycloak/pflanzendex-realm.json` keeps `"registrationAllowed": true`, and the app default of the registration mode stays OFF (`access_setting.invitation_only` defaults to `false`, migration `0018_account_invitation.sql`). `make auth-up`, `make test` and `make e2e` behave as before.
- **The switches are per installation, not per build.** Both live in running systems (the Keycloak realm and the database), so this runbook sets them once on the public host. Nothing in the repo turns them on.

## Two layers, both needed

| Layer                      | Switch                                     | Effect when on                                                                                                                                                          |
| -------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in service (Keycloak) | realm `pflanzendex`, `registrationAllowed` | `false`: a stranger cannot create a sign-in identity; the registration page answers "Registrierung nicht erlaubt." (HTTP 400) and the login page shows no register link |
| App (database)             | `access_setting.invitation_only`           | `true`: a signed-in identity without an account gets one only with a valid invitation code (US-ACC-05)                                                                  |

The app layer alone already keeps strangers out of the data: without a code no account and no data exist. The realm layer also stops strangers from creating identities at all.

**Consequence of closing the realm (needs the owner's attention):** with `registrationAllowed=false` invited people cannot create their own sign-in identity either. The operator creates it for them in Keycloak (step 6) and then hands over the invitation code. This needs working email (SMTP) in the public realm, because Keycloak sends the "set your password" link by email.

## Why not in the realm export file

Keycloak imports a realm file only when the realm does not exist yet (`--import-realm`, strategy `IGNORE_EXISTING`), so a changed file never closes an existing realm. Environment placeholders do not work for this field either: checked on 2026-10-05 with Keycloak 26.8.0, `"registrationAllowed": "${VAR:true}"` imported as `true` even with `VAR=false`, and `"${VAR}"` was not reliable (one run imported `false`, a later run with the same file and `VAR=false` stopped the import with "Cannot deserialize value of type `java.lang.Boolean`"; without `VAR` it always stops). String fields such as `displayName` did resolve `${VAR:default}`. Therefore the switch is an admin command against the running realm (step 2). It is idempotent and works on a fresh and on an existing realm. A public realm export (own redirect addresses, hostname, SMTP) belongs to the public Keycloak deployment, which does not exist yet (see "Missing").

## Steps

Placeholders: `<kc-container>` is the Keycloak container on the host, `<admin>` a Keycloak admin of the `master` realm, `<operator-email>` the operator's email. All commands run on the host in the repo checkout. `compose` stands for `docker compose --env-file app/deploy/.env -f app/deploy/docker-compose.yml`.

### 1. Preconditions

- The stack runs and the database schema contains at least migration `0018_account_invitation.sql`. Check: `compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select exists (select from schema_migrations where name = '\''0018_account_invitation.sql'\'')"'` prints `t`.
- A fresh backup: `make backup`.

### 2. Close self-registration in the realm

```bash
docker exec -it <kc-container> /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 --realm master --user <admin>
docker exec <kc-container> /opt/keycloak/bin/kcadm.sh update realms/pflanzendex -s registrationAllowed=false
docker exec <kc-container> /opt/keycloak/bin/kcadm.sh get realms/pflanzendex --fields registrationAllowed
# expected: { "registrationAllowed" : false }
```

`config credentials` asks for the password interactively; it never goes into the shell history or the repo (QG-S1). In the admin console the same switch is: realm `pflanzendex` > Realm settings > Login > "User registration" off.

Check from outside (replace the host; the `code_challenge` is any valid S256 value):

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  'https://<auth-host>/realms/pflanzendex/protocol/openid-connect/registrations?client_id=pflanzendex-web&response_type=code&scope=openid&redirect_uri=<url-encoded web address>&code_challenge_method=S256&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
# expected: 400 (page text "Registrierung nicht erlaubt."); while open it is 200 with the registration form
```

### 3. Create the operator's sign-in identity

Self-registration is closed now, so an admin creates the identity:

```bash
docker exec <kc-container> /opt/keycloak/bin/kcadm.sh create users -r pflanzendex \
  -s username=<operator-email> -s email=<operator-email> -s enabled=true -i
# prints the user id, e.g. 33b451f4-30e1-4f18-ae57-7ff778efe483: this is the subject (`sub`) the app stores
docker exec <kc-container> /opt/keycloak/bin/kcadm.sh update users/<user-id>/execute-actions-email \
  -r pflanzendex -b '["UPDATE_PASSWORD","VERIFY_EMAIL"]'
```

If the identity already exists, read its id: `kcadm.sh get users -r pflanzendex -q email=<operator-email> --fields id,email`.

### 4. The operator signs in to the app once

The operator sets the password through the email link and opens the app. The first sign-in creates the account (`account.subject` = Keycloak user id) and its data row (`account_data`). Do this **before** step 5: the registration mode is still OFF, so the operator's own account is created without a code. Strangers cannot use this moment, because the realm is already closed (step 2).

### 5. Make the account the operator and switch the registration mode ON

One transaction; it stops with an error and changes nothing if the subject has no account yet. Running it twice changes nothing more.

```bash
compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v subject=<user-id> -f -' <<'SQL'
\set ON_ERROR_STOP on
begin;
select set_config('pflanzendex.operator_subject', :'subject', true);
do $$
declare
  v_account uuid;
begin
  select id into v_account from public.account
   where subject = current_setting('pflanzendex.operator_subject');
  if v_account is null then
    raise exception 'No account for subject %: sign in to the app once first',
      current_setting('pflanzendex.operator_subject');
  end if;
  insert into public.account_role (account, role) values (v_account, 'operator')
    on conflict (account, role) do nothing;
  update public.access_setting set invitation_only = true, updated_at = now();
end
$$;
commit;
select a.subject, d.email, r.role, r.granted_at
  from public.account_role r
  join public.account a on a.id = r.account
  left join public.account_data d on d.account_id = a.id
 order by r.granted_at;
select invitation_only, updated_at from public.access_setting;
SQL
```

Expected: one row `<user-id> | <operator-email> | operator | <time>` and `invitation_only = t`. Roles are assigned administratively like this, never through the app (`account_role` has no rights for the app role). The `db` service runs as `POSTGRES_USER`, the owner of the tables.

### 6. Check in the app, then invite

- The operator reloads the app: the tab "Betreiber" appears, the overview shows the mode "nur mit Einladungscode" and the account counts.
- For each invited person: create the sign-in identity as in step 3 (with their email), create a code in "Betreiber" > invitations (shown once, valid 7 days by default) and send the code to the person on a separate channel. After setting the password the person signs in and enters the code; only then the account exists.

## Reopening or switching off

- App mode: in "Betreiber" switch "nur mit Einladungscode" off (the operator can do this in the app, `PUT /operator/registration`), or `update public.access_setting set invitation_only = false, updated_at = now();` as above.
- Realm: `kcadm.sh update realms/pflanzendex -s registrationAllowed=true`.
- A further operator: steps 3 to 5 with their user id; the `update access_setting` line in step 5 is harmless when the mode is already on.

## Verified on 2026-10-05

Development machine (Docker), throwaway containers only (shared Keycloak 18081 and shared test databases untouched):

- Keycloak 26.8.0, realm imported from `app/dev/keycloak/pflanzendex-realm.json`: `registrationAllowed` was `true`, the registration endpoint answered 200 with the form; after `kcadm.sh update realms/pflanzendex -s registrationAllowed=false` it answered 400 "Registrierung nicht erlaubt." and the login page had no register link; switching back restored 200. `kcadm.sh create users` worked on the closed realm; `execute-actions-email` failed only because no mail server was running.
- The placeholder variants in the realm file failed as described under "Why not in the realm export file".
- PostgreSQL 16 with migrations `0001` to `0021`: the step 5 script stopped with "No account for subject …" and changed nothing before the account existed; after a first sign-in (account created through the app's sign-in path as `pflanzendex_app`), it granted `operator`, set `invitation_only = t`, and a second run changed nothing. As the app role, `is_operator()` and `invitation_required()` returned `t`, `operator_overview(30)` returned `1 | 1 | t`.

## Missing (needs infrastructure, a human or a decision)

- **No Keycloak in the deploy stack.** `app/deploy/docker-compose.yml` has no sign-in service, and the API there gets no `OIDC_ISSUER`, `OIDC_AUDIENCE` or `WEB_ORIGIN` (it falls back to the local development values in `app/packages/api/src/main.ts`). A production Keycloak (production mode, its own database, hostname, TLS behind the proxy, SMTP, a public realm export with the real redirect addresses) is needed before step 2 can run anywhere public. Related: #202 (redirect addresses), TE-03 (#40), E-03.
- **No migration step in the deploy** (#201): the staging database stays empty unless migrations are applied by hand; step 1 assumes they ran.
- **Public domain and SMTP:** still open (see `staging-deploy-and-backup.md`). Without SMTP neither the operator nor invited people get the password link of step 3.
- **Owner confirmation:** closing the realm means the operator creates every invited person's sign-in identity by hand (step 6). If that is not wanted, the alternative is to leave the realm open and rely on the app layer only (strangers get an identity but no account), as the spec already allows.
- **No automated test against a real Keycloak** (#204): the realm switch was checked by hand as recorded above.
