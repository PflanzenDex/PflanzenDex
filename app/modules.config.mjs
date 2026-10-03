// Module register (AB-13): the single source for the module boundary checks (AB-7 to AB-14, FR-QG-19, ADR 0003).
// Read by scripts/check-boundaries.mjs (imports, structure, migrations) and by findeSchemaVerstoesse in db (tables,
// foreign keys). Code that moves into modules only reads this file.
//
// A module folder is `packages/<core|db|api|web>/src/<name>/` with an `index.ts` as its public interface (variant A).
// The rules apply to every folder that carries the name of a module below; without such folders the gate is idle.
// The cut follows ADR 0003 with the owner decisions O-1 (pflege and wachstum merged, medien and jobs live in `kern`)
// and O-2 (foreign keys across modules only tenant-safe as (konto_id, id) on allowed dependencies).
// `dependsOn` is the dependency matrix: `A -> B` may be imported only if B is listed for A. A new edge changes this
// file in the same PR; cycles are always an error (AB-8). `epics` maps epics to modules (report only, QG-T4).

const MODULES = [
  {
    name: "kern",
    epics: ["TE"],
    tables: ["konto", "idempotenz", "schema_migrations", "medium"],
    dependsOn: [],
    ports: ["DatenQuelle", "IdempotenzSpeicher"],
  },
  {
    name: "konto",
    epics: ["ACC"],
    tables: ["kontodaten", "konto_rolle", "einladung"],
    dependsOn: ["kern"],
    ports: [],
  },
  {
    name: "katalog",
    epics: ["BES"],
    tables: ["art", "art_name", "art_version", "pruefvorgang"],
    dependsOn: ["kern"],
    ports: [],
  },
  {
    name: "licht",
    epics: ["LIC"],
    tables: ["lichtzone", "standort"],
    dependsOn: ["kern"],
    ports: ["ZonenNutzung"],
  },
  {
    name: "bestand",
    epics: ["BES"],
    tables: ["exemplar", "pflegeprofil", "exemplar_herkunft"],
    dependsOn: ["kern", "katalog", "licht"],
    ports: ["SollStandortQuelle"],
  },
  {
    name: "monitoring",
    epics: ["MON"],
    tables: ["erinnerung", "giessprotokoll", "sensor", "messreihe", "zustellkanal"],
    dependsOn: ["kern", "bestand"],
    ports: ["AnlassQuelle"],
  },
  {
    name: "pflege",
    epics: ["PHA", "BEH", "WAC"],
    tables: ["behandlung", "messung"],
    dependsOn: ["kern", "katalog", "licht", "bestand", "monitoring"],
    ports: [],
  },
  {
    name: "wunschliste",
    epics: ["WUN"],
    tables: ["wunsch"],
    dependsOn: ["kern", "katalog", "licht", "bestand"],
    ports: [],
  },
  {
    name: "pokedex",
    epics: ["POK"],
    tables: ["taxon", "pokedex_stand"],
    dependsOn: ["kern", "katalog", "bestand"],
    ports: [],
  },
  {
    name: "equipment",
    epics: ["EQU"],
    tables: ["equipment", "vorrat", "empfehlung"],
    dependsOn: ["kern", "licht", "bestand", "wunschliste", "monitoring"],
    ports: [],
  },
  {
    name: "sozial",
    epics: ["SOZ"],
    tables: ["freundschaft", "freigabe", "angebot", "tausch", "ereignis"],
    dependsOn: ["kern", "konto", "katalog", "bestand", "pflege", "pokedex", "monitoring"],
    ports: [],
  },
  {
    name: "entdecken",
    epics: ["ENT"],
    tables: ["vorschlag_entscheidung"],
    dependsOn: ["kern", "katalog", "licht", "bestand", "pflege", "wunschliste", "pokedex"],
    ports: [],
  },
  {
    name: "heute",
    epics: [],
    tables: [],
    dependsOn: ["kern", "licht", "bestand", "pflege", "wunschliste", "monitoring"],
    ports: [],
  },
  {
    name: "ki-zugang",
    epics: ["KI"],
    tables: ["verbindung", "auftrag", "entwurf", "ki_protokoll"],
    dependsOn: ["kern", "konto"],
    ports: [],
  },
];

// The migrations 0001 to 0004 were applied before modules existed and must not be renamed. They name no module in
// the file name; this map assigns them (AB-14). New migrations carry the module in the name and in the first line.
const LEGACY_MIGRATIONS = {
  "0001_mandantengrundlage.sql": ["kern"],
  "0002_betreiber_pruefstatus.sql": ["konto", "katalog"],
  "0003_anmeldung.sql": ["konto"],
  "0004_lichtzonen_standorte.sql": ["licht", "kern"],
};

// Transition (ratchet, may only shrink): folders directly below `packages/<pkg>/src/` that belong to no module yet.
// Any other folder below `src/` that is neither a module nor listed here fails (AB-13). An entry whose folder is gone
// is an error. Empty since the move into modules (#227): all code lives in kern, konto, katalog and licht.
const UNMODULED_FOLDERS = {};

// Module-named folders that exist but do not meet the rules yet; treated like unmoduled folders until fixed, an
// entry that no longer applies is an error (ratchet). Empty: web/licht has its index.ts and is imported via it.
const MODULE_FOLDERS_IN_TRANSITION = {};

const KERN = "kern";

export const MODULE_CONFIG = {
  MODULES,
  KERN,
  LEGACY_MIGRATIONS,
  UNMODULED_FOLDERS,
  MODULE_FOLDERS_IN_TRANSITION,
};
