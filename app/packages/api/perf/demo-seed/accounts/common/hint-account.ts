import type { Pool } from "pg";
import { Caller } from "../../access/caller.ts";
import { ensureKeycloakUser } from "../../access/subjects.ts";
import {
  ensureLocations,
  ensureSpecimens,
  ensureZones,
  setUp,
  speciesByLatin,
  TZ,
  type Ctx,
} from "./shared.ts";

// The hint accounts (issue 2384, US-ONB-07, US-QS-23): keepers in the first days, so that the one-screen gate measures the
// views that show a calm hint. `pickHint` shows a hint only for style few with calm mode off, so Anna (calm mode on), Ben
// and Clara (style many) never show one, and it shows one hint at a time, the first of its fixed order. Both accounts have
// style few, calm mode off (the default), one active plant, no measurement, and one function that a rule stages
// ("Wunschliste") is open, so Heute has `function_unlocked`. They differ in the hint of the plant layer:
// - `test5`: `first_plant_saved` under "Messen" on the overview.
// - `test6`: that hint is dismissed, so `first_measurement` is the due one, first in "Verlauf" (the overview shows none).
// Their own accounts, so that the screens of the three other accounts stay as they are.
export interface HintKeeper {
  username: string;
  name: string;
  lastName: string;
  /** The variable that bypasses Keycloak with the subject of the user (tests). */
  subjectVariable: string;
  /** A plant hint the keeper dismissed already, so the next one of the fixed order is due. */
  dismissed?: string;
}

export const HINT_KEEPERS: readonly HintKeeper[] = [
  {
    username: "test5",
    name: "Hanna",
    lastName: "Einsteigerin",
    subjectVariable: "DEMO_SEED_HINT_SUBJECT",
  },
  {
    username: "test6",
    name: "Henrik",
    lastName: "Anfaenger",
    subjectVariable: "DEMO_SEED_HINT_MEASURE_SUBJECT",
    dismissed: "first_plant_saved",
  },
];

const PLANT = "Monstera deliciosa";
const PLACE = "Fensterbank";
/** The function the keeper opened by tap (DM-ONB-02): staged by the rule `wishes_and_discover`, so it is no `always` or `first_plant` one. */
const OPENED = "wishlist";

/**
 * The Keycloak id (the token's `sub`) of a hint user, created through the admin API when it is missing
 * (`ensureKeycloakUser`). The variable of the keeper (`DEMO_SEED_HINT_SUBJECT`, ...) bypasses Keycloak (tests).
 */
export async function hintSubject(
  keeper: HintKeeper,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const bypass = env[keeper.subjectVariable];
  if (bypass) return bypass;
  return ensureKeycloakUser(
    { username: keeper.username, firstName: keeper.name, lastName: keeper.lastName },
    env,
  );
}

async function seedKeeper(
  pool: Pool,
  keeper: HintKeeper,
  env: NodeJS.ProcessEnv | undefined,
  log: (message: string) => void,
): Promise<void> {
  const sub = await hintSubject(keeper, env);
  const api = new Caller(pool, new Map([[sub, `${keeper.username}@example.test`]]));
  const ctx: Ctx = { api, sub, name: keeper.name, log };
  await setUp(ctx, keeper.name, "few");
  const zones = await ensureZones(ctx);
  const locations = await ensureLocations(ctx, zones, [{ name: PLACE, zone: "Zone 2" }]);
  const species = await speciesByLatin(ctx, [PLANT]);
  await ensureSpecimens(ctx, species, locations, [{ latin: PLANT, location: PLACE }]);
  // "Jetzt freischalten": storing the tap twice keeps the first date, so a second run changes nothing.
  await api.ok(sub, "POST", `/onboarding/unlocks/${OPENED}`, { timeZone: TZ });
  if (keeper.dismissed)
    await api.ok(sub, "PUT", `/onboarding/hints/${keeper.dismissed}`, {
      state: "dismissed",
      timeZone: TZ,
    });
  log(`Hint account ${keeper.username}: style few, one plant, no measurement, "${OPENED}" opened.`);
}

/** Adds the hint accounts, their one plant and the opened function through the API, as the other demo accounts (idempotent). Needs the catalog. */
export async function seedHintAccounts(
  pool: Pool,
  opt: { env?: NodeJS.ProcessEnv; log?: (message: string) => void } = {},
): Promise<void> {
  for (const keeper of HINT_KEEPERS)
    await seedKeeper(pool, keeper, opt.env, opt.log ?? (() => undefined));
}
