import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { migrate, openAdminPool, openPool, testDatabaseUrl } from "./kernel/index.ts";
import { FriendsPostgres } from "./social/index.ts";

/** A scratch database whose tables are owned by a superuser: row-level security does not apply to the owner. */
export interface SuperuserOwnerDatabase {
  /** Pool of the superuser owner on the scratch database; hand it to the adapters under test (they use the app role). */
  readonly pool: Pool;
  /** Drops the scratch database (also when a test failed half way). */
  drop(): Promise<void>;
}

/**
 * "Superuser owner" mode of the db suite (#907). Production-like owners are plain roles, so the suite runs as one
 * (#294); but the cluster user of the Docker image (`make dev`, the compose deployment until the owner role is split)
 * is a superuser, and a `security definer` function runs with the owner's rights and ignores row security there. A
 * function that trusts the row rule instead of naming the account then reads or writes other accounts' rows. Run the
 * behaviour of such a function in this database too and assert the same answer as under the plain owner.
 *
 * Creates and migrates a scratch database next to the suite's databases; the adapters under test still switch to the
 * application role per transaction (`withAccount`), only the function owner differs. Call `drop()` in `afterAll`.
 */
export async function createSuperuserOwnerDatabase(label: string): Promise<SuperuserOwnerDatabase> {
  const name = `su_${label.replace(/[^a-z]/g, "").slice(0, 10)}_${randomUUID()
    .replace(/[0-9-]/g, "")
    .slice(0, 8)}`;
  const admin = openAdminPool();
  await admin.query(`create database ${name}`);
  const url = new URL(testDatabaseUrl());
  url.pathname = `/${name}`;
  const pool = openPool(url.toString());
  pool.on("error", () => undefined);
  try {
    await migrate(pool);
    const me = await pool.query<{ rolsuper: boolean }>(
      "select rolsuper from pg_roles where rolname = current_user",
    );
    if (me.rows[0]?.rolsuper !== true)
      throw new Error("The scratch database is not owned by a superuser");
  } catch (error) {
    await pool.end();
    await admin.query(`drop database if exists ${name} with (force)`);
    await admin.end();
    throw error;
  }
  return {
    pool,
    drop: async () => {
      await pool.end();
      await admin.query(`drop database if exists ${name} with (force)`);
      await admin.end();
    },
  };
}

let codeSeed = 0;
const friendCode = (): string => {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let n = Date.now() * 1000 + ++codeSeed;
  let out = "";
  for (let i = 0; i < 24; i++) {
    out += alphabet[n % 32];
    n = Math.floor(n / 32) + i * 7 + codeSeed;
  }
  return out;
};

/** `a` invites, `b` redeems, `a` confirms: a confirmed friendship in both directions (AB-9: no SQL on `friendship`). */
export async function befriend(pool: Pool, a: string, b: string): Promise<void> {
  const friends = new FriendsPostgres(pool);
  const code = friendCode();
  await friends.createCode(a, { code, expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
  await friends.requestWithCode(b, code);
  const request = (await friends.openRequests(a))[0]; // earlier requests of `a` are answered, only this one is open
  if (!request) throw new Error("The friend request did not arrive");
  await friends.answer(a, request.id, true);
}
