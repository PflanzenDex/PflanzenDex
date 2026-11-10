import { describe, expect, it } from "vitest";
import { assertSeedAllowed, SeedRefused } from "./guard.ts";

// Enabler #924: the demo seed refuses everything but a local or test setup (hard lock).
const LOCAL_DB = "postgres://postgres:postgres@127.0.0.1:54329/pflanzendex_test";
const run = (env: Record<string, string>, url = LOCAL_DB) =>
  assertSeedAllowed(env as NodeJS.ProcessEnv, url);

describe("#924 demo seed guard", () => {
  it("allows local and test on a loopback database", () => {
    expect(() => run({ PFLANZENDEX_ENV: "local" })).not.toThrow();
    expect(() => run({ PFLANZENDEX_ENV: "test" }, "postgres://u:p@localhost/x")).not.toThrow();
    expect(() => run({ PFLANZENDEX_ENV: "local" }, "postgres://u:p@[::1]:5432/x")).not.toThrow();
  });

  it("refuses prod with a clear message", () => {
    expect(() => run({ PFLANZENDEX_ENV: "prod" })).toThrow(/'prod'.*never runs in production/);
    expect(() => run({ PFLANZENDEX_ENV: "production" })).toThrow(SeedRefused);
  });

  it("refuses an unset or unknown environment", () => {
    expect(() => run({})).toThrow(/not set/);
    expect(() => run({ PFLANZENDEX_ENV: "" })).toThrow(/not set/);
    expect(() => run({ PFLANZENDEX_ENV: "staging" })).toThrow(/unknown PFLANZENDEX_ENV 'staging'/);
    expect(() => run({ PFLANZENDEX_ENV: "Local" })).toThrow(SeedRefused);
  });

  it("refuses a remote or production-looking database even when the environment says local", () => {
    const env = { PFLANZENDEX_ENV: "local" };
    expect(() => run(env, "postgres://u:p@db.example.com/pflanzendex")).toThrow(
      /not on this machine/,
    );
    expect(() => run(env, "postgres://u:p@127.0.0.1/pflanzendex_prod")).toThrow(
      /looks like production/,
    );
    expect(() => run(env, "not a url")).toThrow(/cannot be parsed/);
    expect(() => run({ ...env, NODE_ENV: "production" })).toThrow(/NODE_ENV/);
  });
});
