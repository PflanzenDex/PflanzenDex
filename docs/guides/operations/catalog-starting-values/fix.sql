-- One-off data fix for the test host (#1024, US-LIC-01, P-08). WRITE: run only after dry-run.sql in this folder was
-- reviewed, and only with the count it printed as rows_to_change. Not a migration; it runs once.
--   $c exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -v expected=<rows_to_change> -tA -f -' < docs/guides/operations/catalog-starting-values/fix.sql
-- The selection is the one of dry-run.sql (same CTEs). Without -v expected nothing runs. One transaction: it commits
-- only if exactly `expected` rows changed; otherwise it rolls back. A cleared row gets the current source marker
-- (the text 0095 writes) and version + 1 (FR-BES-12). Rows the dry run kept stay untouched.

\set ON_ERROR_STOP on
\if :{?expected}
\else
do $$ begin raise exception 'pass -v expected=<rows_to_change from dry-run.sql>; nothing was changed'; end $$;
\endif
begin;

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
,
changed as (
  select * from flagged
   where f_difficulty or f_standard_level or f_light_demand_lux or f_growth_measure or f_etiolation_signs or f_success_criteria
),
updated as (
  update species a
     set difficulty = case when f.f_difficulty then null else a.difficulty end,
         standard_level = case when f.f_standard_level then null else a.standard_level end,
         light_demand_lux = case when f.f_light_demand_lux then null else a.light_demand_lux end,
         growth_measure = case when f.f_growth_measure then null else a.growth_measure end,
         etiolation_signs = case when f.f_etiolation_signs then null else a.etiolation_signs end,
         success_criteria = case when f.f_success_criteria then null else a.success_criteria end,
         source = 'Curated start catalog (operator): names and family are taxonomic facts, entered by the operator; difficulty and light need unknown until a source is given',
         version = a.version + 1
    from changed f
   where a.id = f.id
  returning a.id
)
select count(*) as updated from updated \gset
\echo updated :updated, expected :expected
select (:updated = :expected) as ok \gset
\if :ok
commit;
\echo committed: the species of the batch are cleared, :updated rows
\else
rollback;
do $$ begin raise exception 'the rows changed differ from the dry run; rolled back, nothing changed'; end $$;
\endif
