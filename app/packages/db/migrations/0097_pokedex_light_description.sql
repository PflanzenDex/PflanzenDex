-- module: pokedex
-- US-ENT-09, DM-ENT-01, P-08 (#1015): the source's light statement `light_description` becomes a fifth attribute field
-- with the fixed value set low / medium / bright_indirect / direct_sun (assumption, decided by the PO, revisable). It
-- is the statement of a source with link, license and retrieval date like the other fields and feeds neither the light
-- zone derivation nor the scoring. Expand only: the checks only get wider, existing rows stay valid, and the previous
-- app version never reads the new field (it has no row until `catalog:load` writes one).
alter table taxon_attribute drop constraint taxon_attribute_field_check;
alter table taxon_attribute add constraint taxon_attribute_field_check
  check (field in ('humidity', 'min_temperature', 'growth_size', 'toxic_to_pets', 'light_description'));

alter table taxon_attribute drop constraint taxon_attribute_check;
alter table taxon_attribute add constraint taxon_attribute_check
  check (
    (field = 'humidity' and value in ('"low"', '"medium"', '"high"'))
    or (field = 'growth_size' and value in ('"small"', '"medium"', '"large"'))
    or (field = 'min_temperature' and jsonb_typeof(value) = 'number' and (value #>> '{}')::numeric between -30 and 30)
    or (field = 'toxic_to_pets' and jsonb_typeof(value) = 'boolean')
    or (field = 'light_description' and value in ('"low"', '"medium"', '"bright_indirect"', '"direct_sun"'))
  );
