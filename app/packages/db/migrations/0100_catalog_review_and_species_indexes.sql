-- module: catalog
-- NFR-12, US-QG-07 (#1243): the review list (`ReviewPostgres.listForReview`) reads the open proposals and the latest curated
-- batches, and the species search orders by the Latin name. The partial indexes carry the predicates of those queries, so the
-- planner can use them; `species_latin_name` serves the ordered search. Plain `create index` (one transaction, see 0099).
-- Additive: the previous app version does not name the indexes.
create index review_case_open on review_case (created_at, id) where status in ('proposal', 'ai_unreviewed');
create index review_case_curated_species on review_case (created_at desc, id) where status = 'curated' and object_kind = 'species';
create index species_latin_name on species (latin_name);
