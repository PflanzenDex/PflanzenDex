import {
  CSV_IMPORT_KEEPER_SWITCH,
  IMPORT_LIMITS,
  NO_TARGET_LOCATION,
  appError,
  keeperOffOf,
  specimenImport,
  specimenImportPreview,
  speciesLoad,
  type ImportSpeciesSource,
  type TargetLocationSource,
} from "@pflanzendex/core";
import {
  IdempotencyPostgres,
  KeeperSwitchPostgres,
  LocationPostgres,
  SpeciesPostgres,
  SpecimenPostgres,
} from "@pflanzendex/db";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Pool } from "pg";
import { body, errorBody, statusFor, write, type AuthEnv } from "../../kernel";
import { collectionReadSourceFor } from "../ai-reads/read-source";

/** The body of the preview: the file as JSON. JSON escaping at most doubles the characters of a file (quotes, backslashes and line breaks), so a file of the largest allowed size fits; the margin is for the other fields (assumption). */
const PREVIEW_BODY_LIMIT = 2 * IMPORT_LIMITS.bytes + 64 * 1024;
/** The body of the confirmation: up to 500 rows with notes of up to 2000 characters each (starting value, assumption). */
const CONFIRM_BODY_LIMIT = 8 * 1024 * 1024;

export interface ImportOptions {
  /** The clock for "today" (NFR-08); tests pin it. */
  readonly clock?: (() => Date) | undefined;
  /** The target location per species and day, the same source as the creation of a specimen (US-BES-02). */
  readonly targetLocation?: TargetLocationSource | undefined;
}

/**
 * The species a name of the file can mean: the catalog reads of the app's species search, exact names and the search, both
 * visible to the account only (P-04). The same functions the app and the AI interface call (KI-R10, FR-KI-14).
 */
export function importSpeciesFor(pool: Pool): ImportSpeciesSource {
  const reads = collectionReadSourceFor(pool);
  const species = new SpeciesPostgres(pool);
  return {
    exact: (userId, text) => reads.exactSpecies(userId, text),
    search: (userId, text) => reads.searchSpecies(userId, text),
    // The species the keeper chose on the page: the visible read the creation of a specimen uses (P-04); a foreign or
    // unknown ID is no species for this account.
    byId: async (userId, id) => {
      const found = await speciesLoad(species, userId, id);
      return found
        ? {
            id: found.id,
            latinName: found.latinName,
            germanName: found.germanName,
            synonyms: found.synonyms,
          }
        : null;
    },
  };
}

/**
 * The CSV import of plants (US-BES-18, FR-BES-26). `POST /specimens/import/preview` is a read: it answers every row and
 * writes nothing, so it takes no `Idempotency-Key`. `POST /specimens/import` is the one guarded write: it takes the key
 * (`write`) and creates only the rows the keeper confirmed. Both are refused with `onboarding.keeper_off` while the keeper
 * switch "csv_import" is off, like the leaf log (P-12); the rows stay. The paths sit under `/specimens/*`, so the sign-in
 * guard of the collection covers them, and a foreign or unknown location or species is refused as unknown (P-04).
 */
export function importRoutes(pool: Pool, opt: ImportOptions = {}): Hono<AuthEnv> {
  const clock = opt.clock ?? (() => new Date());
  const switches = new KeeperSwitchPostgres(pool);
  const keeperOff = async (userId: string) =>
    keeperOffOf(await switches.list(userId)).has(CSV_IMPORT_KEEPER_SWITCH);
  const specimens = new SpecimenPostgres(pool);
  const locations = new LocationPostgres(pool);
  const species = new SpeciesPostgres(pool);
  const preview = specimenImportPreview({
    specimens,
    locations,
    species: importSpeciesFor(pool),
    keeperOff,
    clock,
  });
  const confirm = specimenImport({
    specimens,
    locations,
    species,
    targetLocation: opt.targetLocation ?? NO_TARGET_LOCATION,
    clock,
    keeperOff,
  });
  const deps = { idempotency: new IdempotencyPostgres(pool) };
  const routes = new Hono<AuthEnv>();

  routes.post(
    "/specimens/import/preview",
    bodyLimit({
      maxSize: PREVIEW_BODY_LIMIT,
      onError: (c) => {
        const failure = appError("import.too_large");
        return c.json(errorBody(failure), statusFor(failure));
      },
    }),
    async (c) => {
      const input = preview.schema(await body(c));
      if (!input.ok) return c.json(errorBody(input.error), statusFor(input.error));
      const r = await preview.run({ userId: c.get("account").id }, input.value);
      return r.ok ? c.json(r.value) : c.json(errorBody(r.error), statusFor(r.error));
    },
  );

  routes.post(
    "/specimens/import",
    bodyLimit({
      maxSize: CONFIRM_BODY_LIMIT,
      // A confirmation that large is not one the client sends: it is refused as an invalid input.
      onError: (c) => {
        const failure = appError("input.invalid");
        return c.json(errorBody(failure), statusFor(failure));
      },
    }),
    async (c) => write(c, deps, confirm, { input: await body(c) }),
  );

  return routes;
}
