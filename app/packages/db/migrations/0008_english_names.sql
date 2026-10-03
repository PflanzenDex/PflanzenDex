-- One-off rename of all database objects from German to English names (ADR 0004).
-- Tables, columns, constraints, indexes, policies, triggers and functions get English names; the stored enum values
-- (roles, review status, location kind, growth measure, field, specimen status) are converted in place. No data is lost.
-- Applied files 0001 to 0007 stay as they are (forward only); this file is the only place that knows both vocabularies.
-- The session variables change as well: `app.konto_id` becomes `app.account_id`, `app.subjekt` becomes `app.subject`.

-- 1. Remove everything that depends on the old names or values: policies, triggers, functions, value checks.
drop policy sichtbar on art;
drop policy vorschlagen on art;
drop policy sichtbar on art_name;
drop policy vorschlagen on art_name;
drop policy mandant on exemplar;
drop policy mandant on idempotenz;
drop policy anmeldung_anlegen on konto;
drop policy anmeldung_lesen on konto;
drop policy mandant on konto;
drop policy mandant on kontodaten;
drop policy mandant on lichtzone;
drop policy katalog_freigegeben on pruefvorgang;
drop policy mandant on pruefvorgang;
drop policy pruefer_entscheidet on pruefvorgang;
drop policy pruefer_liest on pruefvorgang;
drop policy mandant on standort;

drop trigger art_wache on art;
drop trigger pruefvorgang_wache on pruefvorgang;

drop function art_wache();
drop function pruefvorgang_wache();
drop function art_status(uuid);
drop function art_eigen(uuid);
drop function rollen_des_kontos();
drop function ist_pruefer();
drop function mandantenschutz(regclass, name);
drop function aktuelles_konto();

alter table konto_rolle drop constraint konto_rolle_rolle_check;
alter table pruefvorgang drop constraint pruefvorgang_check;
alter table pruefvorgang drop constraint pruefvorgang_status_check;
alter table standort drop constraint standort_art_check;
alter table art drop constraint art_erstellt_von_check;
alter table art drop constraint art_objekt_art_check;
alter table art drop constraint art_wachstumsmass_check;
alter table art drop constraint art_objekt_art_id_fkey;
alter table art_name drop constraint art_name_feld_check;
alter table exemplar drop constraint exemplar_status_check;

-- The owner must see the rows to convert them: with the policies gone, a forced row security would hide everything.
alter table pruefvorgang no force row level security;
alter table standort no force row level security;
alter table art no force row level security;
alter table art_name no force row level security;
alter table exemplar no force row level security;

-- 2. Convert the stored values.
update konto_rolle set rolle = case rolle when 'betreiber' then 'operator' when 'pruefer' then 'reviewer' end;
update pruefvorgang set
  status = case status
    when 'vorschlag' then 'proposal' when 'ki_ungeprueft' then 'ai_unreviewed' when 'kuratiert' then 'curated'
    when 'geprueft' then 'reviewed' when 'zurueckgewiesen' then 'rejected' end,
  objekt_art = case objekt_art when 'art' then 'species' else objekt_art end;
update art set
  objekt_art = 'species',
  erstellt_von = case erstellt_von when 'betreiber' then 'operator' when 'pruefer' then 'reviewer' when 'nutzer' then 'user' end,
  wachstumsmass = case wachstumsmass
    when 'hoehe' then 'height' when 'rosettendurchmesser' then 'rosette_diameter' when 'trieblaenge' then 'shoot_length' end;
update art_name set feld = case feld
  when 'lateinisch' then 'latin' when 'deutsch' then 'german' when 'englisch' then 'english' else feld end;
update standort set art = case art when 'innen' then 'indoor' when 'aussen' then 'outdoor' end;
update exemplar set status = case status when 'pflanze' then 'plant' when 'steckling' then 'cutting' when 'archiviert' then 'archived' end;

-- 3. Rename tables, columns, constraints and indexes.
-- tables
alter table art rename to species;
alter table art_name rename to species_name;
alter table exemplar rename to specimen;
alter table idempotenz rename to idempotency;
alter table konto rename to account;
alter table konto_rolle rename to account_role;
alter table kontodaten rename to account_data;
alter table lichtzone rename to light_zone;
alter table pruefvorgang rename to review_case;
alter table standort rename to location;

-- columns
alter table species rename column objekt_art to object_kind;
alter table species rename column gattung to genus;
alter table species rename column epitheton to epithet;
alter table species rename column sorte to cultivar;
alter table species rename column lateinischer_name to latin_name;
alter table species rename column deutscher_name to german_name;
alter table species rename column englischer_name to english_name;
alter table species rename column familie_deutsch to family_german;
alter table species rename column familie_lateinisch to family_latin;
alter table species rename column schwierigkeit to difficulty;
alter table species rename column standard_stufe to standard_level;
alter table species rename column lichtbedarf_lux to light_demand_lux;
alter table species rename column ruhe_von to dormancy_from;
alter table species rename column ruhe_bis to dormancy_until;
alter table species rename column standort_hinweis to location_hint;
alter table species rename column wachstumsmass to growth_measure;
alter table species rename column vergeilung_anzeichen to etiolation_signs;
alter table species rename column giesshinweis to watering_hint;
alter table species rename column substrat to substrate;
alter table species rename column rueckschnitt to pruning;
alter table species rename column wuchs_hacks to growth_hacks;
alter table species rename column erfolgskriterien to success_criteria;
alter table species rename column botanische_story to botanical_story;
alter table species rename column quelle to source;
alter table species rename column erstellt_von to created_by;
alter table species rename column angelegt_am to created_at;
alter table species_name rename column art_id to species_id;
alter table species_name rename column feld to field;
alter table species_name rename column anzeige to display;
alter table specimen rename column konto_id to account_id;
alter table specimen rename column art_id to species_id;
alter table specimen rename column kennzeichen to marker;
alter table specimen rename column standort_id to location_id;
alter table specimen rename column gefangen_am to caught_at;
alter table specimen rename column angelegt_am to created_at;
alter table idempotency rename column konto_id to account_id;
alter table idempotency rename column schluessel to key;
alter table idempotency rename column fingerabdruck to fingerprint;
alter table idempotency rename column ergebnis to result;
alter table idempotency rename column fertig to done;
alter table idempotency rename column angelegt_am to created_at;
alter table account rename column angelegt_am to created_at;
alter table account rename column subjekt to subject;
alter table account_role rename column konto to account;
alter table account_role rename column rolle to role;
alter table account_role rename column vergeben_am to granted_at;
alter table account_data rename column konto_id to account_id;
alter table account_data rename column anzeigename to display_name;
alter table account_data rename column email_bestaetigt to email_confirmed;
alter table account_data rename column aktualisiert_am to updated_at;
alter table light_zone rename column konto_id to account_id;
alter table light_zone rename column lux_decke to lux_ceiling;
alter table light_zone rename column reihenfolge to sort_order;
alter table light_zone rename column angelegt_am to created_at;
alter table review_case rename column konto_id to account_id;
alter table review_case rename column objekt_art to object_kind;
alter table review_case rename column objekt_id to object_id;
alter table review_case rename column grund to reason;
alter table review_case rename column geprueft_von to reviewed_by;
alter table review_case rename column geprueft_am to reviewed_at;
alter table review_case rename column angelegt_am to created_at;
alter table location rename column konto_id to account_id;
alter table location rename column lichtzone_id to light_zone_id;
alter table location rename column art to kind;
alter table location rename column angelegt_am to created_at;

-- constraints (primary/unique/foreign keys and checks without literals)
alter table account rename constraint konto_pkey to account_pkey;
alter table account rename constraint konto_subjekt_key to account_subject_key;
alter table account_role rename constraint konto_rolle_konto_fkey to account_role_account_fkey;
alter table account_role rename constraint konto_rolle_pkey to account_role_pkey;
alter table review_case rename constraint pruefvorgang_geprueft_von_fkey to review_case_reviewed_by_fkey;
alter table review_case rename constraint pruefvorgang_grund_check to review_case_reason_check;
alter table review_case rename constraint pruefvorgang_konto_id_fkey to review_case_account_id_fkey;
alter table review_case rename constraint pruefvorgang_objekt_art_check to review_case_object_kind_check;
alter table review_case rename constraint pruefvorgang_objekt_art_objekt_id_key to review_case_object_kind_object_id_key;
alter table review_case rename constraint pruefvorgang_pkey to review_case_pkey;
alter table account_data rename constraint kontodaten_konto_id_fkey to account_data_account_id_fkey;
alter table account_data rename constraint kontodaten_pkey to account_data_pkey;
alter table light_zone rename constraint lichtzone_konto_id_fkey to light_zone_account_id_fkey;
alter table light_zone rename constraint lichtzone_konto_id_id_key to light_zone_account_id_id_key;
alter table light_zone rename constraint lichtzone_lux_decke_check to light_zone_lux_ceiling_check;
alter table light_zone rename constraint lichtzone_name_check to light_zone_name_check;
alter table light_zone rename constraint lichtzone_pkey to light_zone_pkey;
alter table light_zone rename constraint lichtzone_ppfd_check to light_zone_ppfd_check;
alter table light_zone rename constraint lichtzone_reihenfolge_check to light_zone_sort_order_check;
alter table location rename constraint standort_konto_id_fkey to location_account_id_fkey;
alter table location rename constraint standort_konto_id_id to location_account_id_id;
alter table location rename constraint standort_konto_id_lichtzone_id_fkey to location_account_id_light_zone_id_fkey;
alter table location rename constraint standort_name_check to location_name_check;
alter table location rename constraint standort_pkey to location_pkey;
alter table idempotency rename constraint idempotenz_konto_id_fkey to idempotency_account_id_fkey;
alter table idempotency rename constraint idempotenz_pkey to idempotency_pkey;
alter table species rename constraint art_botanische_story_check to species_botanical_story_check;
alter table species rename constraint art_check to species_check;
alter table species rename constraint art_deutscher_name_check to species_german_name_check;
alter table species rename constraint art_englischer_name_check to species_english_name_check;
alter table species rename constraint art_epitheton_check to species_epithet_check;
alter table species rename constraint art_erfolgskriterien_check to species_success_criteria_check;
alter table species rename constraint art_familie_deutsch_check to species_family_german_check;
alter table species rename constraint art_familie_lateinisch_check to species_family_latin_check;
alter table species rename constraint art_gattung_check to species_genus_check;
alter table species rename constraint art_giesshinweis_check to species_watering_hint_check;
alter table species rename constraint art_lateinischer_name_check to species_latin_name_check;
alter table species rename constraint art_lichtbedarf_lux_check to species_light_demand_lux_check;
alter table species rename constraint art_pkey to species_pkey;
alter table species rename constraint art_quelle_check to species_source_check;
alter table species rename constraint art_rueckschnitt_check to species_pruning_check;
alter table species rename constraint art_ruhe_bis_check to species_dormancy_until_check;
alter table species rename constraint art_ruhe_von_check to species_dormancy_from_check;
alter table species rename constraint art_schwierigkeit_check to species_difficulty_check;
alter table species rename constraint art_sorte_check to species_cultivar_check;
alter table species rename constraint art_standard_stufe_check to species_standard_level_check;
alter table species rename constraint art_standort_hinweis_check to species_location_hint_check;
alter table species rename constraint art_substrat_check to species_substrate_check;
alter table species rename constraint art_vergeilung_anzeichen_check to species_etiolation_signs_check;
alter table species rename constraint art_wuchs_hacks_check to species_growth_hacks_check;
alter table species_name rename constraint art_name_anzeige_check to species_name_display_check;
alter table species_name rename constraint art_name_art_id_fkey to species_name_species_id_fkey;
alter table species_name rename constraint art_name_norm_check to species_name_norm_check;
alter table species_name rename constraint art_name_pkey to species_name_pkey;
alter table specimen rename constraint exemplar_kennzeichen_check to specimen_marker_check;
alter table specimen rename constraint exemplar_konto_id_fkey to specimen_account_id_fkey;
alter table specimen rename constraint exemplar_name_check to specimen_name_check;
alter table specimen rename constraint exemplar_pkey to specimen_pkey;
alter table specimen rename constraint exemplar_standort to specimen_location;

-- standalone indexes
alter index art_name_norm rename to species_name_norm;
alter index exemplar_art rename to specimen_species;
alter index exemplar_name_je_konto rename to specimen_name_per_account;
alter index lichtzone_name_je_konto rename to light_zone_name_per_account;
alter index standort_name_je_konto rename to location_name_per_account;
alter index standort_zone rename to location_zone;

-- 4. Value checks, key and defaults with the new names and values.
alter table account_role add constraint account_role_role_check check (role in ('operator', 'reviewer'));
alter table review_case add constraint review_case_check check (status <> 'rejected' or reason is not null);
alter table review_case add constraint review_case_status_check
  check (status in ('proposal', 'ai_unreviewed', 'curated', 'reviewed', 'rejected'));
alter table location add constraint location_kind_check check (kind in ('indoor', 'outdoor'));
alter table species add constraint species_created_by_check check (created_by in ('operator', 'reviewer', 'user'));
alter table species add constraint species_object_kind_check check (object_kind = 'species');
alter table species add constraint species_growth_measure_check
  check (growth_measure in ('height', 'rosette_diameter', 'shoot_length'));
alter table species add constraint species_object_kind_id_fkey
  foreign key (object_kind, id) references review_case (object_kind, object_id) on delete restrict;
alter table species_name add constraint species_name_field_check check (field in ('latin', 'german', 'english', 'synonym'));
alter table specimen add constraint specimen_status_check check (status in ('plant', 'cutting', 'archived'));
alter table species alter column object_kind set default 'species';
alter table specimen alter column status set default 'plant';

-- 5. Functions, policies and triggers again, in English.
-- Empty or missing session variable: the result is NULL and no row matches (safe default).
create function current_account() returns uuid
language sql stable
as $$ select nullif(current_setting('app.account_id', true), '')::uuid $$;

-- Switches tenant isolation on for a table. Every user-related table calls this after `create table`.
-- The table must carry the column `id_column` (default `account_id`, type uuid); the schema check makes sure of that.
create function tenant_protection(table_name regclass, id_column name default 'account_id') returns void
language plpgsql
as $$
begin
  execute format('alter table %s enable row level security', table_name);
  execute format('alter table %s force row level security', table_name);
  execute format(
    'create policy tenant on %s using (%I = current_account()) with check (%I = current_account())',
    table_name, id_column, id_column
  );
  execute format('grant select, insert, update, delete on %s to pflanzendex_app', table_name);
end
$$;

-- Only the roles of the session's account, never those of other accounts. Runs with owner rights (security definer).
create function roles_of_account() returns setof text
language sql stable security definer set search_path = public, pg_temp
as $$ select role from account_role where account = current_account() order by role $$;

create function is_reviewer() returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select exists (select from account_role where account = current_account()) $$;

revoke all on function roles_of_account(), is_reviewer() from public;
grant execute on function roles_of_account(), is_reviewer() to pflanzendex_app;

-- Review status and ownership of a species, as far as the caller may see them. Runs with owner rights because the
-- review list (review_case) otherwise hides foreign cases; the function only reveals the status of visible species.
create function species_status(p_species uuid) returns text
language sql stable security definer set search_path = public, pg_temp
as $$
  select v.status from review_case v
   where v.object_kind = 'species' and v.object_id = p_species
     and (v.status in ('curated', 'reviewed') or v.account_id = current_account())
$$;

create function species_own(p_species uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (select from review_case v
                  where v.object_kind = 'species' and v.object_id = p_species and v.account_id = current_account())
$$;

revoke all on function species_status(uuid), species_own(uuid) from public;
grant execute on function species_status(uuid), species_own(uuid) to pflanzendex_app;

-- Tenant policies (and forced row security) for all user-related tables.
select tenant_protection('account', 'id');
select tenant_protection('account_data');
select tenant_protection('light_zone');
select tenant_protection('location');
select tenant_protection('specimen');
select tenant_protection('idempotency');
select tenant_protection('review_case');

-- Sign-in path: registration and first sign-in do not know the account id yet, so a policy over `app.subject` applies
-- in addition. It shows and allows exactly the row of the one subject verified by the API process, never other accounts.
create policy sign_in_read on account for select
  using (subject is not null and subject = nullif(current_setting('app.subject', true), ''));
create policy sign_in_create on account for insert
  with check (subject is not null and subject = nullif(current_setting('app.subject', true), ''));

-- Reviewers may read the review list and change the status. That gives them metadata, no content.
create policy reviewer_reads on review_case for select using (is_reviewer());
create policy reviewer_decides on review_case for update using (is_reviewer()) with check (is_reviewer());

-- review_case enforces the row rules for the owner too. So that species_status() sees approved cases, exactly the
-- owner role may read them (never the application role, which is not a member of the owner role).
do $$
begin
  execute format(
    'create policy catalog_approved on review_case for select to %I using (status in (''curated'', ''reviewed''))',
    current_user
  );
end
$$;

-- The shared catalog carries no account id; visibility follows the review case.
alter table species force row level security;
alter table species_name force row level security;
create policy visible on species for select using (species_status(id) is not null);
create policy propose on species for insert with check (species_own(id));
create policy visible on species_name for select using (species_status(species_id) is not null);
create policy propose on species_name for insert with check (species_own(species_id));

-- Users create only as "user"; "operator" and "reviewer" are reserved for reviewers (FR-BES-02). Version starts at 1.
create function species_guard() returns trigger
language plpgsql
as $$
begin
  if new.created_by <> 'user' and not is_reviewer() then
    raise exception 'Created by % may only be given by an operator or reviewer', new.created_by using errcode = '42501';
  end if;
  new.version := 1;
  return new;
end
$$;
create trigger species_guard before insert on species for each row execute function species_guard();

-- Enforces the rights even against any mistake of the application: users only create proposals and change nothing
-- about the status; reviewers change only status, reason and review note, and the note always comes from the session.
create function review_case_guard() returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('proposal', 'ai_unreviewed') and not (new.status = 'curated' and is_reviewer()) then
      raise exception 'Review status % may only be created by a reviewer', new.status using errcode = '42501';
    end if;
    new.reason := null;
    new.reviewed_by := case when new.status = 'curated' then current_account() end;
    new.reviewed_at := case when new.status = 'curated' then now() end;
    return new;
  end if;
  if to_jsonb(new) = to_jsonb(old) then
    return new;
  end if;
  if (new.id, new.account_id, new.object_kind, new.object_id, new.created_at)
     is distinct from (old.id, old.account_id, old.object_kind, old.object_id, old.created_at) then
    raise exception 'Review case: the assignment is immutable' using errcode = '42501';
  end if;
  if not is_reviewer() then
    raise exception 'Only operators or reviewers change the review status' using errcode = '42501';
  end if;
  if new.status in ('proposal', 'ai_unreviewed', 'curated') then
    raise exception 'Review status % cannot be set afterwards', new.status using errcode = '42501';
  end if;
  new.reviewed_by := current_account();
  new.reviewed_at := now();
  return new;
end
$$;
create trigger review_case_guard before insert or update on review_case
  for each row execute function review_case_guard();
