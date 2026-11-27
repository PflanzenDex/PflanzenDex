import type { Pool } from "pg";
import { Caller } from "../../access/caller.ts";
import { ensureKeycloakUser } from "../../access/subjects.ts";
import { setUp, type Ctx } from "./shared.ts";

// The empty demo account test7 (issue 2500, US-DEV-01): a keeper with no plant, wish or friend, so that the one-screen gate can
// measure the empty states of the Sammlung (plants and species, owner decision 2026-11-23, issue 2431). It is created like the
// hint accounts test5 and test6 (`hint-account.ts`): the realm user through the admin API when it is missing, the profile and
// the style few, and nothing else. Its own account, so that the other demo accounts stay as they are. Both profiles seed it.
export const EMPTY_USER = "test7";
export const EMPTY_NAME = "Lea";
const EMPTY_LAST_NAME = "Leer";

/**
 * The Keycloak id (the token's `sub`) of the empty account. `DEMO_SEED_EMPTY_SUBJECT` bypasses Keycloak (tests); otherwise the
 * user is created through the admin API when it is missing (`ensureKeycloakUser`, `make auth-up` must be running).
 */
export async function emptySubject(env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const bypass = env["DEMO_SEED_EMPTY_SUBJECT"];
  if (bypass) return bypass;
  return ensureKeycloakUser(
    { username: EMPTY_USER, firstName: EMPTY_NAME, lastName: EMPTY_LAST_NAME },
    env,
  );
}

/** Adds the empty account through the API (idempotent): its profile and the style few. It gets no plant, wish or friend. */
export async function seedEmptyAccount(
  pool: Pool,
  opt: { env?: NodeJS.ProcessEnv; log?: (message: string) => void } = {},
): Promise<void> {
  const log = opt.log ?? (() => undefined);
  const sub = await emptySubject(opt.env);
  const api = new Caller(pool, new Map([[sub, `${EMPTY_USER}@example.test`]]));
  const ctx: Ctx = { api, sub, name: EMPTY_NAME, log };
  await setUp(ctx, EMPTY_NAME, "few");
  log(`Empty account ${EMPTY_USER}: style few, no plant, wish or friend (US-DEV-01, issue 2500).`);
}
