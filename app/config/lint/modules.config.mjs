// Module register (AB-13): the single source for the module boundary checks (AB-7 to AB-14, FR-QG-19, ADR 0003, 0012).
// Read by tools/check/code/check-boundaries.mjs (imports, structure, migrations) and by findSchemaViolations in db.
// A module folder is `packages/<core|db|api|web>/src/<name>/` with an `index.ts` as its public interface; without such
// folders the gate is idle. `dependsOn` is the dependency matrix: `A -> B` may be imported only if B is listed for A; a
// new edge changes this file in the same PR, cycles are always an error (AB-8). `epics` maps epics to modules (report only).
// Foreign keys across modules only tenant-safe as (account_id, id) on allowed dependencies (O-2), plus reference tables.

import {
  KERNEL_GLOSSARY_WORDS,
  LEGACY_MIGRATIONS,
  LEGACY_TABLE_NAMES,
  PORTS_WITHOUT_CONTRACT_TEST,
} from "./module-rules.config.mjs";

const MODULE_RULES = { KERNEL_GLOSSARY_WORDS, PORTS_WITHOUT_CONTRACT_TEST };

const MODULES = [
  {
    name: "kernel",
    epics: ["TE"],
    tables: ["account", "idempotency", "schema_migrations", "medium"],
    dependsOn: [],
    ports: ["DataSource", "IdempotencyStore"],
  },
  {
    // Platform module (TE-06, ADR 0003 table "jobs"): PostgreSQL job queue and the runner. Has its own folder because the
    // queue has domain-free rules of its own (lease, retry, merge); MON, POK and KI depend on it, never the other way.
    name: "jobs",
    epics: ["TE"],
    tables: ["job"],
    dependsOn: ["kernel"],
    ports: ["JobQueue"],
  },
  {
    // Platform module (TE-05): object store port with an S3 adapter, image processing (strip EXIF/GPS). No table yet.
    name: "media",
    epics: ["TE"],
    tables: [],
    dependsOn: ["kernel"],
    ports: ["ObjectStore", "ImageProcessor"],
  },
  {
    name: "account",
    epics: ["ACC"],
    tables: ["account_data", "account_role", "invitation", "access_setting", "operator_cost"],
    dependsOn: ["kernel"],
    ports: [],
  },
  {
    name: "catalog",
    epics: ["BES"],
    tables: ["species", "species_name", "species_version", "review_case"],
    dependsOn: ["kernel"],
    // SpeciesRepointer (db): the merge of a proposal re-points the references of higher modules; each of them
    // implements the port for its own tables (US-BES-10), the API composes them.
    ports: ["SpeciesRepointer"],
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
    tables: ["specimen", "care_profile", "specimen_provenance"],
    dependsOn: ["kernel", "catalog", "light"],
    ports: ["TargetLocationSource", "MeasurementSource", "TreatmentSource"],
  },
  {
    name: "monitoring",
    epics: ["MON"],
    tables: [
      "reminder",
      "reminder_setting",
      "watering_log",
      "sensor",
      "measurements",
      "delivery_channel",
    ],
    dependsOn: ["kernel", "collection", "jobs"],
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
    tables: ["friendship", "friend_code", "sharing", "feed_seen", "event"],
    dependsOn: ["kernel", "account", "catalog", "collection", "care", "pokedex", "monitoring"],
    ports: [],
  },
  {
    // Swapping (ADR 0012): no back edge, `social` and `collection` never import it.
    name: "swap",
    epics: [],
    tables: ["offer", "swap"],
    dependsOn: ["kernel", "social", "collection", "catalog", "care"],
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
    name: "shell", // web app root, start page, onboarding (US-QG-07); nothing imports it except main and routes
    epics: [],
    tables: [],
    dependsOn: ["kernel", "account", "collection", "light", "social", "wishlist", "care", "today"],
    ports: [],
  },
  {
    name: "ai",
    // The keeper's AI client (ADR 0013, epic KI). Further tables follow with their stories: task, draft, ai_log.
    epics: ["KI"],
    tables: ["ai_connection"],
    dependsOn: ["kernel", "account"],
    ports: [],
  },
];

// Transition (ratchet, may only shrink): folders directly below `packages/<pkg>/src/` that belong to no module yet;
// any other folder that is no module fails (AB-13); an entry whose folder is gone is an error.
const UNMODULED_FOLDERS = {};

// Module-named folders that exist but do not meet the rules yet (ratchet, like the list above).
const MODULE_FOLDERS_IN_TRANSITION = {};

// Global reference tables (AB-10, ADR 0003 O-2): tables without an account id (justified in db/src/kernel/schema.ts) that
// other modules may point to with a plain foreign key on `(id)`, only from a module that may depend on the owner, with
// `on delete restrict` (P-10). Every entry needs a reason; the list grows only through review. Only `species`.
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
  ...MODULE_RULES,
};
