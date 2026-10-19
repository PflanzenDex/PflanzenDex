import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createSuperuserOwnerDatabase, type SuperuserOwnerDatabase } from "../../fixtures.ts";
import { migrate, openAdminPool, openOwnerPool, openPool, testDatabaseUrl } from "../index.ts";
import { checkDbRoles, dbRoleFindings, roleCheckMode } from "./role-check.ts";

// #907, US-DEV-07, P-04: the start-up check of the database roles (real PostgreSQL, `make db-up`).
let plain: Pool;
let db: SuperuserOwnerDatabase;
beforeAll(async () => {
  plain = openOwnerPool();
  await migrate(plain);
  db = await createSuperuserOwnerDatabase("rolecheck");
});
afterAll(async () => {
  await plain.end();
  await db.drop();
});

describe("US-DEV-07 database role check at start-up (#907)", () => {
  it("US-DEV-07 a plain, non-superuser owner is clean", async () => {
    expect(await dbRoleFindings(plain)).toEqual([]);
    const warn = vi.fn();
    await checkDbRoles(plain, "enforce", warn);
    expect(warn).not.toHaveBeenCalled();
  });

  it("US-DEV-07 a superuser connection that owns the tables is reported with both facts", async () => {
    const found = await dbRoleFindings(db.pool);
    expect(found).toHaveLength(2);
    expect(found[0]).toMatch(/connection runs as .*superuser/);
    expect(found[1]).toMatch(
      /tables are owned by .*security definer functions ignore row-level security/,
    );
  });

  it("US-DEV-07 warn logs every finding and goes on, enforce refuses to start, off does not look", async () => {
    const warn = vi.fn();
    await checkDbRoles(db.pool, "warn", warn);
    expect(warn).toHaveBeenCalledTimes(2);
    await expect(checkDbRoles(db.pool, "enforce", warn)).rejects.toThrow(
      /Unsafe database roles.*DB roles in production/,
    );
    warn.mockClear();
    await checkDbRoles(db.pool, "off", warn);
    expect(warn).not.toHaveBeenCalled();
  });

  it("US-DEV-07 before the first migration (no tables yet) only the connection role can be wrong", async () => {
    const admin = openAdminPool();
    const name = `su_empty_${randomUUID()
      .replace(/[0-9-]/g, "")
      .slice(0, 8)}`;
    await admin.query(`create database ${name}`);
    const url = new URL(testDatabaseUrl());
    url.pathname = `/${name}`;
    const empty = openPool(url.toString());
    try {
      const found = await dbRoleFindings(empty);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatch(/connection runs as/);
    } finally {
      await empty.end();
      await admin.query(`drop database ${name} with (force)`);
      await admin.end();
    }
  });

  it("US-DEV-07 DB_ROLE_CHECK defaults to warn and rejects unknown values", () => {
    expect(roleCheckMode({})).toBe("warn");
    expect(roleCheckMode({ DB_ROLE_CHECK: "" })).toBe("warn");
    expect(roleCheckMode({ DB_ROLE_CHECK: "enforce" })).toBe("enforce");
    expect(roleCheckMode({ DB_ROLE_CHECK: "off" })).toBe("off");
    expect(() => roleCheckMode({ DB_ROLE_CHECK: "strict" })).toThrow(/off, warn or enforce/);
  });
});
