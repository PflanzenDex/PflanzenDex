// Data for the module gate rules AB-11 (glossary), AB-13 (port contracts) and AB-14 (legacy migration names), merged into modules.config.mjs.

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
// `*.contract.test.ts` that names it must not stay here (stale entries fail). The list may only shrink; it is empty
// since every declared port has a contract test.
export const PORTS_WITHOUT_CONTRACT_TEST = {};

// The migrations 0001 to 0011 were applied before the English rename and must not be renamed; this map assigns them to
// modules (AB-14). 0012 renames the objects of all modules (ADR 0004). New migrations carry the module in the name.
export const LEGACY_MIGRATIONS = {
  "0001_mandantengrundlage.sql": ["kernel"],
  "0002_betreiber_pruefstatus.sql": ["account", "catalog"],
  "0003_anmeldung.sql": ["account"],
  "0004_lichtzonen_standorte.sql": ["light", "kernel"],
  "0005_katalog_artenkatalog.sql": ["catalog"],
  "0006_licht_standort_schluessel.sql": ["light"],
  "0007_bestand_exemplar.sql": ["collection"],
  "0008_bestand_exemplar_art_fremdschluessel.sql": ["collection"],
  "0009_bestand_exemplar_schluessel.sql": ["collection"],
  "0010_pflege_messung.sql": ["care"],
  "0011_bestand_archiv.sql": ["collection"],
  "0012_english_names.sql": ["kernel", "account", "catalog", "light", "collection", "care"],
};

// Table names as the applied migrations 0001 to 0011 wrote them (0012 renamed them); the check maps them to the registered ones.
export const LEGACY_TABLE_NAMES = {
  konto: "account",
  konto_rolle: "account_role",
  kontodaten: "account_data",
  pruefvorgang: "review_case",
  lichtzone: "light_zone",
  standort: "location",
  idempotenz: "idempotency",
  art: "species",
  art_name: "species_name",
  exemplar: "specimen",
  messung: "measurement",
};
