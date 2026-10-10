import { randomUUID } from "node:crypto";
import { InMemoryObjectStore } from "@pflanzendex/core";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type AppOptions } from "../app";
import { createSharpProcessor } from "../media";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-KI-07: connect the AI client and manage access (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool;
const subA = `ki-${randomUUID()}`;
const subB = `ki-${randomUUID()}`;
const RESOURCE = "https://pflanzendex.example/mcp";
const CLIENT = "https://claude.ai/oauth/mcp-oauth-client-metadata";
// Web tokens: `valid:<sub>`. AI tokens: `ai:<sub>:<client>:<scope with + for space>`.
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
const aiVerifier: TokenVerifier = async (token) => {
  const [kind, sub, client, scope] = token.split("|");
  return kind === "ai"
    ? {
        sub,
        email: `${sub}@example.test`,
        name: "Test",
        email_verified: true,
        azp: client,
        scope: scope?.replace(/\+/g, " "),
      }
    : null;
};
const photos = new InMemoryObjectStore();
let app: ReturnType<typeof createApp>;
type Response = { status: number; body: Record<string, any>; headers: Headers }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function call(
  token: string | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "idempotency-key": randomUUID(),
  };
  if (token) headers["authorization"] = `Bearer ${token}`;
  const res = await app.request(path, {
    method,
    headers,
    ...(body === undefined || method === "GET" ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: res.status,
    body: (await res.json()) as Record<string, any>, // eslint-disable-line @typescript-eslint/no-explicit-any
    headers: res.headers,
  };
}
const web = (sub: string) => `valid:${sub}`;
const ai = (sub: string, scope: string, client = CLIENT) => `ai|${sub}|${client}|${scope}`;
const list = async (sub: string) =>
  (await call(web(sub), "GET", "/ai/connections")).body["connections"];

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({
    reviewer,
    pool,
    media: { store: photos, processor: createSharpProcessor() },
    ai: { verifier: aiVerifier, resource: RESOURCE, issuer: "https://login.example/realms/p" },
  });
  for (const sub of [subA, subB]) await call(web(sub), "GET", "/account");
});
afterAll(async () => {
  await admin.query(
    "delete from specimen where account_id in (select id from account where subject = any($1))",
    [[subA, subB]],
  );
  await admin.query(
    `delete from species where id in (select object_id from review_case
       where account_id in (select id from account where subject = any($1)))`,
    [[subA, subB]],
  );
  await admin.query("delete from account where subject = any($1)", [[subA, subB]]);
  await pool.end();
  await admin.end();
});

describe("US-KI-07 the AI interface announces its authorization server", () => {
  it("US-KI-07 serves the protected resource metadata (RFC 9728) with the sign-in service and our scopes", async () => {
    const r = await call(null, "GET", "/.well-known/oauth-protected-resource");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      resource: RESOURCE,
      authorization_servers: ["https://login.example/realms/p"],
      scopes_supported: ["pflanzen:read", "pflanzen:draft", "pflanzen:write"],
    });
  });

  it("US-KI-07 answers 401 with the metadata address for a missing token and for a token of the web app", async () => {
    for (const token of [null, web(subA), "garbage"]) {
      const r = await call(token, "GET", "/mcp/session");
      expect(r.status).toBe(401);
      expect(r.headers.get("www-authenticate")).toContain(
        'resource_metadata="https://pflanzendex.example/.well-known/oauth-protected-resource"',
      );
    }
  });

  it("US-KI-07 a token without one of our scopes is refused with the scope to request", async () => {
    const r = await call(ai(subA, "openid"), "GET", "/mcp/session");
    expect(r.status).toBe(403);
    expect(r.body["error"].code).toBe("ai.scope_insufficient");
    expect(r.headers.get("www-authenticate")).toContain('error="insufficient_scope"');
  });
});

describe("US-KI-07 connect and manage", () => {
  it("US-KI-07 the first call connects the client with 'create drafts', the list shows it, the request is visible", async () => {
    expect(await list(subA)).toEqual([]);
    const r = await call(ai(subA, "pflanzen:write"), "GET", "/mcp/session");
    expect(r.body).toMatchObject({ rights: "drafts" });
    const [row] = await list(subA);
    expect(row).toMatchObject({
      clientId: CLIENT,
      clientName: CLIENT,
      rights: "drafts",
      requestedRights: "write",
      revokedAt: null,
    });
    expect(row.lastUse).not.toBeNull();
  });

  it("US-KI-07 the keeper confirms the higher right; a stranger cannot see or change the connection (KI-R6)", async () => {
    const [row] = await list(subA);
    const foreign = await call(web(subB), "PUT", `/ai/connections/${row.id}/rights`, {
      rights: "write",
    });
    expect(foreign.status).toBe(404);
    expect(foreign.body["error"].code).toBe("ai.connection_not_found");
    expect(await list(subB)).toEqual([]);
    const own = await call(web(subA), "PUT", `/ai/connections/${row.id}/rights`, {
      rights: "write",
    });
    expect(own.status).toBe(200);
    expect((await call(ai(subA, "pflanzen:write"), "GET", "/mcp/session")).body["rights"]).toBe(
      "write",
    );
    expect(
      (await call(web(subA), "PUT", `/ai/connections/${row.id}/rights`, { rights: "root" })).status,
    ).toBe(400);
  });

  it("US-KI-07 a connection cannot manage connections: its token is not accepted on the keeper's routes (FR-KI-10)", async () => {
    const r = await call(ai(subA, "pflanzen:write"), "GET", "/ai/connections");
    expect(r.status).toBe(401);
  });

  it("US-KI-07 revoking takes effect at once, stays in the list, and only 'allow again' reconnects", async () => {
    const [row] = await list(subA);
    expect((await call(web(subB), "POST", `/ai/connections/${row.id}/revoke`)).status).toBe(404);
    expect((await call(web(subA), "POST", `/ai/connections/${row.id}/revoke`)).status).toBe(200);
    const denied = await call(ai(subA, "pflanzen:write"), "GET", "/mcp/session");
    expect(denied.status).toBe(401);
    expect(denied.body["error"].code).toBe("ai.connection_revoked");
    expect((await list(subA))[0].revokedAt).not.toBeNull();
    expect((await call(web(subA), "POST", `/ai/connections/${row.id}/allow-again`)).status).toBe(
      201,
    );
    expect((await call(ai(subA, "pflanzen:write"), "GET", "/mcp/session")).body["rights"]).toBe(
      "drafts",
    );
    expect(await list(subA)).toHaveLength(2);
  });

  it("US-KI-07 the same client of another account is a separate connection with its own rights", async () => {
    const r = await call(ai(subB, "pflanzen:read"), "GET", "/mcp/session");
    expect(r.body["rights"]).toBe("read");
    expect(await list(subB)).toHaveLength(1);
  });
});

describe("US-KI-02 daily status through the AI interface", () => {
  const status = (sub: string, scope = "pflanzen:read", zone = "Europe/Berlin") =>
    call(ai(sub, scope), "GET", `/mcp/status?timeZone=${zone}`);

  it("US-KI-02 needs a token of the AI audience, a right and a valid time zone", async () => {
    expect((await call(web(subA), "GET", "/mcp/status?timeZone=Europe/Berlin")).status).toBe(401);
    expect((await status(subA, "openid")).status).toBe(403);
    expect((await status(subA, "pflanzen:read", "Mars/Olympus")).status).toBe(400);
  });

  it("US-KI-02 answers the same list as Today for the connected account and nothing of other accounts", async () => {
    const own = await call(web(subA), "GET", "/today?timeZone=Europe/Berlin");
    const viaAi = await status(subA);
    expect(viaAi.status).toBe(200);
    expect(viaAi.body["items"]).toEqual(own.body["items"]);
    expect(viaAi.body["date"]).toBe(own.body["date"]);
    expect(viaAi.body["dataFields"]).toContain("items[].text");
    const other = await status(subB);
    expect(other.body["items"]).toEqual(
      (await call(web(subB), "GET", "/today?timeZone=Europe/Berlin")).body["items"],
    );
  });

  it("US-KI-02 every successful call shows in the keeper's log, not in anybody else's", async () => {
    const before = (await call(web(subB), "GET", "/ai/log")).body["log"].length;
    await status(subB);
    const mine = (await call(web(subB), "GET", "/ai/log")).body["log"];
    expect(mine).toHaveLength(before + 1);
    expect(mine[0]).toMatchObject({ operation: "status", clientName: CLIENT });
    const logA = (await call(web(subA), "GET", "/ai/log")).body["log"];
    expect(logA.every((e: { id: string }) => e.id !== mine[0].id)).toBe(true);
    expect((await call(ai(subB, "pflanzen:read"), "GET", "/ai/log")).status).toBe(401);
  });

  it("US-KI-02 a revoked connection gets no status any more", async () => {
    const list = (await call(web(subB), "GET", "/ai/connections")).body["connections"];
    await call(web(subB), "POST", `/ai/connections/${list[0].id}/revoke`);
    expect((await status(subB)).body["error"].code).toBe("ai.connection_revoked");
  });
});

describe("US-KI-09 drafts through the AI interface", () => {
  const wish = (name: string) => ({
    type: "wish",
    source: "https://example.test/quelle",
    content: { name },
  });
  const propose = (sub: string, scope: string, payload: unknown) =>
    call(ai(sub, scope), "POST", "/mcp/drafts", payload);
  const drafts = async (sub: string) => (await call(web(sub), "GET", "/ai/drafts")).body["drafts"];
  const name = `Draft ${randomUUID()}`;

  it("US-KI-09 a client with only 'read' cannot deliver; incomplete content stores nothing", async () => {
    expect((await propose(subA, "pflanzen:read", wish(name))).status).toBe(403);
    expect((await propose(subA, "pflanzen:draft", { ...wish(name), content: {} })).status).toBe(
      400,
    );
    expect((await propose(subA, "pflanzen:draft", { ...wish(name), type: "nope" })).status).toBe(
      400,
    );
    expect(await drafts(subA)).toEqual([]);
  });

  it("US-KI-09 US-KI-05 a delivered wish is a draft, not a wish, until the keeper adopts it", async () => {
    const r = await propose(subA, "pflanzen:draft", wish(name));
    expect(r.status).toBe(201);
    expect(JSON.stringify((await call(web(subA), "GET", "/wishes/candidates")).body)).not.toContain(
      name,
    );
    const [d] = await drafts(subA);
    expect(d).toMatchObject({
      type: "wish",
      status: "open",
      source: "https://example.test/quelle",
    });
    expect((await propose(subA, "pflanzen:draft", wish(name))).status).toBe(200);
    expect(await drafts(subA)).toHaveLength(1);
  });

  it("US-KI-09 KI-R6 a stranger sees, adopts and discards nothing", async () => {
    const [d] = await drafts(subA);
    expect(await drafts(subB)).toEqual([]);
    expect((await call(web(subB), "POST", `/ai/drafts/${d.id}/adopt`)).status).toBe(404);
    expect((await call(web(subB), "POST", `/ai/drafts/${d.id}/discard`)).status).toBe(404);
    expect((await call(ai(subA, "pflanzen:write"), "GET", "/ai/drafts")).status).toBe(401);
  });

  it("US-KI-09 adopting creates the wish through the same operation as the form, once", async () => {
    const [d] = await drafts(subA);
    const r = await call(web(subA), "POST", `/ai/drafts/${d.id}/adopt`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: d.id, status: "adopted" });
    expect(JSON.stringify((await call(web(subA), "GET", "/wishes/candidates")).body)).toContain(
      name,
    );
    expect((await call(web(subA), "POST", `/ai/drafts/${d.id}/adopt`)).status).toBe(409);
    expect((await drafts(subA))[0].status).toBe("adopted");
  });

  it("US-KI-09 a refused adoption (duplicate name) leaves the draft open; discard keeps it viewable", async () => {
    await propose(subA, "pflanzen:draft", wish(name));
    const open = (await drafts(subA)).find((d: { status: string }) => d.status === "open");
    const r = await call(web(subA), "POST", `/ai/drafts/${open.id}/adopt`);
    expect(r.body["error"].code).toBe("wish.name_taken");
    expect((await drafts(subA)).find((d: { id: string }) => d.id === open.id).status).toBe("open");
    expect((await call(web(subA), "POST", `/ai/drafts/${open.id}/discard`)).status).toBe(200);
    expect((await drafts(subA)).find((d: { id: string }) => d.id === open.id).status).toBe(
      "discarded",
    );
  });

  it("US-KI-10 the deliveries show in the log", async () => {
    const log = (await call(web(subA), "GET", "/ai/log")).body["log"];
    expect(log.some((e: { operation: string }) => e.operation === "propose_draft")).toBe(true);
  });
});

describe("US-KI-03 species profile as a draft", () => {
  const tag = randomUUID()
    .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
    .replace(/-/g, "")
    .slice(0, 10);
  const profile = {
    latinName: `Kidraft${tag} test`,
    germanName: `Kientwurf ${tag}`,
    difficulty: 2,
    standardLevel: 3,
    lightDemandLux: 40000,
    growthMeasure: "rosette_diameter",
    etiolationSigns: "Rosette streckt sich.",
    successCriteria: "Dichte, flache Rosette.",
    source: "https://de.wikipedia.org/wiki/Test",
  };
  const send = (content: unknown) =>
    call(ai(subA, "pflanzen:draft"), "POST", "/mcp/drafts", {
      type: "species",
      source: "https://de.wikipedia.org/wiki/Test",
      content,
    });
  const found = async (sub: string) =>
    JSON.stringify(
      (await call(web(sub), "GET", `/species?q=${profile.latinName.split(" ")[0]}`)).body,
    );

  it("US-KI-03 incomplete profiles and statements without a source are not stored", async () => {
    const incomplete = { ...profile, etiolationSigns: undefined };
    const r = await send(incomplete);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toContain("etiolationSigns");
    const unsourced = { ...profile, source: undefined };
    expect(JSON.stringify((await send(unsourced)).body)).toContain("source");
  });

  it("US-KI-03 a complete profile is a draft; adopting creates a proposal like the form, visible only to the keeper", async () => {
    const r = await send(profile);
    expect(r.status).toBe(201);
    expect(await found(subA)).not.toContain(profile.latinName);
    const adopt = await call(web(subA), "POST", `/ai/drafts/${r.body["id"]}/adopt`);
    expect(adopt.status).toBe(200);
    expect(await found(subA)).toContain(profile.latinName);
    expect(await found(subB)).not.toContain(profile.latinName);
  });
});

describe("US-KI-04 photo assessment", () => {
  const tag = randomUUID()
    .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
    .replace(/-/g, "")
    .slice(0, 10);
  const OTHER = "https://other.client/oauth";
  let measurementId = "";
  const assessment = (quality = "etiolated", note: string | null = "Streckt sich.") => ({
    type: "photo_assessment",
    source: "Foto der Messung",
    content: { measurementId, quality, note },
  });
  const photoRequest = (token: string, id = measurementId) =>
    app.request(`/mcp/measurements/${id}/photo`, { headers: { authorization: `Bearer ${token}` } });

  beforeAll(async () => {
    const sp = await call(web(subA), "POST", "/species", {
      latinName: `Kifoto${tag} test`,
      germanName: `Kifoto ${tag}`,
      difficulty: 2,
      standardLevel: 3,
      lightDemandLux: 40000,
      growthMeasure: "rosette_diameter",
      etiolationSigns: "Rosette streckt sich.",
      successCriteria: "Dichte, flache Rosette.",
    });
    const sid = (
      await call(web(subA), "POST", "/specimens", {
        speciesId: sp.body["id"],
        marker: "foto",
        timeZone: "Europe/Berlin",
      })
    ).body["id"];
    const m = await call(web(subA), "POST", `/specimens/${sid}/measurements`, {
      timeZone: "Europe/Berlin",
      value: 12.5,
    });
    measurementId = m.body["id"];
    const account = (await admin.query("select id from account where subject = $1", [subA])).rows[0]
      .id;
    await photos.put(account, "kifoto.jpg", new Uint8Array([1, 2, 3]), "image/jpeg");
    await admin.query("update measurement set photo = 'kifoto.jpg' where id = $1", [measurementId]);
  });

  it("US-KI-04 delivers the photo of the own account to a connected client with the read right, logged", async () => {
    const r = await photoRequest(ai(subA, "pflanzen:read"));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    const log = (await call(web(subA), "GET", "/ai/log")).body["log"];
    expect(log.some((e: { operation: string }) => e.operation === "measurement_photo")).toBe(true);
  });

  it("US-KI-04 a stranger's client gets nothing: the photo looks like a missing one (P-04, KI-R6)", async () => {
    expect((await photoRequest(ai(subB, "pflanzen:read", OTHER))).status).toBe(404);
    expect((await photoRequest(web(subA))).status).toBe(401);
  });

  it("US-KI-04 the client suggests quality and note as a draft; nothing is written before adoption", async () => {
    const r = await call(ai(subA, "pflanzen:draft"), "POST", "/mcp/drafts", assessment());
    expect(r.status).toBe(201);
    const view = async () =>
      (
        await admin.query("select quality, note, rated_by from measurement where id = $1", [
          measurementId,
        ])
      ).rows[0];
    expect(await view()).toMatchObject({ quality: "healthy", rated_by: "keeper" });
    const bad = await call(ai(subA, "pflanzen:draft"), "POST", "/mcp/drafts", assessment("great"));
    expect(bad.status).toBe(400);
    const adopt = await call(web(subA), "POST", `/ai/drafts/${r.body["id"]}/adopt`);
    expect(adopt.status).toBe(200);
    expect(await view()).toMatchObject({
      quality: "etiolated",
      note: "Streckt sich.",
      rated_by: "ai_adopted",
    });
  });

  it("US-KI-04 adopting a draft for a foreign or photoless measurement is refused and writes nothing", async () => {
    const r = await call(
      ai(subB, "pflanzen:draft", `${OTHER}-draft`),
      "POST",
      "/mcp/drafts",
      assessment("healthy", null),
    );
    expect(r.status).toBe(201);
    const adopt = await call(web(subB), "POST", `/ai/drafts/${r.body["id"]}/adopt`);
    expect(adopt.body["error"].code).toBe("measurement.not_found");
    expect(
      (await admin.query("select quality from measurement where id = $1", [measurementId])).rows[0]
        .quality,
    ).toBe("etiolated");
  });
});
