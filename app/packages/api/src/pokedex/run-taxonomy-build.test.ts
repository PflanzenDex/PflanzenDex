import { appError, failed, fingerprintOf } from "@pflanzendex/core";
import type { SourceClient, SourceOutcome, TaxonomyStore } from "@pflanzendex/core";
import { migrate, openPool, testOwnerUrl } from "@pflanzendex/db";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { runTaxonomyBuildCommand, runTaxonomyBuildOnce } from "./run-taxonomy-build";

// US-POK-03: the one-off build from the command line. The database is a fake store and the sources are a fake client,
// so no request leaves the test; the dry run and the empty or unchanged cases must send none at all.
const T = "2026-11-06T10:00:00.000Z";
const NAMES = ["Monstera deliciosa", "Peperomia obtusifolia"];

function storeWith(stored: string | null) {
  const replaced: unknown[] = [];
  const store: TaxonomyStore = {
    fingerprint: async () => stored,
    replace: async (build) => {
      replaced.push(build);
    },
  };
  return { store, replaced };
}

function sourcesThat(
  answer: () => ReturnType<SourceClient["get"]> extends Promise<infer R> ? R : never,
) {
  const requests: string[] = [];
  const sources: SourceClient = {
    get: async (request) => {
      requests.push(request.path);
      return answer();
    },
  };
  return { sources, requests };
}

const failing = () => failed(appError("source.unavailable"));
// OpenTree answers with no match: every name becomes a failure with its reason, the build itself succeeds (P-10).
const noMatch = (): { ok: true; value: SourceOutcome } => ({
  ok: true,
  value: {
    kind: "found",
    data: { results: [] },
    cached: false,
    provenance: { source: "opentree", url: "https://example.test/opentree", retrievedAt: T },
  },
});

describe("US-POK-03 pokedex-build", () => {
  // The command line test reads the migrated database of the api tests; like every api test file that needs tables, this
  // file migrates it (the global setup only creates it).
  beforeAll(async () => {
    const setup = openPool(testOwnerUrl());
    await migrate(setup);
    await setup.end();
  });

  it("US-POK-03 an empty catalog builds nothing and sends no request", async () => {
    const { store, replaced } = storeWith(null);
    const { sources, requests } = sourcesThat(failing);
    const r = await runTaxonomyBuildOnce(
      { names: { latinNames: async () => [] }, store, sources, now: new Date(T) },
      { dryRun: false },
    );
    expect(r.ok).toBe(true);
    expect(r.line).toMatch(/nothing to build/);
    expect(requests).toEqual([]);
    expect(replaced).toEqual([]);
  });

  it("US-POK-03 a stored tree that matches the catalog builds nothing and sends no request", async () => {
    const { store, replaced } = storeWith(fingerprintOf(NAMES));
    const { sources, requests } = sourcesThat(failing);
    const r = await runTaxonomyBuildOnce(
      { names: { latinNames: async () => NAMES }, store, sources, now: new Date(T) },
      { dryRun: false },
    );
    expect(r.ok).toBe(true);
    expect(r.line).toMatch(/already matches the catalog \(2 names\)/);
    expect(requests).toEqual([]);
    expect(replaced).toEqual([]);
  });

  it("US-POK-03 the dry run names what a build would ask and sends no request", async () => {
    const { store, replaced } = storeWith(null);
    const { sources, requests } = sourcesThat(noMatch);
    const r = await runTaxonomyBuildOnce(
      { names: { latinNames: async () => NAMES }, store, sources, now: new Date(T) },
      { dryRun: true },
    );
    expect(r.ok).toBe(true);
    expect(r.line).toMatch(/dry run/);
    expect(r.line).toMatch(/OpenTree, Wikidata, Wikipedia and GBIF/);
    expect(r.line).toMatch(/No request was sent/);
    expect(requests).toEqual([]);
    expect(replaced).toEqual([]);
  });

  it("US-POK-03 a real run stores the tree once when the sources answer", async () => {
    const { store, replaced } = storeWith(null);
    const { sources, requests } = sourcesThat(noMatch);
    const r = await runTaxonomyBuildOnce(
      { names: { latinNames: async () => NAMES }, store, sources, now: new Date(T) },
      { dryRun: false },
    );
    expect(r.ok).toBe(true);
    expect(r.line).toMatch(/tree of 2 names is stored/);
    expect(requests.length).toBeGreaterThan(0);
    expect(replaced).toHaveLength(1);
    expect(replaced[0]).toMatchObject({ fingerprint: fingerprintOf(NAMES), builtAt: T });
  });

  it("US-POK-03 a failing source keeps the stored tree and names the error code (P-10)", async () => {
    const { store, replaced } = storeWith("old-fingerprint");
    const { sources } = sourcesThat(failing);
    const r = await runTaxonomyBuildOnce(
      { names: { latinNames: async () => NAMES }, store, sources, now: new Date(T) },
      { dryRun: false },
    );
    expect(r.ok).toBe(false);
    expect(r.line).toMatch(/source\.unavailable/);
    expect(r.line).toMatch(/the stored tree stays/);
    expect(replaced).toEqual([]);
  });

  it("US-POK-03 the command line runs the dry run on the test database and prints one line (no request)", async () => {
    const printed: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((line: unknown) => {
      printed.push(String(line));
    });
    try {
      // The migrated database of the api tests, the same as every other api test (CI migrates only that one).
      const code = await runTaxonomyBuildCommand(["--dry-run"], {
        ...process.env,
        DATABASE_URL: testOwnerUrl(),
      });
      expect(code).toBe(0);
      expect(printed).toHaveLength(1);
      expect(printed[0]).toMatch(/^pokedex-build: /);
      expect(printed[0]).toMatch(/No request was sent/);
    } finally {
      log.mockRestore();
    }
  });
});
