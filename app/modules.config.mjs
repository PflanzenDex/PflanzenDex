// Module register (AB-13): the single source for the module boundary checks (AB-7 to AB-14, FR-QG-19, ADR 0003).
// Read by scripts/check-boundaries.mjs (imports, structure, migrations) and by findSchemaViolations in db (tables,
// foreign keys). Code that moves into modules only reads this file.
//
// A module folder is `packages/<core|db|api|web>/src/<name>/` with an `index.ts` as its public interface (variant A).
// The rules apply to every folder that carries the name of a module below; without such folders the gate is idle.
// The cut follows ADR 0003 with the owner decisions O-1 (care and growth merged, media and jobs live in `kernel`)
// and O-2 (foreign keys across modules only tenant-safe as (account_id, id) on allowed dependencies).
// `dependsOn` is the dependency matrix: `A -> B` may be imported only if B is listed for A. A new edge changes this
// file in the same PR; cycles are always an error (AB-8). `epics` maps epics to modules (report only, QG-T4).

const MODULES = [
  {
    name: "kernel",
    epics: ["TE"],
    tables: ["account", "idempotency", "schema_migrations", "medium"],
    dependsOn: [],
    ports: ["DataSource", "IdempotencyStore"],
  },
  {
    name: "account",
    epics: ["ACC"],
    tables: ["account_data", "account_role", "invitation"],
    dependsOn: ["kernel"],
    ports: [],
  },
  {
    name: "catalog",
    epics: ["BES"],
    tables: ["species", "species_name", "species_version", "review_case"],
    dependsOn: ["kernel"],
    ports: [],
  },
  {
    name: "light",
    epics: ["LIC"],
    tables: ["light_zone", "location"],
    dependsOn: ["kernel"],
    ports: ["ZoneUsage"],
  },
  {
    name: "collection",
    epics: ["BES"],
    tables: ["specimen", "pflegeprofil", "specimen_provenance"],
    dependsOn: ["kernel", "catalog", "light"],
    ports: ["TargetLocationSource"],
  },
  {
    name: "monitoring",
    epics: ["MON"],
    tables: ["reminder", "watering_log", "sensor", "measurements", "delivery_channel"],
    dependsOn: ["kernel", "collection"],
    ports: ["OccasionSource"],
  },
  {
    name: "care",
    epics: ["PHA", "BEH", "WAC"],
    tables: ["treatment", "measurement"],
    dependsOn: ["kernel", "catalog", "light", "collection", "monitoring"],
    ports: [],
  },
  {
    name: "wishlist",
    epics: ["WUN"],
    tables: ["wish"],
    dependsOn: ["kernel", "catalog", "light", "collection"],
    ports: [],
  },
  {
    name: "pokedex",
    epics: ["POK"],
    tables: ["taxon", "pokedex_state"],
    dependsOn: ["kernel", "catalog", "collection"],
    ports: [],
  },
  {
    name: "equipment",
    epics: ["EQU"],
    tables: ["equipment", "supply", "recommendation"],
    dependsOn: ["kernel", "light", "collection", "wishlist", "monitoring"],
    ports: [],
  },
  {
    name: "social",
    epics: ["SOZ"],
    tables: ["friendship", "sharing", "offer", "swap", "event"],
    dependsOn: ["kernel", "account", "catalog", "collection", "care", "pokedex", "monitoring"],
    ports: [],
  },
  {
    name: "discover",
    epics: ["ENT"],
    tables: ["proposal_entscheidung"],
    dependsOn: ["kernel", "catalog", "light", "collection", "care", "wishlist", "pokedex"],
    ports: [],
  },
  {
    name: "today",
    epics: [],
    tables: [],
    dependsOn: ["kernel", "light", "collection", "care", "wishlist", "monitoring"],
    ports: [],
  },
  {
    name: "ai-access",
    epics: ["AI"],
    tables: ["connection", "task", "draft", "ai_log"],
    dependsOn: ["kernel", "account"],
    ports: [],
  },
];

// The migrations 0001 to 0007 were applied before modules existed or before the English rename and must not be
// renamed. They name no (English) module in the file name; this map assigns them (AB-14). 0008 renames the objects of
// all modules in one go (ADR 0004). New migrations carry the module in the name and in the first line.
const LEGACY_MIGRATIONS = {
  "0001_mandantengrundlage.sql": ["kernel"],
  "0002_betreiber_pruefstatus.sql": ["account", "catalog"],
  "0003_anmeldung.sql": ["account"],
  "0004_lichtzonen_standorte.sql": ["light", "kernel"],
  "0005_katalog_artenkatalog.sql": ["catalog"],
  "0006_licht_standort_schluessel.sql": ["light"],
  "0007_bestand_exemplar.sql": ["collection"],
  "0008_english_names.sql": ["kernel", "account", "catalog", "light", "collection"],
};

// Table names as the applied migrations 0001 to 0007 wrote them. 0008 renamed them; the migration check maps the old
// names to the registered ones.
const LEGACY_TABLE_NAMES = {
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
};

// Transition (ratchet, may only shrink): folders directly below `packages/<pkg>/src/` that belong to no module yet.
// Any other folder below `src/` that is neither a module nor listed here fails (AB-13). An entry whose folder is gone
// is an error. Empty since the move into modules (#227): all code lives in kern, konto, katalog and licht.
const UNMODULED_FOLDERS = {};

// Module-named folders that exist but do not meet the rules yet; treated like unmoduled folders until fixed, an
// entry that no longer applies is an error (ratchet). Empty: web/licht has its index.ts and is imported via it.
const MODULE_FOLDERS_IN_TRANSITION = {};

const KERNEL = "kernel";

export const MODULE_CONFIG = {
  MODULES,
  KERNEL,
  LEGACY_MIGRATIONS,
  LEGACY_TABLE_NAMES,
  UNMODULED_FOLDERS,
  MODULE_FOLDERS_IN_TRANSITION,
};
