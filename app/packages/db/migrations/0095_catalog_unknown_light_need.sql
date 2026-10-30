-- module: catalog
-- US-LIC-01, US-BES-12 (#1003): difficulty, default level and lux need of a species may be unknown (P-08, assumption
-- decided by the PO). Without a source a value stays unknown instead of a starting value from general horticultural
-- knowledge; the derivations show "unknown" with a next step. Expand only: the columns become nullable, the range checks
-- stay (they pass for null). The previous app version reads null without failing (the zone derivation already knew an
-- unknown lux need).
alter table species alter column difficulty drop not null;
alter table species alter column standard_level drop not null;
alter table species alter column light_demand_lux drop not null;

-- Rows the operator batch `catalog:load` (#992) or the dev catalog seed wrote with starting values, recognised by their
-- `source` marker, lose those values: only while no reviewer confirmed the species (still `curated`, nobody reviewed it)
-- and the row is unchanged since loading (version 1). Reviewed rows and every other row keep their values.
update species a
   set difficulty = null,
       standard_level = null,
       light_demand_lux = null,
       source = case
         when a.source like 'Dev seed:%'
           then 'Dev seed: names and family from common botanical knowledge; difficulty and light need unknown'
         else 'Curated start catalog (operator): names and family are taxonomic facts, entered by the operator; difficulty and light need unknown until a source is given'
       end
 where a.version = 1
   and (a.source = 'Curated start catalog (operator): names and family are taxonomic facts, entered by the operator; difficulty and standard light level are starting values, not measured and not cited'
        or a.source = 'Dev seed: names and family from common botanical knowledge, difficulty and light level are starting values')
   and exists (
     select 1 from review_case v
      where v.object_kind = 'species' and v.object_id = a.id and v.status = 'curated' and v.reviewed_by is null
   );
