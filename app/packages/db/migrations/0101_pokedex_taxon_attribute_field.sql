-- module: pokedex
-- NFR-12, US-QG-07 (#1243): the researched Latin names of one field (`TaxonAttributesPostgres.speciesWith`) filter on the field
-- and order by the Latin name. The primary key starts with the Latin name, so it cannot serve the filter. Plain `create index`
-- (one transaction, see 0099). Additive: the previous app version does not name the index.
create index taxon_attribute_field on taxon_attribute (field, latin_name);
