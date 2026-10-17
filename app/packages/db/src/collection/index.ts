// Public interface of the `collection` module (ADR 0003).
export { SpeciesGone, type SpecimenRow } from "./specimen-shared.ts";
export { SpecimenPostgres } from "./specimens.ts";
export { CareProfilePostgres } from "./care-profiles.ts";
export { FIXTURES_COLLECTION, FIXTURE_SPECIES_ID, createFixtureSpecimenAt } from "./fixtures.ts";
export { COLLECTION_REPOINTERS } from "./repointers.ts";
export {
  archiveSpecimenOn,
  createSpecimenOn,
  findSpecimenOn,
  listSpecimensOn,
  type NewSpecimen,
} from "./specimen-shared.ts";
