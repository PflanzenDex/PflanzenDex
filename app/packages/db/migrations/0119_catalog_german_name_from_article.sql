-- module: catalog
-- US-BES-12, FR-BES-17, issue 1851: the fill job took the German name from the Wikidata label before the title of the
-- German article. A wrong label then won although the article disagreed, for example "Krötenzwergmaus" on the item of
-- Scindapsus pictus, whose German article is "Gefleckte Efeutute". The job now ranks the article first; this migration
-- applies the same rule to the names it has already stored, from the stored snapshots (FR-BES-15), without a new request.
--
-- A name changes only when all of this holds, so a reviewed, corrected or operator-entered name never changes:
-- the newest provenance of the German name is the job's own Wikidata value (origin source, source wikidata), it was
-- marked disputed, the species still shows that value, and the stored Wikipedia snapshot is a German article whose
-- title is not the Latin name. The new value gets its own provenance row (source wikipedia, still disputed) under a new
-- catalog version, as the job writes it. Idempotent: afterwards the newest provenance is no longer from Wikidata.
-- Expand only: a value changes; the previous app version shows whichever name the row has.
--
-- Migrations run as the plain owner role under forced row security (0117): `app.review_sync` (0102) opens the SELECT
-- and UPDATE rules of every species for this transaction only. The provenance and snapshot tables are the owner's own.
select set_config('app.review_sync', 'on', true);

create temporary table german_name_fix on commit drop as
select a.id,
       w.raw ->> 'title' as title,
       w.link,
       w.license,
       w.retrieved_at
  from species a
  join lateral (
         select p.origin, p.source, p.disputed, p.value
           from catalog_field_provenance p
          where p.species_id = a.id and p.field = 'german_name'
          order by p.version desc
          limit 1
       ) newest on true
  join catalog_source_snapshot w on w.species_id = a.id and w.source = 'wikipedia'
 where newest.origin = 'source'
   and newest.source = 'wikidata'
   and newest.disputed
   and a.german_name = newest.value
   and w.raw -> 'content_urls' -> 'desktop' ->> 'page' like 'https://de.%'
   and char_length(w.raw ->> 'title') between 1 and 1000
   and w.raw ->> 'title' <> a.latin_name
   and w.raw ->> 'title' <> a.german_name;

update species a
   set german_name = f.title,
       version = a.version + 1
  from german_name_fix f
 where a.id = f.id;

insert into catalog_field_provenance
       (species_id, field, version, value, origin, source, link, license, retrieved_on, disputed)
select f.id, 'german_name', a.version, f.title, 'source', 'wikipedia', f.link, f.license, f.retrieved_at::date, true
  from german_name_fix f
  join species a on a.id = f.id;

select set_config('app.review_sync', '', true);
