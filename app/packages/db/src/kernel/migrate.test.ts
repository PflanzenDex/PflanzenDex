import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, onTestFinished } from "vitest";
import { migrate, splitStatements } from "./migrate.ts";
import { openOwnerPool } from "./connection/connection.ts";

const TABLE_NAME = "schema_migrations_test";
const LOCK_TIMEOUT_MS = 300;
let pool: Pool;

beforeAll(() => {
  pool = openOwnerPool();
});
afterAll(async () => {
  await pool.query(`drop table if exists ${TABLE_NAME}`);
  await pool.end();
});

function directory(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "migr-"));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
}

/** A table name of its own for one test, so that parallel test files never meet. */
const unique = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

async function recorded(): Promise<string[]> {
  const r = await pool.query<{ name: string }>(`select name from ${TABLE_NAME} order by name`);
  return r.rows.map((x) => x.name);
}

describe("US-DEV-07 migration tool", () => {
  it("US-DEV-07 applies files in name order once and remembers them", async () => {
    await pool.query(`drop table if exists ${TABLE_NAME}`);
    const dir = directory({ "0002_b.sql": "select 2;", "0001_a.sql": "select 1;" });
    expect(await migrate(pool, { directory: dir, tableName: TABLE_NAME })).toEqual([
      "0001_a.sql",
      "0002_b.sql",
    ]);
    expect(await migrate(pool, { directory: dir, tableName: TABLE_NAME })).toEqual([]);
  });

  it("US-DEV-07 aborts if an already applied migration was changed afterwards", async () => {
    await pool.query(`drop table if exists ${TABLE_NAME}`);
    const dir = directory({ "0001_a.sql": "select 1;" });
    await migrate(pool, { directory: dir, tableName: TABLE_NAME });
    writeFileSync(join(dir, "0001_a.sql"), "select 99;");
    await expect(migrate(pool, { directory: dir, tableName: TABLE_NAME })).rejects.toThrow(
      /0001_a\.sql.*changed/,
    );
  });

  it("US-DEV-07 rolls back a faulty migration completely and leaves nothing half-applied", async () => {
    await pool.query(`drop table if exists ${TABLE_NAME}`);
    const dir = directory({
      "0001_kaputt.sql": "create table halb (id int); select not_present();",
    });
    await expect(migrate(pool, { directory: dir, tableName: TABLE_NAME })).rejects.toThrow();
    const r = await pool.query("select to_regclass('halb') as t");
    expect(r.rows[0].t).toBeNull();
    expect(await recorded()).toEqual([]);
  });
});

describe("US-DEV-07 lock timeout of every migration", () => {
  it("US-DEV-07 a migration that waits on a lock held by another connection fails within the timeout", async () => {
    await pool.query(`drop table if exists ${TABLE_NAME}`);
    const table = unique("lock_wait");
    await pool.query(`create table ${table} (id int)`);
    const holder: PoolClient = await pool.connect();
    try {
      await holder.query("begin");
      await holder.query(`lock table ${table} in access exclusive mode`);
      const dir = directory({ "0001_wait.sql": `alter table ${table} add column note text;` });
      const started = Date.now();
      await expect(
        migrate(pool, { directory: dir, tableName: TABLE_NAME, lockTimeoutMs: LOCK_TIMEOUT_MS }),
      ).rejects.toThrow(/lock timeout/);
      expect(Date.now() - started).toBeLessThan(LOCK_TIMEOUT_MS * 10);
      expect(await recorded()).toEqual([]);
    } finally {
      await holder.query("rollback");
      holder.release();
      await pool.query(`drop table if exists ${table}`);
    }
  });

  it("US-DEV-07 every migration runs with the runner's lock timeout unless the file sets its own", async () => {
    await pool.query(`drop table if exists ${TABLE_NAME}`);
    const seen = unique("lock_seen");
    const dir = directory({
      "0001_seen.sql": `create table ${seen} (v text);
insert into ${seen} select current_setting('lock_timeout');`,
      "0002_own.sql": `set lock_timeout = '7s';
create table ${seen}_own (v text);
insert into ${seen}_own select current_setting('lock_timeout');`,
    });
    onTestFinished(async () => {
      await pool.query(`drop table if exists ${seen}, ${seen}_own`);
    });
    await migrate(pool, { directory: dir, tableName: TABLE_NAME, lockTimeoutMs: LOCK_TIMEOUT_MS });
    const runner = await pool.query<{ v: string }>(`select v from ${seen}`);
    const file = await pool.query<{ v: string }>(`select v from ${seen}_own`);
    expect(runner.rows[0]?.v).toBe("300ms");
    expect(file.rows[0]?.v).toBe("7s");
  });

  it("US-DEV-07 the lock timeout and the settings of a file do not leak into the pool", async () => {
    await pool.query(`drop table if exists ${TABLE_NAME}`);
    const dir = directory({
      "0001_leak.sql": "set lock_timeout = '9s'; set statement_timeout = '9s';\nselect 1;",
    });
    await migrate(pool, { directory: dir, tableName: TABLE_NAME, lockTimeoutMs: LOCK_TIMEOUT_MS });
    // Four queries at once need four connections of the pool: a leaked setting would show on one of them.
    const values = await Promise.all(
      [1, 2, 3, 4].map(() =>
        pool.query<{ lock: string; statement: string }>(
          "select current_setting('lock_timeout') as lock, current_setting('statement_timeout') as statement",
        ),
      ),
    );
    for (const r of values) expect(r.rows[0]).toEqual({ lock: "0", statement: "0" });
  });
});

describe("US-DEV-07 no-transaction marker", () => {
  it("US-DEV-07 a marked migration runs outside a transaction, so create index concurrently works", async () => {
    await pool.query(`drop table if exists ${TABLE_NAME}`);
    const table = unique("cic");
    await pool.query(`create table ${table} (id int)`);
    onTestFinished(async () => {
      await pool.query(`drop table if exists ${table}`);
    });
    const dir = directory({
      "0001_index.sql": `-- migrate: no-transaction
set lock_timeout = '5s';
create index concurrently if not exists ${table}_id on ${table} (id);`,
    });
    expect(await migrate(pool, { directory: dir, tableName: TABLE_NAME })).toEqual([
      "0001_index.sql",
    ]);
    const idx = await pool.query("select indexname from pg_indexes where tablename = $1", [table]);
    expect(idx.rows).toEqual([{ indexname: `${table}_id` }]);
    expect(await recorded()).toEqual(["0001_index.sql"]);
  });

  it("US-DEV-07 the same statement in a file without the marker fails inside the transaction", async () => {
    await pool.query(`drop table if exists ${TABLE_NAME}`);
    const table = unique("cic_plain");
    await pool.query(`create table ${table} (id int)`);
    onTestFinished(async () => {
      await pool.query(`drop table if exists ${table}`);
    });
    const dir = directory({
      "0001_index.sql": `create index concurrently ${table}_id on ${table} (id);`,
    });
    await expect(migrate(pool, { directory: dir, tableName: TABLE_NAME })).rejects.toThrow(
      /cannot run inside a transaction block/,
    );
    expect(await recorded()).toEqual([]);
  });

  it("US-DEV-07 a failing statement of a marked file leaves the file unrecorded", async () => {
    await pool.query(`drop table if exists ${TABLE_NAME}`);
    const table = unique("marked_fail");
    onTestFinished(async () => {
      await pool.query(`drop table if exists ${table}`);
    });
    const dir = directory({
      "0001_partial.sql": `-- migrate: no-transaction
create table ${table} (id int);
select not_present();`,
    });
    await expect(migrate(pool, { directory: dir, tableName: TABLE_NAME })).rejects.toThrow();
    // The first statement ran on its own (no transaction around the file): the table exists, the file is not recorded.
    expect((await pool.query("select to_regclass($1) as t", [table])).rows[0]?.t).not.toBeNull();
    expect(await recorded()).toEqual([]);
  });
});

describe("US-DEV-07 statement splitting for the marked files", () => {
  it("US-DEV-07 splits at top-level semicolons only", () => {
    expect(splitStatements("select 1; select 2;\n")).toEqual(["select 1", "select 2"]);
  });

  it("US-DEV-07 keeps semicolons inside strings, quoted names, comments and dollar quotes", () => {
    const sql = [
      "select 'a;b''c'; -- not; a split",
      'select "x;y" from t; /* block; comment */ select 2;',
      "create function f() returns int language plpgsql as $body$ begin return 1; end $body$;",
      "select $$;$$;",
    ].join("\n");
    expect(splitStatements(sql)).toEqual([
      "select 'a;b''c'",
      '-- not; a split\nselect "x;y" from t',
      "/* block; comment */ select 2",
      "create function f() returns int language plpgsql as $body$ begin return 1; end $body$",
      "select $$;$$",
    ]);
  });

  it("US-DEV-07 drops parts that hold only comments", () => {
    expect(splitStatements("-- nothing here;\n/* nor here; */\n;\nselect 3;")).toEqual([
      "select 3",
    ]);
  });
});
