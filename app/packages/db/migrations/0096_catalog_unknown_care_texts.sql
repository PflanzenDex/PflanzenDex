-- module: catalog
-- US-BES-12, US-ENT-09 (#1005): growth measure, etiolation signs and success criteria of a species may be unknown (P-08,
-- assumption decided by the PO, DM-BES-01). The operator batch `catalog:load` and the dev catalog seed wrote the same
-- generic text and the growth measure `height` for every species; they now leave the three fields unknown. A user
-- proposal still fills them (FR-BES-05). Expand only: the columns become nullable, the checks stay (they pass for null).
-- The previous app version reads the cleared rows of the measurement view with `etiolationSigns.trim()`; such rows
-- exist only where the unreleased `catalog:load` (#992) or the dev seed ran, never on production before this release.
alter table species alter column growth_measure drop not null;
alter table species alter column etiolation_signs drop not null;
alter table species alter column success_criteria drop not null;

-- Rows the batch or the seed wrote, recognised by their source marker AND the exact generic texts, lose those values:
-- only while no reviewer confirmed the species (still `curated`, nobody reviewed it) and the row is unchanged since
-- loading (version 1). Reviewed, changed or proposal rows keep their values.
update species a
   set growth_measure = null,
       etiolation_signs = null,
       success_criteria = null
 where a.version = 1
   and a.growth_measure = 'height'
   and a.etiolation_signs = 'Lange, helle Zwischenräume und blasse Triebe.'
   and a.success_criteria = 'Kompakter Neuaustrieb ohne Streckung.'
   and (a.source = 'Curated start catalog (operator): names and family are taxonomic facts, entered by the operator; difficulty and light need unknown until a source is given'
        or a.source = 'Dev seed: names and family from common botanical knowledge; difficulty and light need unknown')
   and exists (
     select 1 from review_case v
      where v.object_kind = 'species' and v.object_id = a.id and v.status = 'curated' and v.reviewed_by is null
   );
