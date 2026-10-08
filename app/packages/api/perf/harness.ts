import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { ensureTestOwnerDatabase, migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import { createApp } from "../src/app.ts";

// Load measurement (NFR-12, issue #586): the API in process on a real PostgreSQL, with every SQL statement counted.
// Not a test and not a gate; run it with `npm run perf:measure -w @pflanzendex/api` (see docs/records/test-logs/).

export type Counts = { total: number; payload: number };
export type Reply = { status: number; bytes: number; body: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Transaction frame of `withAccount` (begin, role, account variable, commit): the same four per request, no payload. */
const FRAME = /^(begin|commit|rollback|set local role|select set_config)/i;

export class Harness {
  readonly owner: Pool = openOwnerPool();
  /** Superuser pool: shared catalog rows, `analyze`, cleanup. */
  readonly admin: Pool = openFixturePool();
  counts: Counts = { total: 0, payload: 0 };
  private app!: ReturnType<typeof createApp>;
  private readonly seen = new WeakSet<object>();

  async start(): Promise<void> {
    await ensureTestOwnerDatabase();
    await migrate(this.owner);
    this.hook(this.owner);
    this.app = createApp({
      pool: this.owner,
      reviewer: async (token) => ({
        sub: token.replace("valid:", ""),
        email: `${token.replace("valid:", "")}@example.test`,
        name: "Load",
        email_verified: true,
      }),
    });
  }

  async stop(): Promise<void> {
    await this.owner.end();
    await this.admin.end();
  }

  private count(sql: unknown): void {
    const text =
      typeof sql === "string" ? sql : ((sql as { text?: string } | undefined)?.text ?? "");
    this.counts.total += 1;
    if (!FRAME.test(text.trim())) this.counts.payload += 1;
  }

  private wrap(target: Pool | PoolClient): void {
    const original = target.query.bind(target) as (...args: unknown[]) => unknown;
    (target as unknown as { query: unknown }).query = (...args: unknown[]) => {
      this.count(args[0]);
      return original(...args);
    };
  }

  /** Counts statements on the pool and on every client it hands out (all adapters use `pool.query` or `withAccount`). */
  private hook(pool: Pool): void {
    this.wrap(pool);
    const connect = pool.connect.bind(pool) as (...args: unknown[]) => unknown;
    // `pool.query` itself calls `connect(callback)`: that form is passed through untouched (already counted above).
    (pool as unknown as { connect: unknown }).connect = async (...args: unknown[]) => {
      if (typeof args[0] === "function") return connect(...args);
      const client = (await connect()) as PoolClient;
      if (!this.seen.has(client)) {
        this.seen.add(client);
        this.wrap(client);
      }
      return client;
    };
  }

  async call(sub: string, method: string, path: string, body?: unknown): Promise<Reply> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      authorization: `Bearer valid:${sub}`,
    };
    if (method !== "GET") headers["idempotency-key"] = randomUUID();
    const res = await this.app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    return { status: res.status, bytes: Buffer.byteLength(text), body: JSON.parse(text) };
  }
}
