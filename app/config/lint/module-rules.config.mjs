// Data for the module gate rules AB-11 (glossary), AB-13 (port contracts) and AB-14 (legacy migration names), merged into modules.config.mjs.

// AB-11: glossary words (docs/specs/product/00, singular; plurals are matched too) that no identifier in the kernel code
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

// The chain 0001 to 0120 was squashed into the baseline `0001_baseline.sql` (issue 2519, owner decision d-122); the old
// files are in git history only. The baseline spans every module, so it may touch the tables of all of them (AB-14).
// From the baseline on, new migrations carry the module in the name (`NNNN_<module>_<name>.sql`).
export const LEGACY_MIGRATIONS = {
  "0001_baseline.sql": [
    "kernel",
    "jobs",
    "media",
    "account",
    "catalog",
    "light",
    "collection",
    "monitoring",
    "care",
    "wishlist",
    "pokedex",
    "equipment",
    "social",
    "swap",
    "achievements",
    "privacy",
    "discover",
    "today",
    "ai",
  ],
};

// Table names of the applied migrations before the English rename (0001 to 0011, now squashed): no legacy names remain.
export const LEGACY_TABLE_NAMES = {};

// Global reference tables (AB-10, ADR 0003 O-2): tables without an account id (justified in db/src/kernel/schema.ts) that
// other modules may point to with a plain foreign key on `(id)`, only from a module that may depend on the owner, with
// `on delete restrict` (P-10). Every entry needs a reason; the list grows only through review. Only `species`.
export const GLOBAL_REFERENCE_TABLES = {
  species: {
    owner: "catalog",
    reason:
      "The shared species catalog (E-02) has no account_id by design, so the tenant-safe (account_id, id) form cannot exist; Specimens and later wishes point to a species, and the database must refuse unknown species and the deletion of species in use.",
  },
};

// AB-15 (FR-QG-23): the web layer of a path below `packages/web/src/`, the single mapping for the layers app, shared and the
// modules (direction app -> modules -> shared). [prefix, layer], the first match wins; `null` = not checked. A root file of
// `src/` belongs to `app`; a folder named like a registered module is that module, any other folder is not checked.
// The migration is done (step 5): only the target folders are listed, and every finding blocks.
export const WEB_LAYERS = [
  ["app/", "app"],
  ["shared/", "shared"],
  ["styles/", null],
];

// AB-11 (FR-QG-23 step 5): the folder of the kernel per package below `src/`, where it is not named like the kernel
// module. In web the kernel moved into the shared layer (`shared/data`, step 2), so the glossary check looks there.
export const KERNEL_FOLDERS = { web: "shared/data" };
