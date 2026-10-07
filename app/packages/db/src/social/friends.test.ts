import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openPool, withAccount } from "../kernel/index.ts";
import { createAccountWithName } from "../fixtures.ts";
import { FriendsPostgres } from "./index.ts";

// US-SOZ-01, DM-SOZ-01, P-04, P-05: friend codes and requests (real PostgreSQL, `make db-up`).
let pool: Pool;
let friends: FriendsPostgres;
const anna = randomUUID();
const ben = randomUUID();
const cleo = randomUUID();
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
let seed = 0;
const newCode = () => {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let n = Date.now() * 1000 + ++seed;
  let out = "";
  for (let i = 0; i < 24; i++) {
    out += alphabet[n % 32];
    n = Math.floor(n / 32) + i * 7 + seed;
  }
  return out;
};
const code = async (owner: string, days = 7) => {
  const c = newCode();
  await friends.createCode(owner, { code: c, expiresAt: inDays(days) });
  return c;
};

beforeAll(async () => {
  pool = openPool();
  await migrate(pool);
  friends = new FriendsPostgres(pool);
  for (const [id, name] of [
    [anna, "Anna"],
    [ben, "Ben"],
    [cleo, null],
  ] as const)
    await createAccountWithName(pool, id, name);
});
afterAll(async () => {
  await pool.query("delete from account where id = any($1)", [[anna, ben, cleo]]);
  await pool.end();
});

describe("US-SOZ-01 friend codes and requests in the database", () => {
  it("US-SOZ-01 stores only the hash of a code and the application role cannot read the table", async () => {
    const c = await code(anna);
    const rows = await pool.query("select code_hash from friend_code where created_by = $1", [
      anna,
    ]);
    expect(rows.rows.map((r) => r.code_hash.toString("hex"))).not.toContain(c);
    await expect(
      withAccount(pool, anna, (client) => client.query("select * from friend_code")),
    ).rejects.toThrow(/permission denied/);
  });

  it("US-SOZ-01 refuses a code of the wrong format or an expiry beyond 8 days", async () => {
    await expect(friends.createCode(anna, { code: "short", expiresAt: inDays(7) })).rejects.toThrow(
      /wrong format/,
    );
    await expect(
      friends.createCode(anna, { code: newCode(), expiresAt: inDays(9) }),
    ).rejects.toThrow(/out of range/);
  });

  it("US-SOZ-01 redeeming creates one request per side with the stored display names", async () => {
    const r = await friends.requestWithCode(ben, await code(anna));
    expect(r).toMatchObject({
      outcome: "requested",
      request: { otherName: "Anna", direction: "sent" },
    });
    expect(await friends.openRequests(anna)).toMatchObject([
      { otherName: "Ben", direction: "received" },
    ]);
    expect(await friends.openRequests(ben)).toMatchObject([
      { otherName: "Anna", direction: "sent" },
    ]);
    const status = await pool.query(
      "select status, since from friendship where account_id = any($1)",
      [[anna, ben]],
    );
    expect(status.rows).toEqual([
      { status: "requested", since: null },
      { status: "requested", since: null },
    ]);
  });

  it("US-SOZ-01 a request is invisible to a third account (P-04)", async () => {
    expect(await friends.openRequests(cleo)).toEqual([]);
  });

  it("US-SOZ-01 a code is single-use; the same account gets its request again, another one is rejected", async () => {
    const c = await code(cleo);
    const first = await friends.requestWithCode(ben, c);
    expect(first.outcome).toBe("requested");
    expect(await friends.requestWithCode(ben, c)).toEqual(first);
    expect(await friends.requestWithCode(anna, c)).toEqual({ outcome: "code_used" });
  });

  it("US-SOZ-01 a missing display name is stored as unknown (P-08)", async () => {
    expect(await friends.openRequests(ben)).toEqual(
      expect.arrayContaining([expect.objectContaining({ otherName: null, direction: "sent" })]),
    );
  });

  it("US-SOZ-01 rejects an expired, an unknown and an own code, and an existing request, without using the code up", async () => {
    const old = await code(anna, 1);
    await pool.query(
      "update friend_code set created_at = now() - interval '2 days', expires_at = now() - interval '1 day' where code_hash = sha256(convert_to($1, 'UTF8'))",
      [old],
    );
    expect(await friends.requestWithCode(cleo, old)).toEqual({ outcome: "code_expired" });
    expect(await friends.requestWithCode(cleo, newCode())).toEqual({ outcome: "unknown_code" });
    const own = await code(anna);
    expect(await friends.requestWithCode(anna, own)).toEqual({ outcome: "own_code" });
    expect(await friends.requestWithCode(ben, own)).toEqual({ outcome: "already_linked" });
    expect(await friends.requestWithCode(cleo, own)).toMatchObject({ outcome: "requested" });
  });

  it("US-SOZ-01 exactly one of several concurrent redemptions of a code wins", async () => {
    const c = await code(anna);
    const accounts = await Promise.all(
      [1, 2, 3].map(async () => {
        const id = randomUUID();
        await withAccount(pool, id, (cl) => cl.query("insert into account (id) values ($1)", [id]));
        return id;
      }),
    );
    try {
      const results = await Promise.all(accounts.map((a) => friends.requestWithCode(a, c)));
      expect(results.filter((r) => r.outcome === "requested")).toHaveLength(1);
      expect(results.filter((r) => r.outcome === "code_used")).toHaveLength(2);
    } finally {
      await pool.query("delete from account where id = any($1)", [accounts]);
    }
  });

  it("US-SOZ-01 after an ended friendship a new request is possible and reuses the rows", async () => {
    const c = await code(cleo);
    await withAccount(pool, anna, (cl) => cl.query("select 1"));
    await pool.query(
      "update friendship set status = 'ended' where account_id = any($1) and other_id = any($1)",
      [[anna, cleo]],
    );
    expect(await friends.requestWithCode(anna, c)).toMatchObject({ outcome: "requested" });
    const rows = await pool.query(
      "select count(*)::int as n from friendship where account_id = any($1) and other_id = any($1)",
      [[anna, cleo]],
    );
    expect(rows.rows[0].n).toBe(2);
  });
});

describe("US-SOZ-02 answer a request in the database", () => {
  const pair = async (seedOwner: string, redeemer: string) => {
    await friends.requestWithCode(redeemer, await code(seedOwner));
    const incoming = (await friends.openRequests(seedOwner)).find(
      (r) => r.direction === "received" && r.status === "requested",
    );
    return incoming?.id as string;
  };
  const makeAccounts = async (n: number) => {
    const ids = Array.from({ length: n }, () => randomUUID());
    for (const id of ids) await createAccountWithName(pool, id, `N-${id.slice(0, 4)}`);
    return ids;
  };

  it("US-SOZ-02 accepting confirms both rows with the same start and lists the friend on both sides", async () => {
    const [x, y] = await makeAccounts(2);
    try {
      const id = await pair(x as string, y as string);
      expect(await friends.answer(x as string, id, true)).toBe("accepted");
      const rows = await pool.query(
        "select status, since from friendship where account_id = any($1) and other_id = any($1)",
        [[x, y]],
      );
      expect(rows.rows.map((r) => r.status)).toEqual(["confirmed", "confirmed"]);
      expect(rows.rows[0].since).toEqual(rows.rows[1].since);
      expect(await friends.friends(x as string)).toMatchObject([{ name: expect.any(String) }]);
      expect(await friends.friends(y as string)).toHaveLength(1);
      expect(await friends.openRequests(x as string)).toEqual([]);
      expect(await friends.answer(x as string, id, true)).toBe("accepted");
      expect(await friends.answer(x as string, id, false)).toBe("not_open");
    } finally {
      await pool.query("delete from account where id = any($1)", [[x, y]]);
    }
  });

  it("US-SOZ-02 declining leaves the receiver nothing and the sender 'declined'; a new code starts over", async () => {
    const [x, y] = await makeAccounts(2);
    try {
      const id = await pair(x as string, y as string);
      expect(await friends.answer(x as string, id, false)).toBe("declined");
      expect(await friends.openRequests(x as string)).toEqual([]);
      expect(await friends.openRequests(y as string)).toMatchObject([{ status: "declined" }]);
      expect(await friends.friends(y as string)).toEqual([]);
      const again = await friends.requestWithCode(y as string, await code(x as string));
      expect(again).toMatchObject({ outcome: "requested" });
      expect(await friends.openRequests(x as string)).toMatchObject([{ status: "requested" }]);
    } finally {
      await pool.query("delete from account where id = any($1)", [[x, y]]);
    }
  });

  it("US-SOZ-02 the sender and a third account cannot answer: not found, nothing changes (P-04)", async () => {
    const [x, y, z] = await makeAccounts(3);
    try {
      const id = await pair(x as string, y as string);
      const sent = (await friends.openRequests(y as string))[0]?.id as string;
      expect(await friends.answer(y as string, sent, true)).toBe("not_found");
      expect(await friends.answer(z as string, id, true)).toBe("not_found");
      expect(await friends.answer(x as string, randomUUID(), true)).toBe("not_found");
      const st = await pool.query(
        "select distinct status from friendship where account_id = any($1)",
        [[x, y]],
      );
      expect(st.rows).toEqual([{ status: "requested" }]);
    } finally {
      await pool.query("delete from account where id = any($1)", [[x, y, z]]);
    }
  });
});

describe("US-SOZ-03 end a friendship in the database", () => {
  it("US-SOZ-03 ending sets both rows to ended, keeps the start, is repeatable and leaks nothing (P-04)", async () => {
    const [x, y, z] = [randomUUID(), randomUUID(), randomUUID()];
    for (const id of [x, y, z]) await createAccountWithName(pool, id, `N-${id.slice(0, 4)}`);
    try {
      await friends.requestWithCode(y, await code(x));
      const request = (await friends.openRequests(x))[0]?.id as string;
      expect(await friends.end(x, request)).toBe("not_found");
      await friends.answer(x, request, true);
      const friendId = (await friends.friends(x))[0]?.id as string;
      expect(await friends.end(z, friendId)).toBe("not_found");
      expect(await friends.end(x, randomUUID())).toBe("not_found");
      expect(await friends.end(x, friendId)).toBe("ended");
      const rows = await pool.query(
        "select status, since is not null as has_since from friendship where account_id = any($1) and other_id = any($1)",
        [[x, y]],
      );
      expect(rows.rows).toEqual([
        { status: "ended", has_since: true },
        { status: "ended", has_since: true },
      ]);
      expect(await friends.friends(y)).toEqual([]);
      expect(await friends.end(x, friendId)).toBe("ended");
      expect(
        await friends.end(
          y,
          (await pool.query("select id from friendship where account_id = $1", [y])).rows[0].id,
        ),
      ).toBe("ended");
    } finally {
      await pool.query("delete from account where id = any($1)", [[x, y, z]]);
    }
  });
});
