import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openEnsuredOwnerPool, openFixturePool, withAccount } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-WUN-01: candidates sorted by the space need of the target light zone through the API (real PostgreSQL).
let pool: Pool;
let admin: Pool; // superuser fixture pool: setup, cleanup and cross-tenant observation (QG-D1)
const run = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
const subA = `wun1-${randomUUID()}`;
const subB = `wun1-${randomUUID()}`;
const subC = `wun1-${randomUUID()}`;
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
let app: ReturnType<typeof createApp>;
type Response = { status: number; body: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function call(
  sub: string | null,
  method: string,
  path: string,
  body?: unknown,
  key: string | null = randomUUID(),
): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sub) headers["authorization"] = `Bearer valid:${sub}`;
  if (key && method !== "GET") headers["idempotency-key"] = key;
  const res = await app.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

type Candidate = {
  name: string;
  title: string;
  stock: number | null;
  zoneText: string;
  zone: { id: string; name: string } | null;
  priority: { kind: string; text: string };
  image: { url: string; source: string } | null;
};
const candidates = (sub: string | null) => call(sub, "GET", "/wishes/candidates");
const names = async (sub: string) =>
  ((await candidates(sub)).body["candidates"] as Candidate[]).map((c) => c.name);
const wish = (sub: string | null, input: Record<string, unknown>, key?: string | null) =>
  call(sub, "POST", "/wishes", input, key);

const newSpecies = async (sub: string, name: string) =>
  (
    await call(sub, "POST", "/species", {
      latinName: name,
      germanName: name,
      difficulty: 2,
      standardLevel: 2,
      lightDemandLux: 15000,
      growthMeasure: "rosette_diameter",
      etiolationSigns: "Rosette streckt sich.",
      successCriteria: "Dichte, flache Rosette.",
    })
  ).body["id"] as string;
const defaults = async (sub: string) => {
  const r = await call(sub, "POST", "/light-zones/defaults", {});
  return Object.fromEntries(
    (r.body["zones"] as { id: string; name: string }[]).map((z) => [z.name, z.id]),
  ) as Record<string, string>;
};
const location = async (sub: string, name: string, lightZoneId: string | undefined) =>
  (
    await call(sub, "POST", "/locations", {
      name,
      kind: "indoor",
      lightZoneId: lightZoneId ?? null,
    })
  ).body["id"] as string;
const specimen = async (sub: string, marker: string, speciesId: string, locationId: string) =>
  (
    await call(sub, "POST", "/specimens", {
      timeZone: "Europe/Berlin",
      speciesId,
      marker,
      locationId,
    })
  ).body["id"] as string;

let zoneA: Record<string, string> = {};
const specimenIds: string[] = [];

beforeAll(async () => {
  pool = await openEnsuredOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool });
  zoneA = await defaults(subA);
  const species = await newSpecies(subA, `Aloe${run} vera`);
  const window = await location(subA, `Fenster ${run}`, zoneA["Lampe 2"]);
  const shelf = await location(subA, `Regal ${run}`, zoneA["Lampe 3"]);
  // Lampe 2: 2 specimens, Lampe 3: 1, Lampe 4: 0.
  for (const [marker, place] of [
    ["a1", window],
    ["a2", window],
    ["a3", shelf],
  ] as const)
    specimenIds.push(await specimen(subA, marker, species, place));
  await defaults(subB);
});
afterAll(async () => {
  const accounts = "select id from account where subject = any($1)";
  const subs = [[subA, subB, subC]];
  await admin.query(`delete from wish where account_id in (${accounts})`, subs);
  await admin.query(`delete from specimen where account_id in (${accounts})`, subs);
  await admin.query(
    `delete from species where id in (select object_id from review_case where account_id in (${accounts}))`,
    subs,
  );
  await admin.query("delete from account where subject = any($1)", subs);
  await pool.end();
  await admin.end();
});

describe("US-WUN-01 sign-in and input", () => {
  it("GET /wishes/candidates and POST /wishes without a token: 401", async () => {
    expect((await candidates(null)).status).toBe(401);
    expect((await wish(null, { name: "x" })).status).toBe(401);
  });

  it("POST /wishes without Idempotency-Key: 400 with a stable code, nothing written", async () => {
    const r = await wish(subA, { name: `Ohne Schlüssel ${run}` }, null);
    expect(r).toMatchObject({ status: 400, body: { error: { code: "idempotency.key_missing" } } });
    expect(await names(subA)).not.toContain(`Ohne Schlüssel ${run}`);
  });

  it("invalid input: 400 input.invalid naming the field", async () => {
    const r = await wish(subA, { name: `Falsch ${run}`, difficulty: 4 });
    expect(r).toMatchObject({
      status: 400,
      body: { error: { code: "input.invalid", details: [{ field: "difficulty" }] } },
    });
  });
});

describe("US-WUN-01 candidates sorted by the stock of the target zone", () => {
  it("lists the open candidates ascending by the specimen count of the target zone, unknown zone last", async () => {
    for (const [name, zone] of [
      [`Aloe ${run}`, "Lampe 2"],
      [`Bryo ${run}`, "Lampe 3"],
      [`Cereus ${run}`, "Lampe 4"],
      [`Dudleya ${run}`, undefined],
    ] as const) {
      const r = await wish(subA, {
        name,
        german: `${name} deutsch`,
        difficulty: 2,
        reasoning: "Passt in die Lücke.",
        ...(zone ? { targetZoneId: zoneA[zone] } : {}),
      });
      expect(r.status).toBe(201);
    }
    const r = await candidates(subA);
    expect(r.status).toBe(200);
    const list = r.body["candidates"] as Candidate[];
    expect(list.map((c) => [c.name, c.stock])).toEqual([
      [`Cereus ${run}`, 0],
      [`Bryo ${run}`, 1],
      [`Aloe ${run}`, 2],
      [`Dudleya ${run}`, null],
    ]);
    expect(list[0]).toMatchObject({
      title: `Cereus ${run} deutsch (Cereus ${run})`,
      zoneText: "Lampe 4 — 0 Pflanzen",
      priority: { kind: "thinnest" },
    });
    expect(list[3]).toMatchObject({ zone: null, priority: { kind: "zone_unknown" } });
    expect(r.body["hint"].nextAction).toEqual(expect.any(String));
    expect(
      (r.body["zones"] as { name: string; count: number }[]).map((z) => [z.name, z.count]),
    ).toEqual([
      ["Lampe 2", 2],
      ["Lampe 3", 1],
      ["Lampe 4", 0],
    ]);
  });

  it("an archived specimen no longer counts in the stock (isActive)", async () => {
    const before = (await candidates(subA)).body["zones"] as { name: string; count: number }[];
    expect(before.find((z) => z.name === "Lampe 3")?.count).toBe(1);
    const archived = await call(subA, "POST", `/specimens/${specimenIds[2]}/archive`, {
      timeZone: "Europe/Berlin",
      reason: "eingegangen",
    });
    expect(archived.status).toBe(200);
    const after = (await candidates(subA)).body["candidates"] as Candidate[];
    expect(after.find((c) => c.name === `Bryo ${run}`)?.stock).toBe(0);
  });

  it("without open candidates: 'Keine offenen Kandidaten in der Wunschliste.' and a next action", async () => {
    const r = await candidates(subC);
    expect(r.status).toBe(200);
    expect(r.body["candidates"]).toEqual([]);
    expect(r.body["hint"]).toMatchObject({ text: "Keine offenen Kandidaten in der Wunschliste." });
    expect(r.body["hint"].nextAction).not.toBe("");
  });

  it("a wish that is no longer open leaves the list (FR-WUN-02)", async () => {
    await wish(subA, { name: `Gekauft ${run}`, targetZoneId: zoneA["Lampe 4"] });
    await admin.query("update wish set status = 'bought' where name = $1", [`Gekauft ${run}`]);
    expect(await names(subA)).not.toContain(`Gekauft ${run}`);
  });

  it("a picture is shown with its source", async () => {
    await wish(subA, {
      name: `Bild ${run}`,
      targetZoneId: zoneA["Lampe 4"],
      imageUrl: "https://example.test/bild.jpg",
      imageSource: "Wikimedia Commons",
    });
    const list = (await candidates(subA)).body["candidates"] as Candidate[];
    expect(list.find((c) => c.name === `Bild ${run}`)?.image).toEqual({
      url: "https://example.test/bild.jpg",
      source: "Wikimedia Commons",
    });
  });
});

describe("US-WUN-01 writing a wish (P-03)", () => {
  it("the same Idempotency-Key writes once and answers the same", async () => {
    const key = randomUUID();
    const first = await wish(subA, { name: `Einmal ${run}` }, key);
    const again = await wish(subA, { name: `Einmal ${run}` }, key);
    expect(first.status).toBe(201);
    expect(again.body).toEqual(first.body);
    expect((await names(subA)).filter((n) => n === `Einmal ${run}`)).toHaveLength(1);
  });

  it("a duplicate name is refused: 409 wish.name_taken, also in another letter case (FR-WUN-06)", async () => {
    const r = await wish(subA, { name: `ALOE ${run}` });
    expect(r).toMatchObject({ status: 409, body: { error: { code: "wish.name_taken" } } });
  });
});

describe("US-WUN-01 names are unique after folding diacritics (FR-WUN-06)", () => {
  it("US-WUN-01 a name that differs only in diacritics or composition is refused with 409 wish.name_taken", async () => {
    const first = await wish(subA, { name: `Café ${run}` });
    expect(first.status).toBe(201);
    for (const name of [`Cafe ${run}`, `CAFÉ ${run}`, `Cafe\u0301 ${run}`]) {
      const r = await wish(subA, { name });
      expect(r).toMatchObject({ status: 409, body: { error: { code: "wish.name_taken" } } });
    }
  });
});

describe("US-WUN-01 tenant isolation and privacy (P-04, P-05)", () => {
  it("another account sees none of my wishes and its stock does not rank mine", async () => {
    expect(await names(subB)).toEqual([]);
    const own = (await candidates(subB)).body["zones"] as { count: number }[];
    expect(own.map((z) => z.count)).toEqual([0, 0, 0]);
  });

  it("the same name in another account is no duplicate; each account sees its own wish only", async () => {
    const r = await wish(subB, { name: `Aloe ${run}` });
    expect(r.status).toBe(201);
    expect(await names(subB)).toEqual([`Aloe ${run}`]);
    expect(await names(subA)).toContain(`Aloe ${run}`);
    expect(await names(subA)).not.toContain("Bens");
  });

  it("a target zone of another account looks unknown: 404 light_zone.not_found, nothing written", async () => {
    const r = await wish(subB, { name: `Fremdzone ${run}`, targetZoneId: zoneA["Lampe 2"] });
    expect(r).toMatchObject({ status: 404, body: { error: { code: "light_zone.not_found" } } });
    expect(await names(subB)).not.toContain(`Fremdzone ${run}`);
  });
});

describe("US-WUN-01 a zone a wish points to cannot be deleted unnoticed (P-10)", () => {
  it("DELETE /light-zones/:id answers 409 light_zone.in_use and names the wish", async () => {
    const r = await call(subA, "DELETE", `/light-zones/${zoneA["Lampe 4"]}`);
    expect(r).toMatchObject({ status: 409, body: { error: { code: "light_zone.in_use" } } });
    expect(JSON.stringify(r.body)).toContain(`Cereus ${run}`);
    expect((await call(subA, "GET", "/light-zones")).body["zones"]).toHaveLength(4);
  });
});

describe("US-WUN-03 record a purchase through the API", () => {
  const buy = (sub: string | null, id: string, key?: string | null) =>
    call(sub, "POST", `/wishes/${id}/buy`, undefined, key);
  const bought = (sub: string | null) => call(sub, "GET", "/wishes/bought");
  const created = async (sub: string, name: string) => {
    const r = await wish(sub, { name, german: `${name} deutsch` });
    expect(r.status).toBe(201);
    return r.body["wish"].id as string;
  };

  it("US-WUN-03 without a token: 401; without Idempotency-Key: 400, nothing bought", async () => {
    const id = await created(subA, `Schlüssellos ${run}`);
    expect((await buy(null, id)).status).toBe(401);
    expect((await bought(null)).status).toBe(401);
    expect(await buy(subA, id, null)).toMatchObject({
      status: 400,
      body: { error: { code: "idempotency.key_missing" } },
    });
    expect(await names(subA)).toContain(`Schlüssellos ${run}`);
  });

  it("US-WUN-03 'Bought' answers with the bought wish and what comes next, hides it and keeps it in the history", async () => {
    const id = await created(subA, `Kauf ${run}`);
    const r = await buy(subA, id);
    expect(r).toMatchObject({
      status: 200,
      body: { changed: true, wish: { id, status: "bought" } },
    });
    expect(r.body["hint"].text).toContain(`Kauf ${run} deutsch (Kauf ${run})`);
    expect(r.body["hint"].nextAction).toContain("Exemplar");
    expect(await names(subA)).not.toContain(`Kauf ${run}`);
    const history = await bought(subA);
    expect(history.status).toBe(200);
    expect(history.body["bought"]).toContainEqual({
      id,
      name: `Kauf ${run}`,
      title: `Kauf ${run} deutsch (Kauf ${run})`,
      specimenId: null,
    });
  });

  it("US-WUN-03 buying again: 200 with changed false (idempotent); the same key replays the first answer", async () => {
    const id = await created(subA, `Nochmal ${run}`);
    const key = randomUUID();
    const first = await buy(subA, id, key);
    expect(await buy(subA, id, key)).toEqual(first);
    expect(await buy(subA, id)).toMatchObject({ status: 200, body: { changed: false } });
  });

  it("US-WUN-03 a discarded wish: 409 wish.not_open; an unknown or malformed id: 404 / 400", async () => {
    const id = await created(subA, `Verworfen ${run}`);
    await admin.query("update wish set status = 'discarded' where id = $1", [id]);
    expect(await buy(subA, id)).toMatchObject({
      status: 409,
      body: { error: { code: "wish.not_open" } },
    });
    expect(await buy(subA, randomUUID())).toMatchObject({
      status: 404,
      body: { error: { code: "wish.not_found" } },
    });
    expect((await buy(subA, "kein-id")).status).toBe(400);
  });

  it("US-WUN-03 a wish of another account: 404 wish.not_found, it stays open and out of my history (P-04)", async () => {
    const id = await created(subB, `Bens Kauf ${run}`);
    expect(await buy(subA, id)).toMatchObject({
      status: 404,
      body: { error: { code: "wish.not_found" } },
    });
    expect(await names(subB)).toContain(`Bens Kauf ${run}`);
    await buy(subB, id);
    const mine = (await bought(subA)).body["bought"] as { id: string }[];
    expect(mine.map((w) => w.id)).not.toContain(id);
    expect(((await bought(subB)).body["bought"] as { id: string }[]).map((w) => w.id)).toContain(
      id,
    );
  });
});

describe("US-WUN-05 from purchase to plant through the API", () => {
  const post = (
    sub: string | null,
    id: string,
    action: string,
    body?: unknown,
    key?: string | null,
  ) => call(sub, "POST", `/wishes/${id}/${action}`, body, key);
  const created = async (sub: string, name: string, buy = false) => {
    const r = await wish(sub, { name });
    const id = r.body["wish"].id as string;
    if (buy) await post(sub, id, "buy");
    return id;
  };
  let counter = 0;
  const subSpecies = (sub: string) =>
    newSpecies(
      sub,
      `Wun${run} ${"abcdefghij"[counter % 10]}${"klmnopqrst"[Math.floor(counter++ / 10) % 10]}`,
    );
  // A specimen of its own species, without a location (it is not needed here).
  const mySpecimen = async (sub: string, marker: string) => {
    const r = await call(sub, "POST", "/specimens", {
      timeZone: "Europe/Berlin",
      speciesId: await subSpecies(sub),
      marker,
    });
    return r.body["id"] as string;
  };

  it("US-WUN-05 a bought wish is linked to a specimen; the history shows the link", async () => {
    const id = await created(subA, `Gelinkt ${run}`, true);
    const specimenId = await mySpecimen(subA, `l1${run}`);
    const r = await post(subA, id, "specimen", { specimenId });
    expect(r).toMatchObject({ status: 200, body: { changed: true, wish: { id, specimenId } } });
    const history = (await call(subA, "GET", "/wishes/bought")).body["bought"] as {
      id: string;
      specimenId: string | null;
    }[];
    expect(history.find((w) => w.id === id)?.specimenId).toBe(specimenId);
  });

  it("US-WUN-05 linking needs sign-in and an Idempotency-Key; the same key replays; again changes nothing", async () => {
    const id = await created(subA, `Schlüssel ${run}`, true);
    const specimenId = await mySpecimen(subA, `l2${run}`);
    expect((await post(null, id, "specimen", { specimenId })).status).toBe(401);
    expect(await post(subA, id, "specimen", { specimenId }, null)).toMatchObject({
      status: 400,
      body: { error: { code: "idempotency.key_missing" } },
    });
    const key = randomUUID();
    const first = await post(subA, id, "specimen", { specimenId }, key);
    expect(await post(subA, id, "specimen", { specimenId }, key)).toEqual(first);
    expect(await post(subA, id, "specimen", { specimenId })).toMatchObject({
      status: 200,
      body: { changed: false },
    });
  });

  it("US-WUN-05 refusals: open wish 409 wish.not_bought, other specimen 409 wish.already_linked, bad input 400", async () => {
    const open = await created(subA, `Offen ${run}`);
    const id = await created(subA, `Zwei ${run}`, true);
    const one = await mySpecimen(subA, `l3${run}`);
    const two = await mySpecimen(subA, `l4${run}`);
    expect(await post(subA, open, "specimen", { specimenId: one })).toMatchObject({
      status: 409,
      body: { error: { code: "wish.not_bought" } },
    });
    await post(subA, id, "specimen", { specimenId: one });
    expect(await post(subA, id, "specimen", { specimenId: two })).toMatchObject({
      status: 409,
      body: { error: { code: "wish.already_linked" } },
    });
    expect((await post(subA, id, "specimen", { specimenId: "x" })).status).toBe(400);
    expect((await post(subA, id, "specimen", {})).status).toBe(400);
  });

  it("US-WUN-05 a wish or specimen of another account looks unknown: 404 (P-04)", async () => {
    const mine = await created(subA, `Meins ${run}`, true);
    const theirs = await created(subB, `Seins ${run}`, true);
    const bensSpecimen = await mySpecimen(subB, `l5${run}`);
    expect(await post(subA, mine, "specimen", { specimenId: bensSpecimen })).toMatchObject({
      status: 404,
      body: { error: { code: "specimen.not_found" } },
    });
    expect(await post(subA, theirs, "specimen", { specimenId: bensSpecimen })).toMatchObject({
      status: 404,
      body: { error: { code: "wish.not_found" } },
    });
  });

  it("US-WUN-05 'Discarded': the wish leaves the list but stays readable under discarded", async () => {
    const id = await created(subA, `Verwerfen ${run}`);
    expect((await post(null, id, "discard")).status).toBe(401);
    const r = await post(subA, id, "discard");
    expect(r).toMatchObject({
      status: 200,
      body: { changed: true, wish: { id, status: "discarded" } },
    });
    expect(r.body["hint"].text).toContain("verworfen");
    expect(await names(subA)).not.toContain(`Verwerfen ${run}`);
    const list = await call(subA, "GET", "/wishes/discarded");
    expect(list.body["discarded"]).toContainEqual({
      id,
      name: `Verwerfen ${run}`,
      title: `Verwerfen ${run}`,
    });
    expect(await post(subA, id, "discard")).toMatchObject({
      status: 200,
      body: { changed: false },
    });
    expect((await call(null, "GET", "/wishes/discarded")).status).toBe(401);
  });

  it("US-WUN-05 discarding: a bought wish 409 wish.already_bought; unknown 404; another account 404 and stays open", async () => {
    const bought = await created(subA, `Schon gekauft ${run}`, true);
    expect(await post(subA, bought, "discard")).toMatchObject({
      status: 409,
      body: { error: { code: "wish.already_bought" } },
    });
    expect((await post(subA, randomUUID(), "discard")).status).toBe(404);
    expect((await post(subA, "kein-id", "discard")).status).toBe(400);
    const theirs = await created(subB, `Bens offener ${run}`);
    expect(await post(subA, theirs, "discard")).toMatchObject({
      status: 404,
      body: { error: { code: "wish.not_found" } },
    });
    expect(await names(subB)).toContain(`Bens offener ${run}`);
    expect(
      ((await call(subA, "GET", "/wishes/discarded")).body["discarded"] as { id: string }[]).map(
        (w) => w.id,
      ),
    ).not.toContain(theirs);
  });
});

// FR-WUN-06 / #303: key-less duplicate wishes (as migration 0020 leaves them) are listed, renamed and deleted.
describe("FR-WUN-06 #303 repair of duplicate wish names through the API", () => {
  const rename = (sub: string | null, id: string, input: unknown, key?: string | null) =>
    call(sub, "POST", `/wishes/${id}/rename`, input, key);
  const drop = (sub: string | null, id: string, key?: string | null) =>
    call(sub, "POST", `/wishes/${id}/remove-duplicate`, undefined, key);
  const duplicates = async (sub: string) =>
    ((await candidates(sub)).body["duplicates"] as { id: string; name: string }[]).map((d) => d.id);
  const keyless = async (sub: string, name: string) => {
    const account = (
      await admin.query<{ id: string }>("select id from account where subject = $1", [sub])
    ).rows[0]?.id as string;
    const r = await withAccount(pool, account, (c) =>
      c.query<{ id: string }>(
        "insert into wish (account_id, name, name_key) values ($1, $2, null) returning id",
        [account, name],
      ),
    );
    return (r.rows[0] as { id: string }).id;
  };

  it("FR-WUN-06 #303 the candidate list names the key-less wishes with a hint, and only the own ones (P-04)", async () => {
    const mine = await keyless(subA, `Doppel A ${run}`);
    const theirs = await keyless(subB, `Doppel B ${run}`);
    const l = (await candidates(subA)).body;
    expect(l["duplicates"].map((d: { id: string }) => d.id)).toContain(mine);
    expect(await duplicates(subA)).not.toContain(theirs);
    expect(l["duplicateHint"].text).toContain("heißen gleich");
  });

  it("FR-WUN-06 #303 without a token: 401; without Idempotency-Key: 400, nothing changes", async () => {
    const id = await keyless(subA, `Schutz ${run}`);
    expect((await rename(null, id, { name: "Neu" })).status).toBe(401);
    expect((await drop(null, id)).status).toBe(401);
    expect((await rename(subA, id, { name: "Neu" }, null)).status).toBe(400);
    expect((await drop(subA, id, null)).status).toBe(400);
    expect(await duplicates(subA)).toContain(id);
  });

  it("FR-WUN-06 #303 rename sets the key: 200, the hint disappears; a taken name is 409 wish.name_taken", async () => {
    await wish(subA, { name: `Café ${run}` });
    const id = await keyless(subA, `Cafe ${run}`);
    expect(await rename(subA, id, { name: `CAFE ${run}` })).toMatchObject({
      status: 409,
      body: { error: { code: "wish.name_taken" } },
    });
    const ok = await rename(subA, id, { name: `Cafe au lait ${run}` });
    expect(ok).toMatchObject({ status: 200, body: { wish: { id, name: `Cafe au lait ${run}` } } });
    expect(await duplicates(subA)).not.toContain(id);
    // The key is set now: the same name is taken for a new wish as well.
    expect((await wish(subA, { name: `cafe AU LAIT ${run}` })).status).toBe(409);
  });

  it("FR-WUN-06 #303 delete removes the duplicate and keeps the other wish", async () => {
    await wish(subA, { name: `Fícus ${run}` });
    const id = await keyless(subA, `Ficus ${run}`);
    expect(await drop(subA, id)).toMatchObject({ status: 200, body: { removed: { id } } });
    expect(await duplicates(subA)).not.toContain(id);
    expect(await names(subA)).toContain(`Fícus ${run}`);
  });

  it("FR-WUN-06 #303 a regular wish: 409 wish.not_duplicate; malformed id or name: 400", async () => {
    const r = await wish(subA, { name: `Regulär ${run}` });
    const id = r.body["wish"].id as string;
    expect(await rename(subA, id, { name: "Anders" })).toMatchObject({
      status: 409,
      body: { error: { code: "wish.not_duplicate" } },
    });
    expect(await drop(subA, id)).toMatchObject({
      status: 409,
      body: { error: { code: "wish.not_duplicate" } },
    });
    expect(await names(subA)).toContain(`Regulär ${run}`);
    expect((await rename(subA, "kein-id", { name: "Neu" })).status).toBe(400);
    const dup = await keyless(subA, `Leer ${run}`);
    expect((await rename(subA, dup, { name: "  " })).status).toBe(400);
  });

  it("FR-WUN-06 #303 a wish of another account: 404 wish.not_found, it stays (P-04)", async () => {
    const id = await keyless(subB, `Bens Doppel ${run}`);
    expect(await rename(subA, id, { name: "Meins" })).toMatchObject({
      status: 404,
      body: { error: { code: "wish.not_found" } },
    });
    expect(await drop(subA, id)).toMatchObject({
      status: 404,
      body: { error: { code: "wish.not_found" } },
    });
    expect(await duplicates(subB)).toContain(id);
    expect((await rename(subA, randomUUID(), { name: "x" })).status).toBe(404);
  });
});
