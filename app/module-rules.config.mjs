// Data for the module gate rules AB-11 (glossary) and AB-13 (port contracts), merged into modules.config.mjs.

// AB-11: glossary words (Docs/PRODUCT-SPECS/00, singular; plurals are matched too) that no identifier in the kernel code
// may contain. Comments and string literals (error codes and texts are data) are not checked. "zone" and "phase"
// are left out on purpose: `timeZone` is a technical word.
export const KERNEL_GLOSSARY_WORDS = [
  "specimen",
  "species",
  "cutting",
  "etiolation",
  "caught",
  "wish",
  "wishlist",
  "pokedex",
  "treatment",
  "measurement",
  "catalog",
];

// AB-13: ports that are declared in code but have no shared contract test yet, each with the reason. A port with a
// `*.contract.test.ts` that names it must not stay here (stale entries fail). The list may only shrink.
export const PORTS_WITHOUT_CONTRACT_TEST = {
  TargetLocationSource:
    "Only implementation is the database-backed adapter in api/care; its contract test needs the test database (follow-up).",
  MeasurementSource:
    "Only implementation is the database-backed adapter in api/care; its contract test needs the test database (follow-up).",
  TreatmentSource:
    "Only implementation is the database-backed adapter in api/care; its contract test needs the test database (follow-up).",
  SpeciesRepointer:
    "Implementations (collection, later wishlist) run on a pooled client in the merge transaction; the contract test needs the test database (follow-up).",
};
