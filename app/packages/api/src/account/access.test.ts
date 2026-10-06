import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openEnsuredOwnerPool, openFixturePool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../app";

// US-ACC-05 over HTTP with real PostgreSQL (`make db-up`). The mode "invitation only" is forced per app instance
// (`invitationOnly`), never switched in the shared database: other test files sign in new subjects in parallel.
let pool: Pool;
let admin: Pool; // superuser fixture pool: setup, cleanup and cross-tenant observation (QG-D1)
const [subOperator, subKeeper, subReviewer] = ["operator", "keeper", "reviewer"].map(
  (n) => `acc05-${n}-${randomUUID()}`,
) as [string, string, string];
const fresh = () => `acc05-new-${randomUUID()}`;
const extra: string[] = [];
const verifier: NonNullable<AppOptions["reviewer"]> = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
type Reply = { status: number; body: Record<string, any>; headers?: Headers }; // eslint-disable-line @typescript-eslint/no-explicit-any
let open: ReturnType<typeof createApp>;
let closed: ReturnType<typeof createApp>;

async function call(
  app: ReturnType<typeof createApp>,
  sub: string | null,
  method: string,
  path: string,
  body?: unknown,
  key: string = randomUUID(),
): Promise<Reply> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "idempotency-key": key,
  };
  if (sub) headers["authorization"] = `Bearer valid:${sub}`;
  const res = await app.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Reply["body"], headers: res.headers };
}
const newCode = async (days?: number) => {
  const r = await call(
    open,
    subOperator,
    "POST",
    "/operator/invitations",
    days ? { validForDays: days } : {},
  );
  if (r.status !== 201) throw new Error(JSON.stringify(r.body));
  return r.body["code"] as string;
};

const clearCost = () =>
  admin.query("update operator_cost set amount_cents = null, currency = null, month = null");

beforeAll(async () => {
  pool = await openEnsuredOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  await clearCost();
  open = createApp({ reviewer: verifier, pool });
  closed = createApp({ reviewer: verifier, pool, invitationOnly: true });
  for (const sub of [subOperator, subKeeper, subReviewer]) await call(open, sub, "GET", "/account");
  for (const [sub, role] of [
    [subOperator, "operator"],
    [subReviewer, "reviewer"],
  ] as const)
    await admin.query(
      "insert into account_role (account, role) select id, $2 from account where subject = $1",
      [sub, role],
    );
});
afterAll(async () => {
  await clearCost();
  await admin.query(
    "delete from invitation where created_by in (select id from account where subject = any($1))",
    [[subOperator]],
  );
  await admin.query("delete from account where subject = any($1)", [
    [subOperator, subKeeper, subReviewer, ...extra],
  ]);
  await pool.end();
  await admin.end();
});

describe("US-ACC-05 · registration only with a valid invitation code", () => {
  it("US-ACC-05 a new subject gets 403 invitation.required, and no account is created", async () => {
    const sub = fresh();
    extra.push(sub);
    const r = await call(closed, sub, "GET", "/account");
    expect(r.status).toBe(403);
    expect(r.body["error"]).toMatchObject({ code: "invitation.required" });
    expect(typeof r.body["error"]["text"]).toBe("string");
    const n = await admin.query("select count(*)::int as n from account where subject = $1", [sub]);
    expect(n.rows[0].n).toBe(0);
  });

  it("US-ACC-05 every other protected path says the same for a subject without account", async () => {
    const sub = fresh();
    extra.push(sub);
    for (const path of ["/species", "/account/profile", "/review"]) {
      const r = await call(closed, sub, "GET", path);
      expect([path, r.status, r.body["error"].code]).toEqual([path, 403, "invitation.required"]);
    }
  });

  it("US-ACC-05 an existing account signs in as before while the mode is on", async () => {
    expect((await call(closed, subKeeper, "GET", "/account")).status).toBe(200);
  });

  it("US-ACC-05 a valid code registers the subject; afterwards sign-in works and the code is used up", async () => {
    const code = await newCode();
    const sub = fresh();
    extra.push(sub);
    const done = await call(closed, sub, "POST", "/registration/invitation", { code });
    expect(done).toMatchObject({ status: 200, body: { registered: true } });
    expect((await call(closed, sub, "GET", "/account")).status).toBe(200);
    const other = fresh();
    extra.push(other);
    const again = await call(closed, other, "POST", "/registration/invitation", { code });
    expect(again.status).toBe(403);
    expect(again.body["error"].code).toBe("invitation.invalid");
    expect((await call(closed, other, "GET", "/account")).status).toBe(403);
  });

  it("US-ACC-05 unknown, used and malformed codes are answered identically (no oracle)", async () => {
    const used = await newCode();
    const first = fresh();
    extra.push(first);
    await call(closed, first, "POST", "/registration/invitation", { code: used });
    const sub = fresh();
    extra.push(sub);
    const answers = [];
    for (const code of [used, "AAAA-AAAA-AAAA-AAAA-AAAA-AAAA", "nonsense", "", 42, null]) {
      const r = await call(closed, sub, "POST", "/registration/invitation", { code });
      answers.push(JSON.stringify([r.status, r.body]));
    }
    expect(new Set(answers).size).toBe(1);
    expect(answers[0]).toContain("invitation.invalid");
  });

  it("US-ACC-05 an expired code is answered like an unknown one", async () => {
    const code = (await newCode()).replaceAll("-", "");
    await admin.query(
      "update invitation set created_at = now() - interval '2 days', expires_at = now() - interval '1 day' where code_hash = sha256(convert_to($1, 'UTF8'))",
      [code],
    );
    const sub = fresh();
    extra.push(sub);
    const r = await call(closed, sub, "POST", "/registration/invitation", { code });
    expect([r.status, r.body["error"].code]).toEqual([403, "invitation.invalid"]);
  });

  it("US-ACC-05 registering needs a signed-in identity (token), not an account", async () => {
    expect(
      (await call(closed, null, "POST", "/registration/invitation", { code: "x" })).status,
    ).toBe(401);
  });

  it("US-ACC-05 the same call twice with an existing account uses up no second code", async () => {
    const [a, b] = [await newCode(), await newCode()];
    const sub = fresh();
    extra.push(sub);
    expect(
      (await call(closed, sub, "POST", "/registration/invitation", { code: a })).body["registered"],
    ).toBe(true);
    expect(
      (await call(closed, sub, "POST", "/registration/invitation", { code: b })).body["registered"],
    ).toBe(false);
    const third = fresh();
    extra.push(third);
    expect(
      (await call(closed, third, "POST", "/registration/invitation", { code: b })).status,
    ).toBe(200);
  });
});

describe("US-ACC-05 · the operator area (role checked in the operation and in the database)", () => {
  it("US-ACC-05 GET /account tells only the caller whether they are the operator", async () => {
    expect((await call(open, subOperator, "GET", "/account")).body["operator"]).toBe(true);
    expect((await call(open, subReviewer, "GET", "/account")).body["operator"]).toBe(false);
    expect((await call(open, subKeeper, "GET", "/account")).body["operator"]).toBe(false);
  });

  it.each([
    ["GET", "/operator/overview"],
    ["PUT", "/operator/registration"],
    ["POST", "/operator/invitations"],
  ])("US-ACC-05 %s %s without token: 401", async (method, path) => {
    expect((await call(open, null, method, path, method === "GET" ? undefined : {})).status).toBe(
      401,
    );
  });

  it.each([
    ["GET", "/operator/overview", undefined],
    ["PUT", "/operator/registration", { invitationOnly: false }],
    ["POST", "/operator/invitations", {}],
  ])(
    "US-ACC-05 %s %s: a plant keeper and a reviewer get 403 access.denied",
    async (method, path, body) => {
      for (const sub of [subKeeper, subReviewer]) {
        const r = await call(open, sub, method, path, body);
        expect([sub === subKeeper, r.status, r.body["error"].code]).toEqual([
          sub === subKeeper,
          403,
          "access.denied",
        ]);
      }
    },
  );

  it("US-ACC-05 the operator creates a code that is shown once, and lists invitations without codes", async () => {
    const created = await call(open, subOperator, "POST", "/operator/invitations", {
      validForDays: 3,
    });
    expect(created.status).toBe(201);
    expect(created.body["code"]).toHaveLength(29);
    const ms = Date.parse(created.body["expiresAt"]) - Date.now();
    expect(ms).toBeGreaterThan(2.9 * 86_400_000);
    expect(ms).toBeLessThan(3.1 * 86_400_000);
    const overview = await call(open, subOperator, "GET", "/operator/overview");
    expect(overview.status).toBe(200);
    expect(JSON.stringify(overview.body)).not.toContain(created.body["code"].replaceAll("-", ""));
    expect(
      overview.body["invitations"].some((i: { id: string }) => i.id === created.body["id"]),
    ).toBe(true);
  });

  it("US-ACC-05 the idempotency table never holds the plain code; a repeat with the same key creates another code", async () => {
    const key = randomUUID();
    const a = await call(open, subOperator, "POST", "/operator/invitations", {}, key);
    const b = await call(open, subOperator, "POST", "/operator/invitations", {}, key);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(b.body["code"]).not.toBe(a.body["code"]);
    for (const code of [a.body["code"], b.body["code"]] as string[]) {
      const leaked = await admin.query(
        "select count(*)::int as n from idempotency where result::text ilike any($1) or fingerprint ilike any($1)",
        [[`%${code}%`, `%${code.replaceAll("-", "")}%`]],
      );
      expect(leaked.rows[0].n).toBe(0);
    }
    const kept = await admin.query(
      "select count(*)::int as n from idempotency where operation = 'invitation.create' and key = $1",
      [key],
    );
    expect(kept.rows[0].n).toBe(0);
    // both codes work, once each
    for (const code of [a.body["code"], b.body["code"]] as string[]) {
      const sub = fresh();
      extra.push(sub);
      expect((await call(closed, sub, "POST", "/registration/invitation", { code })).status).toBe(
        200,
      );
    }
  });

  it("US-ACC-05 refuses a validity outside 1 to 30 days with input.invalid", async () => {
    const r = await call(open, subOperator, "POST", "/operator/invitations", { validForDays: 99 });
    expect([r.status, r.body["error"].code]).toEqual([400, "input.invalid"]);
  });

  it("US-ACC-05 the overview: accounts, active users, cost per user unknown without a figure, no content", async () => {
    const r = await call(open, subOperator, "GET", "/operator/overview");
    expect(r.body).toMatchObject({
      cost: null,
      costPerUser: { known: false, reason: "no_figure" },
      activeWindowDays: 30,
      invitationOnly: false,
    });
    expect(r.body["accounts"]).toBeGreaterThanOrEqual(3);
    expect(r.body["activeAccounts"]).toBeGreaterThanOrEqual(3);
    expect(Object.keys(r.body).sort()).toEqual(
      [
        "accounts",
        "activeAccounts",
        "activeWindowDays",
        "cost",
        "costPerUser",
        "invitationOnly",
        "invitations",
      ].sort(),
    );
    const text = JSON.stringify(r.body);
    for (const sub of [subOperator, subKeeper, subReviewer]) expect(text).not.toContain(sub);
    expect(text).not.toContain("@example.test");
  });

  it("US-ACC-05 PUT /operator/cost: the operator enters the monthly figure; the overview divides it by the active users", async () => {
    const figure = { amountCents: 12345, currency: "EUR", month: "2026-09" };
    const put = await call(open, subOperator, "PUT", "/operator/cost", figure);
    expect([put.status, put.body]).toEqual([200, figure]);
    const r = await call(open, subOperator, "GET", "/operator/overview");
    const active = r.body["activeAccounts"] as number;
    expect(active).toBeGreaterThan(0);
    expect(r.body["cost"]).toEqual(figure);
    expect(r.body["costPerUser"]).toEqual({
      known: true,
      amountCents: Math.floor((2 * 12345 + active) / (2 * active)),
      currency: "EUR",
      month: "2026-09",
      source: "manual",
    });
  });

  it.each([
    ["keeper", "keeper"],
    ["reviewer", "reviewer"],
  ])(
    "US-ACC-05 PUT /operator/cost by a %s: 403 access.denied, the figure stays",
    async (_, who) => {
      const sub = who === "keeper" ? subKeeper : subReviewer;
      const before = (await call(open, subOperator, "GET", "/operator/overview")).body["cost"];
      const r = await call(open, sub, "PUT", "/operator/cost", {
        amountCents: 1,
        currency: "EUR",
        month: "2026-09",
      });
      expect([r.status, r.body["error"].code]).toEqual([403, "access.denied"]);
      expect((await call(open, subOperator, "GET", "/operator/overview")).body["cost"]).toEqual(
        before,
      );
    },
  );

  it("US-ACC-05 PUT /operator/cost refuses a future month (400 operator_cost.month_in_future) and bad input (400)", async () => {
    const r = await call(open, subOperator, "PUT", "/operator/cost", {
      amountCents: 1,
      currency: "EUR",
      month: "2999-01",
    });
    expect([r.status, r.body["error"].code]).toEqual([400, "operator_cost.month_in_future"]);
    const bad = await call(open, subOperator, "PUT", "/operator/cost", {
      amountCents: -5,
      currency: "EUR",
      month: "2026-09",
    });
    expect([bad.status, bad.body["error"].code]).toEqual([400, "input.invalid"]);
    expect(await call(open, null, "PUT", "/operator/cost", {})).toMatchObject({ status: 401 });
  });

  it("US-ACC-05 the mode route validates its input", async () => {
    const r = await call(open, subOperator, "PUT", "/operator/registration", {
      invitationOnly: "yes",
    });
    expect([r.status, r.body["error"].code]).toEqual([400, "input.invalid"]);
  });

  it("US-ACC-05 switching to the current value (off) works and is reported back", async () => {
    const r = await call(open, subOperator, "PUT", "/operator/registration", {
      invitationOnly: false,
    });
    expect(r).toMatchObject({ status: 200, body: { invitationOnly: false } });
  });

  it("US-ACC-05 POST /operator/invitations sets Cache-Control: no-store to prevent the code from being cached", async () => {
    const r = await call(open, subOperator, "POST", "/operator/invitations", {});
    expect(r.status).toBe(201);
    expect(r.headers?.get("cache-control")).toBe("no-store");
  });
});
