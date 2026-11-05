import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AccessPostgres, admitAccount, findOrCreateAccount } from "./account/index.ts";
import { CatalogFillPostgres, CatalogLoadPostgres } from "./catalog/index.ts";
import { JobsPostgres } from "./jobs/index.ts";
import { TaxonomyPostgres } from "./pokedex/index.ts";
import { runHandover } from "./swap/handover.ts";
import { migrate, openFixturePool, openOwnerPool, withAccount } from "./kernel/index.ts";

// NFR-12, P-04, P-10, #1314: every path that opens its own transaction survives a failed rollback. Ending the backend is
// real (`pg_terminate_backend`), so the rollback fails the way it fails in production.
let admin: Pool;
let pool: Pool;
let leaked: PoolClient[] = [];
const knownSubject = `rollback-${randomUUID()}`;
const original = new Error("the failure that caused the rollback");
const rollbackRefused = new Error("rollback refused");

type Query = (...args: unknown[]) => Promise<unknown>;

/** Runs `before` ahead of the first statement that matches `trigger`, once per connection taken from the pool. */
function onStatement(
  target: Pool,
  trigger: RegExp,
  before: (client: PoolClient, run: Query) => Promise<void>,
): void {
  const connect = target.connect.bind(target) as () => Promise<PoolClient>;
  target.connect = (async () => {
    const client = await connect();
    const run = client.query.bind(client) as unknown as Query;
    const release = client.release.bind(client);
    leaked.push(client);
    client.release = (error?: boolean | Error) => {
      leaked = leaked.filter((c) => c !== client);
      release(error);
    };
    (client as unknown as { query: Query }).query = async (...args) => {
      if (trigger.test(String(args[0]))) await before(client, run);
      return run(...args);
    };
    return client;
  }) as typeof target.connect;
}

/** Really ends the backend of this connection and waits until the client has noticed. */
async function endBackend(client: PoolClient, run: Query): Promise<void> {
  const ended = new Promise((resolve) => client.once("end", resolve));
  const { rows } = (await run("select pg_backend_pid() as pid")) as { rows: { pid: number }[] };
  await admin.query("select pg_terminate_backend($1)", [rows[0]?.pid]);
  await ended;
}

/** The statement matching `trigger` fails with `original`, and the connection is dead when the rollback runs. */
function dieOn(target: Pool, trigger: RegExp): void {
  onStatement(target, trigger, async (client, run) => {
    await endBackend(client, run);
    throw original;
  });
}

/** The statement matching `trigger` fails with `original`; the connection lives, but its rollback is refused. */
function failThenRefuseRollback(target: Pool, trigger: RegExp): void {
  onStatement(target, /$^/, async () => undefined); // tracks release; the statements fail in the wrapper below
  const wrapped = target.connect.bind(target) as () => Promise<PoolClient>;
  target.connect = (async () => {
    const client = await wrapped();
    const run = client.query.bind(client) as unknown as Query;
    (client as unknown as { query: Query }).query = async (...args) => {
      if (trigger.test(String(args[0]))) throw original;
      if (String(args[0]) === "rollback") throw rollbackRefused;
      return run(...args);
    };
    return client;
  }) as typeof target.connect;
}

async function expectConnectionDropped(target: Pool): Promise<void> {
  expect(leaked, "the connection was never released").toEqual([]);
  expect(target.totalCount, "the connection went back to the pool").toBe(0);
  // `connect` and not `query`: the pool's own `query` calls `connect` with a callback, which the wrappers above do not take.
  const next = await target.connect();
  const answer = await next.query<{ ok: number }>("select 1 as ok");
  next.release();
  expect(answer.rows[0]?.ok).toBe(1);
}

const PATHS: readonly {
  readonly name: string;
  readonly trigger: RegExp;
  readonly run: (p: Pool) => Promise<unknown>;
}[] = [
  {
    name: "withAccount",
    trigger: /^select 1 as probe/,
    run: (p) => withAccount(p, randomUUID(), (c) => c.query("select 1 as probe")),
  },
  {
    name: "findOrCreateAccount",
    trigger: /^insert into account/,
    run: (p) => findOrCreateAccount(p, `rollback-${randomUUID()}`),
  },
  {
    name: "admitAccount (lookUp)",
    trigger: /^select id from account/,
    run: (p) => admitAccount(p, `rollback-${randomUUID()}`),
  },
  {
    name: "AccessPostgres.register",
    trigger: /^select 1 from account/,
    run: (p) => new AccessPostgres(p).register(`rollback-${randomUUID()}`, "code"),
  },
  {
    name: "runHandover",
    trigger: /confirm_handover/,
    run: (p) =>
      runHandover(p, randomUUID(), async (s) => {
        await s.confirm(randomUUID(), null);
        return { commit: true, value: 1 };
      }),
  },
  {
    name: "JobsPostgres.claim",
    trigger: /^update job set status = 'dead'/,
    run: (p) => new JobsPostgres(p).claim("worker", new Date(), 1000),
  },
  {
    name: "TaxonomyPostgres.replace",
    trigger: /^delete from taxon/,
    run: (p) =>
      new TaxonomyPostgres(p).replace({ taxa: [], failures: [] } as unknown as Parameters<
        TaxonomyPostgres["replace"]
      >[0]),
  },
  {
    name: "CatalogFillPostgres.record",
    trigger: /app\.catalog_fill/,
    run: (p) => new CatalogFillPostgres(p).record(randomUUID(), [], []),
  },
  {
    name: "CatalogLoadPostgres.load",
    trigger: /pg_advisory_xact_lock/,
    run: (p) =>
      new CatalogLoadPostgres(p).load(
        randomUUID(),
        [],
        {} as Parameters<CatalogLoadPostgres["load"]>[2],
      ),
  },
];

beforeAll(async () => {
  admin = openFixturePool();
  const setup = openOwnerPool();
  await migrate(setup);
  await findOrCreateAccount(setup, knownSubject);
  await setup.end();
});
afterEach(async () => {
  for (const client of leaked) client.release(true);
  leaked = [];
  await pool.end();
});
afterAll(async () => {
  await admin.query("delete from account where subject = $1", [knownSubject]);
  await admin.end();
});

describe("NFR-12 a failed rollback keeps the original error and drops the connection (#1314)", () => {
  it.each(PATHS)(
    "NFR-12 $name: the connection dies, the original error stays and the pool keeps its slot",
    async ({ trigger, run }) => {
      pool = openOwnerPool();
      dieOn(pool, trigger);
      await expect(run(pool)).rejects.toBe(original);
      await expectConnectionDropped(pool);
    },
  );

  it.each(PATHS)(
    "NFR-12 $name: the rollback is refused on a live connection, which never goes back to the pool (P-04)",
    async ({ trigger, run }) => {
      pool = openOwnerPool();
      failThenRefuseRollback(pool, trigger);
      await expect(run(pool)).rejects.toBe(original);
      await expectConnectionDropped(pool);
    },
  );
});

describe("NFR-12 a rollback that is the planned end of a transaction (#1314)", () => {
  const ROLLED_BACK: readonly {
    readonly name: string;
    readonly expected: unknown;
    readonly run: (p: Pool) => Promise<unknown>;
  }[] = [
    {
      name: "AccessPostgres.register of a known subject",
      expected: "existing",
      run: (p) => new AccessPostgres(p).register(knownSubject, "code"),
    },
    {
      name: "runHandover without a commit",
      expected: "kept",
      run: (p) => runHandover(p, randomUUID(), async () => ({ commit: false, value: "kept" })),
    },
  ];

  it.each(ROLLED_BACK)(
    "NFR-12 $name: the answer stands when the rollback fails, and the connection is dropped",
    async ({ run, expected }) => {
      pool = openOwnerPool();
      onStatement(pool, /^rollback/, endBackend);
      await expect(run(pool)).resolves.toBe(expected);
      await expectConnectionDropped(pool);
    },
  );

  it("NFR-12 admitAccount of a known subject: the read stands when its rollback fails, and the connection is dropped", async () => {
    pool = openOwnerPool();
    onStatement(pool, /^rollback/, endBackend);
    await expect(admitAccount(pool, knownSubject)).resolves.toMatch(/^[0-9a-f-]{36}$/);
    await expectConnectionDropped(pool);
  });
});
