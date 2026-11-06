import type { Pool } from "pg";
import { Caller } from "../../access/caller.ts";
import { keycloakAdmin } from "../../access/subjects.ts";
import { SEED_SPECIES } from "../../../catalog-seed/species-list.ts";
import { ensureSpecimens, setUp, speciesByLatin, type Ctx, type SpecimenDef } from "./shared.ts";

// The display gates' account (issue 1378): one account with more than 100 plants, so that the plants list has a second
// server page (CARD_PAGE_SIZE is 100). Its own account, so that the screens of test, test2 and test3 stay as they are.
// The plants are spread over a dozen species, and every pot gets its marker from the start (DM-BES-03 needs none then).
export const GATE_USER = "test4";
export const GATE_NAME = "Dora";
const GATE_PASSWORD = "testtest12";
const SPECIES = 12;
const PLANTS = 108;

/**
 * The Keycloak id (the token's `sub`) of the gate user. The realm import knows only test, test2 and test3, and a running
 * dev Keycloak does not import again, so the user is created through the admin API when it is missing. Idempotent.
 * `DEMO_SEED_GATE_SUBJECT` bypasses Keycloak (tests).
 */
export async function gateSubject(env: NodeJS.ProcessEnv = process.env): Promise<string> {
  if (env["DEMO_SEED_GATE_SUBJECT"]) return env["DEMO_SEED_GATE_SUBJECT"];
  const { keycloak, headers } = await keycloakAdmin(env);
  const users = `${keycloak}/admin/realms/pflanzendex/users`;
  const find = async () =>
    (await (await fetch(`${users}?username=${GATE_USER}&exact=true`, { headers })).json()) as {
      id: string;
    }[];
  const found = await find();
  if (found[0]) return found[0].id;
  const created = await fetch(users, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      username: GATE_USER,
      email: `${GATE_USER}@example.test`,
      firstName: GATE_NAME,
      lastName: "Sammlerin",
      enabled: true,
      emailVerified: true,
      requiredActions: [],
      credentials: [{ type: "password", value: GATE_PASSWORD, temporary: false }],
    }),
  });
  if (created.status !== 201)
    throw new Error(
      `Keycloak user ${GATE_USER} not created: ${created.status} ${await created.text()}`,
    );
  const after = await find();
  if (!after[0]) throw new Error(`Keycloak user ${GATE_USER} is missing after its creation`);
  return after[0].id;
}

/** Adds the gate account and its plants through the API, as the other demo accounts (idempotent). Needs the catalog. */
export async function seedGateAccount(
  pool: Pool,
  opt: { log?: (message: string) => void } = {},
): Promise<void> {
  const log = opt.log ?? (() => undefined);
  const sub = await gateSubject();
  const api = new Caller(pool, new Map([[sub, `${GATE_USER}@example.test`]]));
  const ctx: Ctx = { api, sub, name: GATE_NAME, log };
  await setUp(ctx, GATE_NAME, "many");
  const latin = SEED_SPECIES.slice(0, SPECIES).map(([name]) => name);
  const species = await speciesByLatin(ctx, latin);
  const defs: SpecimenDef[] = Array.from({ length: PLANTS }, (_, i) => ({
    latin: latin[i % SPECIES] ?? "",
    marker: `Nr. ${Math.floor(i / SPECIES) + 1}`,
  }));
  const plants = await ensureSpecimens(ctx, species, new Map(), defs);
  log(`Gate account ${GATE_USER}: ${plants.size} plants (more than one server page).`);
}
