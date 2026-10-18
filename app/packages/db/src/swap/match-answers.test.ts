import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccountWithName } from "../fixtures.ts";
import { migrate, openFixturePool, openOwnerPool } from "../kernel/index.ts";
import { MatchAnswersPostgres } from "./index.ts";

// US-TAU-02, DM-TAU-01, P-04, P-05: the private answers No and Later (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool; // superuser fixture pool: cross-tenant observation and cleanup (#294)
let answers: MatchAnswersPostgres;
const [anna, ben] = [randomUUID(), randomUUID()];
const offerId = randomUUID();
const value = (answer: "no" | "later", extra: Record<string, unknown> = {}) => ({
  offerId,
  answer,
  answeredOn: "2026-10-18",
  speciesLatin: "Aloe vera",
  speciesGerman: "Echte Aloe",
  giverName: "Ben",
  ...extra,
});

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  answers = new MatchAnswersPostgres(pool);
  for (const id of [anna, ben]) await createAccountWithName(pool, id, `N-${id.slice(0, 4)}`);
});
afterAll(async () => {
  await admin.query("delete from account where id = any($1)", [[anna, ben]]);
  await pool.end();
  await admin.end();
});

describe("US-TAU-02 match answers in the database", () => {
  it("US-TAU-02 stores one answer per offer, replaces it and takes it back", async () => {
    await answers.save(anna, value("later"));
    await answers.save(anna, value("no", { answeredOn: "2026-10-19" }));
    expect(await answers.list(anna)).toEqual([{ offerId, answer: "no", answeredOn: "2026-10-19" }]);
    expect(await answers.remove(anna, offerId)).toBe(true);
    expect(await answers.remove(anna, offerId)).toBe(false);
    expect(await answers.list(anna)).toEqual([]);
  });

  it("US-TAU-02 P-05 FR-TAU-02 an answer is private: another account sees none and cannot take it back", async () => {
    await answers.save(anna, value("later"));
    expect(await answers.list(ben)).toEqual([]);
    expect(await answers.remove(ben, offerId)).toBe(false);
    expect(await answers.list(anna)).toHaveLength(1);
    // The same offer answered by the other account is a separate row.
    await answers.save(ben, value("no"));
    expect(await answers.list(anna)).toMatchObject([{ answer: "later" }]);
    expect(await answers.list(ben)).toMatchObject([{ answer: "no" }]);
  });

  it("US-TAU-02 the database refuses an answer other than no or later", async () => {
    await expect(
      admin.query(
        "insert into swap_match_answer (account_id, offer_id, answer, answered_on) values ($1, $2, 'yes', '2026-10-18')",
        [anna, randomUUID()],
      ),
    ).rejects.toThrow();
  });
});
