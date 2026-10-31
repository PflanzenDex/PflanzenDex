-- One-off data fix for the test host (#1024, US-LIC-01, P-08). DRY RUN: read only, changes nothing.
-- Companion: fix.sql in this folder, same selection; it writes only with -v expected=<rows_to_change printed here>.
-- Runbook: docs/guides/operations/release-and-rollback.md, section "Data fix for catalogs loaded before 0.2.0".
--
-- Why it exists: migrations 0095 and 0096 clear the invented starting values only on rows that are still at version 1
-- and have reviewed_by null. The batch `catalog:load` (#992) marks every row it writes as reviewed by its own batch
-- account (review_case_guard sets reviewed_by on each curated row), so that guard never matched, and CATALOG_FILL raised
-- some rows to version 2. On the test host both migrations therefore skipped every row.
--
-- Selection, per species of the operator batch:
--   1. created by the operator, source = the batch marker (the text of #992 or of #1004), review case `curated` and
--      reviewed by the batch account. A curated case cannot change afterwards (review_case_guard), so no later review
--      can exist; the status check covers that.
--   2. Excluded and counted when a user correction (catalog_correction, any status) or a merged proposal
--      (review_case.merged_into) points to the species: this fix never touches a user's proposal.
--   3. Per field, a value is cleared only when it equals exactly what the batch wrote: difficulty and standard level
--      from the start list of #992 (the table below), light need from the standard level (3000 / 8000 / 20000 lux,
--      LUX_BY_LEVEL of #992), growth measure 'height', and the two generic texts. Any other value is kept and counted
--      under kept_differs_or_unknown (P-10: nothing disappears silently).
--
-- Run on the host, in the checkout that has this file (see the runbook; c = the compose shortcut):
--   $c exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -tA -f -' < docs/guides/operations/catalog-starting-values/dry-run.sql

\set ON_ERROR_STOP on
begin read only;

with batch_account as (
  select id from account where subject = 'catalog-load'
),
-- The start list as #992 wrote it (app/packages/api/src/catalog/load/start-species.ts before commit 948b7202, #1004):
-- latin name, difficulty (1-3) and standard level (2-4) of every species.
start_values (latin_name, difficulty, standard_level) as (
  values
    ('Monstera deliciosa', 1, 3),
    ('Epipremnum aureum', 1, 2),
    ('Philodendron hederaceum', 1, 2),
    ('Spathiphyllum wallisii', 1, 2),
    ('Zamioculcas zamiifolia', 1, 2),
    ('Aglaonema commutatum', 1, 2),
    ('Anthurium andraeanum', 2, 3),
    ('Alocasia amazonica', 3, 3),
    ('Dieffenbachia seguine', 1, 3),
    ('Syngonium podophyllum', 1, 3),
    ('Sansevieria trifasciata', 1, 2),
    ('Chlorophytum comosum', 1, 3),
    ('Dracaena fragrans', 1, 3),
    ('Yucca elephantipes', 1, 4),
    ('Aloe vera', 1, 4),
    ('Haworthiopsis attenuata', 1, 3),
    ('Crassula ovata', 1, 4),
    ('Echeveria elegans', 2, 4),
    ('Kalanchoe blossfeldiana', 1, 4),
    ('Sedum morganianum', 2, 4),
    ('Ficus elastica', 1, 3),
    ('Ficus lyrata', 3, 4),
    ('Ficus benjamina', 2, 3),
    ('Schefflera arboricola', 1, 3),
    ('Hedera helix', 1, 2),
    ('Fatsia japonica', 1, 2),
    ('Pilea peperomioides', 1, 3),
    ('Peperomia obtusifolia', 1, 3),
    ('Calathea orbifolia', 3, 2),
    ('Maranta leuconeura', 2, 2),
    ('Ctenanthe burle-marxii', 2, 2),
    ('Nephrolepis exaltata', 2, 2),
    ('Asplenium nidus', 2, 2),
    ('Adiantum raddianum', 3, 2),
    ('Platycerium bifurcatum', 3, 3),
    ('Phalaenopsis amabilis', 2, 3),
    ('Paphiopedilum insigne', 3, 3),
    ('Tillandsia ionantha', 2, 3),
    ('Guzmania lingulata', 2, 3),
    ('Beaucarnea recurvata', 1, 4),
    ('Chamaedorea elegans', 1, 2),
    ('Howea forsteriana', 2, 3),
    ('Cycas revoluta', 2, 4),
    ('Hoya carnosa', 2, 3),
    ('Ceropegia woodii', 2, 4),
    ('Tradescantia zebrina', 1, 3),
    ('Begonia maculata', 3, 3),
    ('Saintpaulia ionantha', 2, 3),
    ('Codiaeum variegatum', 3, 4),
    ('Euphorbia trigona', 1, 4),
    ('Citrus limon', 3, 4),
    ('Philodendron bipinnatifidum', 1, 3),
    ('Monstera adansonii', 1, 3),
    ('Rhaphidophora tetrasperma', 1, 3),
    ('Scindapsus pictus', 1, 2),
    ('Caladium bicolor', 3, 3),
    ('Colocasia esculenta', 2, 3),
    ('Zantedeschia aethiopica', 2, 3),
    ('Dracaena marginata', 1, 3),
    ('Dracaena sanderiana', 1, 2),
    ('Asparagus setaceus', 2, 3),
    ('Aspidistra elatior', 1, 2),
    ('Cordyline fruticosa', 2, 3),
    ('Agave americana', 1, 4),
    ('Aloe arborescens', 1, 4),
    ('Phormium tenax', 2, 4),
    ('Kalanchoe daigremontiana', 1, 4),
    ('Graptopetalum paraguayense', 1, 4),
    ('Sempervivum tectorum', 1, 4),
    ('Echinocactus grusonii', 2, 4),
    ('Schlumbergera truncata', 2, 3),
    ('Hatiora gaertneri', 2, 3),
    ('Rhipsalis baccifera', 2, 3),
    ('Gymnocalycium mihanovichii', 2, 4),
    ('Ficus pumila', 2, 2),
    ('Polyscias fruticosa', 2, 3),
    ('Soleirolia soleirolii', 2, 2),
    ('Pilea cadierei', 1, 2),
    ('Peperomia argyreia', 2, 3),
    ('Calathea makoyana', 3, 2),
    ('Pteris cretica', 2, 2),
    ('Pellaea rotundifolia', 2, 2),
    ('Davallia canariensis', 2, 2),
    ('Blechnum gibbum', 2, 2),
    ('Dendrobium nobile', 3, 3),
    ('Aechmea fasciata', 2, 3),
    ('Vriesea splendens', 2, 3),
    ('Ananas comosus', 2, 4),
    ('Cryptanthus bivittatus', 2, 2),
    ('Dypsis lutescens', 2, 3),
    ('Phoenix roebelenii', 2, 4),
    ('Rhapis excelsa', 1, 3),
    ('Livistona chinensis', 2, 3),
    ('Chamaerops humilis', 1, 4),
    ('Trachycarpus fortunei', 1, 4),
    ('Nerium oleander', 2, 4),
    ('Mandevilla sanderi', 2, 4),
    ('Adenium obesum', 3, 4),
    ('Stephanotis floribunda', 3, 3),
    ('Catharanthus roseus', 2, 4),
    ('Sinningia speciosa', 3, 3),
    ('Begonia rex', 2, 3),
    ('Euphorbia pulcherrima', 2, 3),
    ('Euphorbia milii', 1, 4),
    ('Euphorbia tirucalli', 1, 4),
    ('Clivia miniata', 2, 3),
    ('Cyclamen persicum', 2, 3),
    ('Primula obconica', 2, 3),
    ('Pelargonium zonale', 1, 4),
    ('Fuchsia magellanica', 2, 3),
    ('Hibiscus rosa-sinensis', 2, 4),
    ('Pachira aquatica', 1, 3),
    ('Jasminum polyanthum', 2, 4),
    ('Olea europaea', 2, 4),
    ('Laurus nobilis', 1, 4),
    ('Coffea arabica', 2, 3),
    ('Gardenia jasminoides', 3, 3),
    ('Hydrangea macrophylla', 2, 3),
    ('Camellia japonica', 3, 3),
    ('Rhododendron simsii', 3, 3),
    ('Impatiens walleriana', 1, 3),
    ('Plectranthus scutellarioides', 1, 3),
    ('Radermachera sinica', 2, 3),
    ('Murraya paniculata', 2, 4),
    ('Bougainvillea glabra', 2, 4),
    ('Passiflora caerulea', 2, 4),
    ('Strelitzia reginae', 2, 4),
    ('Cissus rhombifolia', 1, 2),
    ('Oxalis triangularis', 1, 3),
    ('Fittonia albivenis', 3, 2),
    ('Hypoestes phyllostachya', 2, 3),
    ('Justicia brandegeeana', 2, 3),
    ('Aphelandra squarrosa', 3, 3),
    ('Gynura aurantiaca', 2, 3),
    ('Senecio rowleyanus', 2, 4),
    ('Dionaea muscipula', 3, 4),
    ('Sarracenia purpurea', 3, 4)
),
marked as (
  -- the operator batch: marker, created by the operator, curated and reviewed by the batch account
  select a.*,
         exists (select 1 from catalog_correction c where c.species_id = a.id) as has_correction,
         exists (select 1 from review_case m where m.merged_into = a.id) as has_merge
    from species a
    join review_case v on v.object_kind = 'species' and v.object_id = a.id
   where a.created_by = 'operator'
     and a.source in (
       'Curated start catalog (operator): names and family are taxonomic facts, entered by the operator; difficulty and standard light level are starting values, not measured and not cited',
       'Curated start catalog (operator): names and family are taxonomic facts, entered by the operator; difficulty and light need unknown until a source is given')
     and v.status = 'curated'
     and v.reviewed_by = (select id from batch_account)
),
candidates as (
  select * from marked where not has_correction and not has_merge
),
flagged as (
  -- one row per candidate; f_* is true when the field holds exactly the value the batch wrote (strict equality, so a
  -- null never counts as a match)
  select c.id, c.latin_name, c.source, c.version, c.difficulty, c.standard_level, c.light_demand_lux,
         c.growth_measure, c.etiolation_signs, c.success_criteria,
         sv.latin_name is not null as in_list,
         coalesce(c.difficulty = sv.difficulty, false) as f_difficulty,
         coalesce(c.standard_level = sv.standard_level, false) as f_standard_level,
         coalesce(c.light_demand_lux = case sv.standard_level when 2 then 3000 when 3 then 8000 when 4 then 20000 end, false) as f_light_demand_lux,
         coalesce(c.growth_measure = 'height', false) as f_growth_measure,
         coalesce(c.etiolation_signs = 'Lange, helle Zwischenräume und blasse Triebe.', false) as f_etiolation_signs,
         coalesce(c.success_criteria = 'Kompakter Neuaustrieb ohne Streckung.', false) as f_success_criteria
    from candidates c
    left join start_values sv on sv.latin_name = c.latin_name
)
select jsonb_pretty(jsonb_build_object(
  'batch_rows', (select count(*) from marked),
  'batch_reviewed_at', (select coalesce(jsonb_agg(jsonb_build_object('reviewed_at', r.t, 'rows', r.n) order by r.t), '[]'::jsonb)
      from (select v.reviewed_at as t, count(*) as n from review_case v
              join marked m on m.id = v.object_id and v.object_kind = 'species' group by v.reviewed_at) r),
  'batch_versions', (select coalesce(jsonb_object_agg(x.version, x.n), '{}'::jsonb)
      from (select version, count(*) as n from marked group by version) x),
  'excluded_user_correction', (select count(*) from marked where has_correction),
  'excluded_merged_proposal', (select count(*) from marked where has_merge),
  'candidates', (select count(*) from candidates),
  'candidates_in_start_list', (select count(*) from flagged where in_list),
  'cleared_per_field', (select jsonb_build_object(
      'difficulty', count(*) filter (where f_difficulty),
      'standard_level', count(*) filter (where f_standard_level),
      'light_demand_lux', count(*) filter (where f_light_demand_lux),
      'growth_measure', count(*) filter (where f_growth_measure),
      'etiolation_signs', count(*) filter (where f_etiolation_signs),
      'success_criteria', count(*) filter (where f_success_criteria)) from flagged),
  'kept_differs_or_unknown', (select jsonb_build_object(
      'difficulty', count(*) filter (where not f_difficulty),
      'standard_level', count(*) filter (where not f_standard_level),
      'light_demand_lux', count(*) filter (where not f_light_demand_lux),
      'growth_measure', count(*) filter (where not f_growth_measure),
      'etiolation_signs', count(*) filter (where not f_etiolation_signs),
      'success_criteria', count(*) filter (where not f_success_criteria)) from flagged),
  'rows_to_change', (select count(*) from flagged
      where f_difficulty or f_standard_level or f_light_demand_lux or f_growth_measure or f_etiolation_signs or f_success_criteria),
  'sample_before', (select jsonb_agg(to_jsonb(s)) from (
      select latin_name, difficulty, standard_level, light_demand_lux, growth_measure, etiolation_signs,
             success_criteria, source, version
        from flagged order by latin_name limit 3) s)
)) as dry_run;

rollback;
