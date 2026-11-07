-- module: equipment
-- US-BES-19, DM-EQU-05, P-08: the pot fields of an equipment record of type `Pot`. Diameter and height in centimeters
-- (1 to 300, starting values, assumption), material (text up to 60 characters) and drainage (yes or no). Every field is
-- optional: `null` means "unknown" and reads "unbekannt" (P-08). They belong to a pot only; the check keeps them `null`
-- for every other type. Expand only: the previous app version does not know the columns and keeps working; the row rule
-- of `equipment` covers them. The pot's size, material and drainage are never shared (US-EQU-12, DM-EQU-05).
alter table equipment
  add column diameter_cm numeric(5, 1) check (diameter_cm between 1 and 300),
  add column height_cm numeric(5, 1) check (height_cm between 1 and 300),
  add column material text check (char_length(material) between 1 and 60),
  add column drainage boolean,
  add constraint equipment_pot_fields_pots_only check (
    type = 'Pot'
    or (diameter_cm is null and height_cm is null and material is null and drainage is null)
  );
