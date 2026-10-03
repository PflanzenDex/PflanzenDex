// Module register (AB-13): the single source for the module boundary checks (AB-7 to AB-14, FR-QG-19, ADR 0003).
// Read by scripts/check-boundaries.mjs (imports, structure, migrations) and by findSchemaViolations in db (tables,
// foreign keys). Code that moves into modules only reads this file.
//
// A module folder is `packages/<core|db|api|web>/src/<name>/` with an `index.ts` as its public interface (variant A).
// The rules apply to every folder that carries the name of a module below; without such folders the gate is idle.
// The cut follows ADR 0003 with the owner decisions O-1 (care and growth merged, media and jobs live in `kernel`)
// and O-2 (foreign keys across modules only tenant-safe as (account_id, id) on allowed dependencies, plus the one
// registered exception below for global reference tables).
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
    ports: ["TargetLocationSource", "MeasurementSource", "TreatmentSource"],
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

// The migrations 0001 to 0011 were applied before the English rename and must not be renamed. They name no (English)
// module in the file name; this map assigns them (AB-14). 0012 renames the objects of all modules in one go
// (ADR 0004). New migrations carry the module in the name and in the first line.
const LEGACY_MIGRATIONS = {
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

// Table names as the applied migrations 0001 to 0011 wrote them. 0012 renamed them; the migration check maps the old
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
  messung: "measurement",
};

// Transition (ratchet, may only shrink): folders directly below `packages/<pkg>/src/` that belong to no module yet.
// Any other folder below `src/` that is neither a module nor listed here fails (AB-13). An entry whose folder is gone
// is an error. Empty since the move into modules (#227): all code lives in kern, konto, katalog and licht.
const UNMODULED_FOLDERS = {};

// Module-named folders that exist but do not meet the rules yet; treated like unmoduled folders until fixed, an
// entry that no longer applies is an error (ratchet). Empty: web/licht has its index.ts and is imported via it.
const MODULE_FOLDERS_IN_TRANSITION = {};

// Global reference tables (AB-10, ADR 0003 O-2): tables without `konto_id` (a justified entry in OHNE_KONTO_KENNUNG,
// db/src/kern/schema.ts) that other modules may point to with a plain foreign key on `(id)`. Allowed only from a module
// that may depend on the owner according to the matrix above, with `on delete restrict`. Why: a rule that exists only
// in a document is a wish (Docs/principles/README.md); the database guarantees integrity (PRIN-006, P-04 testable)
// and deleting a species in use fails instead of leaving a dangling reference (P-10). Every entry needs a reason; the
// list grows only through review (EX-1 principle: registered, justified, narrow). Only `art`: `art_name` and
// `art_version` are details of a species, nothing outside `katalog` should point to them.
const GLOBAL_REFERENCE_TABLES = {
  species: {
    owner: "catalog",
    reason:
      "The shared species catalog (E-02) has no account_id by design, so the tenant-safe (account_id, id) form cannot exist; Specimens and later wishes point to a species, and the database must refuse unknown species and the deletion of species in use.",
  },
};

const KERNEL = "kernel";

export const MODULE_CONFIG = {
  MODULES,
  KERNEL,
  LEGACY_MIGRATIONS,
  LEGACY_TABLE_NAMES,
  UNMODULED_FOLDERS,
  MODULE_FOLDERS_IN_TRANSITION,
  GLOBAL_REFERENCE_TABLES,
};
