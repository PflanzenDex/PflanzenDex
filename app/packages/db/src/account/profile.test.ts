import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openPool, withAccount } from "../kernel/index.ts";
import { findOrCreateAccount, ProfilePostgres } from "./index.ts";

let pool: Pool;
let profiles: ProfilePostgres;
const subjects: string[] = [];

const NOTIFICATIONS = {
  phase: true,
  treatment: false,
  measurement: true,
  watering: true,
  swap: true,
  friends: true,
};
const PROFILE = {
  displayName: "Anna",
  timeZone: "Europe/Berlin",
  everythingPrivate: true,
  noRecommendations: true,
  notifications: NOTIFICATIONS,
};

async function newAccount(withData = true): Promise<string> {
  const subject = `test-${randomUUID()}`;
  subjects.push(subject);
  const id = await findOrCreateAccount(pool, subject);
  if (withData)
    await withAccount(pool, id, (c) =>
      c.query("insert into account_data (account_id, email) values ($1, $2)", [
        id,
        `${randomUUID()}@example.test`,
      ]),
    );
  return id;
}

beforeAll(async () => {
  pool = openPool();
  await migrate(pool);
  profiles = new ProfilePostgres(pool);
});
afterAll(async () => {
  await pool.query("delete from account where subject = any($1)", [subjects]);
  await pool.end();
});

describe("US-ACC-02 · profile in the database", () => {
  it("a new account starts without name and time zone, private by default, all notifications on", async () => {
    const id = await newAccount();
    expect(await profiles.find(id)).toEqual({
      displayName: null,
      timeZone: null,
      everythingPrivate: false,
      noRecommendations: false,
      notifications: {},
    });
  });

  it("saves and reads back the whole profile", async () => {
    const id = await newAccount();
    expect(await profiles.update(id, PROFILE)).toEqual(PROFILE);
    expect(await profiles.find(id)).toEqual(PROFILE);
  });

  it("an account without data row has no profile and nothing is written", async () => {
    const id = await newAccount(false);
    expect(await profiles.find(id)).toBeNull();
    expect(await profiles.update(id, PROFILE)).toBeNull();
  });

  it("a null display name keeps the stored one; the other fields are written", async () => {
    const id = await newAccount();
    await profiles.update(id, PROFILE);
    const saved = await profiles.update(id, { ...PROFILE, displayName: null, timeZone: "UTC" });
    expect(saved).toMatchObject({ displayName: "Anna", timeZone: "UTC" });
    expect((await profiles.find(id))?.displayName).toBe("Anna");
  });

  it("two accounts: a null name of account B keeps B's name and never touches A's", async () => {
    const a = await newAccount();
    const b = await newAccount();
    await profiles.update(a, PROFILE);
    await profiles.update(b, { ...PROFILE, displayName: "Ben" });
    await profiles.update(b, { ...PROFILE, displayName: null });
    expect((await profiles.find(b))?.displayName).toBe("Ben");
    expect(await profiles.find(a)).toEqual(PROFILE);
  });

  it("the display name is not unique", async () => {
    const a = await newAccount();
    const b = await newAccount();
    await profiles.update(a, PROFILE);
    expect((await profiles.update(b, PROFILE))?.displayName).toBe("Anna");
  });

  it("the database refuses a time zone that is obviously no IANA name and a non-object switch list", async () => {
    const id = await newAccount();
    await expect(profiles.update(id, { ...PROFILE, timeZone: "+02:00" })).rejects.toThrow(
      /account_data_time_zone_check/,
    );
    await expect(
      withAccount(pool, id, (c) =>
        c.query("update account_data set notification_settings = '[]'::jsonb"),
      ),
    ).rejects.toThrow(/notification_settings_check/);
  });

  it("two accounts: account B neither reads nor changes the profile of account A (P-04)", async () => {
    const a = await newAccount();
    const b = await newAccount();
    await profiles.update(a, PROFILE);

    const seenByB = await profiles.find(b);
    expect(seenByB?.displayName).toBeNull();
    expect(seenByB?.everythingPrivate).toBe(false);

    // B writes its own profile; A stays as it was.
    await profiles.update(b, { ...PROFILE, displayName: "Ben", everythingPrivate: false });
    expect(await profiles.find(a)).toEqual(PROFILE);

    // Even a statement that names A's row directly cannot reach it as B (row rule).
    const touched = await withAccount(pool, b, (c) =>
      c.query("update account_data set display_name = 'x' where account_id = $1", [a]),
    );
    expect(touched.rowCount).toBe(0);
    expect(await profiles.find(a)).toEqual(PROFILE);
  });
});
