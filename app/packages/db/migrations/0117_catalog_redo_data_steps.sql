-- module: catalog
-- NFR-15, issue #1809 (owner decision 2026-11-10): migrations run as the plain owner role (deploy: the `migrate` service,
-- DATABASE_URL = pflanzendex_owner). Under forced row security the owner sees and changes only what the row rules allow,
-- so three data steps matched no row and succeeded silently: 0098 (German source texts) and 0116 (soft leaf unknown) left
-- every species unchanged, and 0112 (repot backfill) copied no repot day, because the owner sees no specimen of another
-- account. This migration redoes the three steps as the owner. Applied migrations stay as they are (checksums).
-- Idempotent: each statement changes only the rows that still hold the old value, so a second run changes nothing.
-- Expand only: the texts and the flag change values, the repot rows are added; the previous app version keeps working.
--
-- Species (0098, 0116). The owner's SELECT rule on `species` shows the curated and reviewed species only (0102), and
-- `catalog_fill` (0078) opens only the UPDATE rule. Measured on a scratch database as the owner: under `catalog_fill` a
-- curated species changed and a keeper's proposal did not; under `app.review_sync` (0102) both changed. So the switch is
-- review_sync: it opens the SELECT and UPDATE rules of every species, whatever its review status, for this transaction only.
select set_config('app.review_sync', 'on', true);

update species
   set source = 'Dev-Seed: Namen und Familie aus allgemeinem botanischem Wissen; Schwierigkeit und Lichtbedarf unbekannt'
 where source = 'Dev seed: names and family from common botanical knowledge; difficulty and light need unknown';

update species
   set source = 'Kuratierter Startkatalog (Betreiber): Namen und Familie sind taxonomische Fakten, vom Betreiber eingetragen; Schwierigkeit und Lichtbedarf unbekannt, bis eine Quelle genannt wird'
 where source = 'Curated start catalog (operator): names and family are taxonomic facts, entered by the operator; difficulty and light need unknown until a source is given';

-- As 0116: a stored false becomes unknown (null), an explicit true stays. The release that carries 0116 (PR #1790) also
-- stores an explicit false for "no" in the form. A "no" saved after 0116 was applied and before this migration runs cannot
-- be told apart from the old default, so it becomes unknown too (the keeper answers again; see the PR's Handoff).
update species set soft_leaf = null where soft_leaf = false;

select set_config('app.review_sync', '', true);

-- Repot days (0112, US-BES-04). The owner reads a specimen only under the tenant rule, so the loop takes each account of
-- the owner in turn (`account` is readable for the owner by the rule of 0023) and sets the account of the transaction
-- (`app.account_id`, the switch the tenant rule reads). A specimen with a repot day gets a repot row for that day unless
-- its account already has one for it, so a second run adds nothing and no day is doubled. The switch is cleared at the end.
-- The loop runs one statement per account; that is fine for a one-time backfill (starting value, assumption).
do $$
declare
  holder record;
begin
  for holder in select id from account loop
    perform set_config('app.account_id', holder.id::text, true);
    insert into repot (account_id, specimen_id, repotted_on)
      select s.account_id, s.id, s.repotted_at
        from specimen s
       where s.account_id = holder.id
         and s.repotted_at is not null
         and not exists (
           select from repot r
            where r.account_id = s.account_id and r.specimen_id = s.id and r.repotted_on = s.repotted_at);
  end loop;
  perform set_config('app.account_id', '', true);
end
$$;
