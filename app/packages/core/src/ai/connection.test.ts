import { describe, expect, it } from "vitest";
import { execute, type Operation } from "../kernel";
import { InMemoryIdempotencyStore } from "../kernel/test-helpers";
import { aiAllowAgain, aiConnections, aiRevoke, aiSetRights, authorizeClient } from "./connection";
import { InMemoryConnections } from "./test-helpers";

const now = new Date("2026-10-10T08:00:00Z");
const later = new Date("2026-10-10T09:00:00Z");
const idempotency = new InMemoryIdempotencyStore();
let counter = 0;
const call = (userId: string | null, input: unknown) => ({
  context: { userId, timeZone: "Europe/Berlin" },
  input,
  idempotencyKey: `k${++counter}`,
});
const only = async (connections: InMemoryConnections, userId: string) => {
  const [row] = await aiConnections({ connections }, userId);
  if (!row) throw new Error("no connection");
  return row;
};
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "ok" : r.error?.code);
const client = (
  userId: string,
  scope: string,
  needs: "read" | "drafts" | "write" = "read",
  at = now,
) => ({
  userId,
  clientId: "https://claude.ai/oauth/client",
  clientName: "Claude",
  scope,
  needs,
  now: at,
});

describe("US-KI-07 connect the AI client", () => {
  it("US-KI-07 the first call connects with at most the default right 'create drafts'", async () => {
    const connections = new InMemoryConnections();
    const r = await authorizeClient({ connections }, client("anna", "pflanzen:write"));
    expect(r.ok && r.value.rights).toBe("drafts");
    const list = await aiConnections({ connections }, "anna");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      clientName: "Claude",
      rights: "drafts",
      requestedRights: "write",
    });
  });

  it("US-KI-07 a token with only 'read' connects with 'read'", async () => {
    const connections = new InMemoryConnections();
    const r = await authorizeClient({ connections }, client("anna", "pflanzen:read", "read"));
    expect(r.ok && r.value.connection.rights).toBe("read");
  });

  it("US-KI-07 a token without one of our scopes is refused and nothing is connected", async () => {
    const connections = new InMemoryConnections();
    const r = await authorizeClient({ connections }, client("anna", "openid email"));
    expect(code(r)).toBe("ai.scope_insufficient");
    expect(connections.rows).toHaveLength(0);
  });

  it("US-KI-07 a right that is not enough names the scope to request (step-up) and never allows more silently", async () => {
    const connections = new InMemoryConnections();
    const r = await authorizeClient({ connections }, client("anna", "pflanzen:draft", "write"));
    expect(code(r)).toBe("ai.scope_insufficient");
    expect(!r.ok && r.error.data).toEqual({ scope: "pflanzen:write", needs: "write" });
    // The client asks again with a higher token: still only what the keeper allowed.
    const again = await authorizeClient(
      { connections },
      client("anna", "pflanzen:write", "write", later),
    );
    expect(code(again)).toBe("ai.scope_insufficient");
    const row = await only(connections, "anna");
    expect(row).toMatchObject({ rights: "drafts", requestedRights: "write" });
  });

  it("US-KI-07 the keeper confirms the request in the app, then the higher right works", async () => {
    const connections = new InMemoryConnections();
    await authorizeClient({ connections }, client("anna", "pflanzen:write"));
    const row = await only(connections, "anna");
    const set = aiSetRights({ connections });
    expect(
      code(await execute(set, { idempotency }, call("anna", { id: row.id, rights: "write" }))),
    ).toBe("ok");
    const r = await authorizeClient(
      { connections },
      client("anna", "pflanzen:write", "write", later),
    );
    expect(r.ok && r.value.rights).toBe("write");
    expect((await aiConnections({ connections }, "anna"))[0]?.requestedRights).toBeNull();
  });

  it("US-KI-07 the token can narrow the allowed right but never widen it", async () => {
    const connections = new InMemoryConnections();
    await authorizeClient({ connections }, client("anna", "pflanzen:read"));
    const row = await only(connections, "anna");
    await execute(
      aiSetRights({ connections }),
      { idempotency },
      call("anna", { id: row.id, rights: "write" }),
    );
    const r = await authorizeClient(
      { connections },
      client("anna", "pflanzen:read", "read", later),
    );
    expect(r.ok && r.value.rights).toBe("read");
  });

  it("US-KI-07 the list shows name, rights, connected since and last use", async () => {
    const connections = new InMemoryConnections();
    await authorizeClient({ connections }, client("anna", "pflanzen:draft"));
    await authorizeClient({ connections }, client("anna", "pflanzen:draft", "read", later));
    const row = await only(connections, "anna");
    expect(row).toMatchObject({
      clientName: "Claude",
      rights: "drafts",
      createdAt: now.toISOString(),
      lastUse: later.toISOString(),
      revokedAt: null,
    });
  });
});

describe("US-KI-07 revoke takes effect immediately", () => {
  it("US-KI-07 a revoked connection is rejected on the next call, also with a valid token", async () => {
    const connections = new InMemoryConnections();
    await authorizeClient({ connections }, client("anna", "pflanzen:draft"));
    const row = await only(connections, "anna");
    const revoke = aiRevoke({ connections }, () => later);
    expect(code(await execute(revoke, { idempotency }, call("anna", { id: row.id })))).toBe("ok");
    const r = await authorizeClient(
      { connections },
      client("anna", "pflanzen:write", "read", later),
    );
    expect(code(r)).toBe("ai.connection_revoked");
    expect((await aiConnections({ connections }, "anna"))[0]?.revokedAt).toBe(later.toISOString());
  });

  it("US-KI-07 revoking twice changes nothing and an unknown id is refused", async () => {
    const connections = new InMemoryConnections();
    await authorizeClient({ connections }, client("anna", "pflanzen:draft"));
    const row = await only(connections, "anna");
    const revoke = aiRevoke({ connections }, () => later);
    await execute(revoke, { idempotency }, call("anna", { id: row.id }));
    const second = await execute(revoke, { idempotency }, call("anna", { id: row.id }));
    expect(second.ok && second.value).toEqual({ revoked: false });
    const unknown = await execute(
      revoke,
      { idempotency },
      call("anna", { id: "00000000-0000-4000-8000-0000000000ff" }),
    );
    expect(code(unknown)).toBe("ai.connection_not_found");
  });

  it("US-KI-07 only the keeper's explicit 'allow again' reconnects; it starts with the default right", async () => {
    const connections = new InMemoryConnections();
    await authorizeClient({ connections }, client("anna", "pflanzen:write"));
    const row = await only(connections, "anna");
    await execute(
      aiRevoke({ connections }, () => later),
      { idempotency },
      call("anna", { id: row.id }),
    );
    const again = aiAllowAgain({ connections }, () => later);
    expect(code(await execute(again, { idempotency }, call("anna", { id: row.id })))).toBe("ok");
    const r = await authorizeClient(
      { connections },
      client("anna", "pflanzen:write", "read", later),
    );
    expect(r.ok && r.value.rights).toBe("drafts");
    expect(await aiConnections({ connections }, "anna")).toHaveLength(2);
    // An active connection is not replaced.
    expect(code(await execute(again, { idempotency }, call("anna", { id: row.id })))).toBe(
      "ai.connection_active",
    );
  });

  it("US-KI-07 a connection belongs to exactly one account: a stranger cannot change, revoke or see it (KI-R6)", async () => {
    const connections = new InMemoryConnections();
    await authorizeClient({ connections }, client("anna", "pflanzen:draft"));
    const row = await only(connections, "anna");
    expect(await aiConnections({ connections }, "ben")).toEqual([]);
    const refused = async (op: Operation<unknown, unknown>, input: unknown) =>
      code(await execute(op, { idempotency }, call("ben", input)));
    const write = { id: row.id, rights: "write" };
    expect(await refused(aiSetRights({ connections }) as never, write)).toBe(
      "ai.connection_not_found",
    );
    expect(await refused(aiRevoke({ connections }) as never, { id: row.id })).toBe(
      "ai.connection_not_found",
    );
    expect(await refused(aiAllowAgain({ connections }) as never, { id: row.id })).toBe(
      "ai.connection_not_found",
    );
    expect((await aiConnections({ connections }, "anna"))[0]).toMatchObject({
      rights: "drafts",
      revokedAt: null,
    });
    // Ben's own client with the same client id is a separate connection.
    const b = await authorizeClient({ connections }, client("ben", "pflanzen:read"));
    expect(b.ok && b.value.connection.id).not.toBe(row.id);
  });

  it("US-KI-07 refuses a missing sign-in and bad input", async () => {
    const connections = new InMemoryConnections();
    expect(
      code(
        await execute(
          aiRevoke({ connections }),
          { idempotency },
          call(null, { id: "00000000-0000-4000-8000-0000000000ff" }),
        ),
      ),
    ).toBe("access.not_signed_in");
    expect(
      code(
        await execute(
          aiSetRights({ connections }),
          { idempotency },
          call("anna", { id: "x", rights: "root" }),
        ),
      ),
    ).toBe("input.invalid");
  });
});
