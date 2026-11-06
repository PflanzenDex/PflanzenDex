import { fileURLToPath } from "node:url";
import { orderTaxonomyBuild, runTaxonomyBuild } from "@pflanzendex/core";
import type { CatalogNames, SourceClient, TaxonomyStore } from "@pflanzendex/core";
import {
  SpeciesPostgres,
  TaxonomyPostgres,
  checkDbRoles,
  openPool,
  roleCheckMode,
  testDatabaseUrl,
} from "@pflanzendex/db";
import { createMemorySourceCache, createSourceClient } from "../kernel";

// The taxonomy build job (US-POK-03) run once from the command line: `make pokedex-build`, or with
// `npm run taxonomy:build -w @pflanzendex/api -- --dry-run`. The job itself is `runTaxonomyBuild`, the same call the
// hourly check orders in the api process. The dry run only compares the catalog with the stored tree and sends no request.

export interface OneOffBuild {
  readonly ok: boolean;
  /** The line for the person, one sentence (P-10: what happened and what stays). */
  readonly line: string;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Runs the build once, or only compares with the stored tree (`dryRun`); nothing is written in a dry run. */
export async function runTaxonomyBuildOnce(
  deps: { names: CatalogNames; store: TaxonomyStore; sources: SourceClient; now: Date },
  options: { dryRun: boolean },
): Promise<OneOffBuild> {
  const { names, store, sources, now } = deps;
  const count = (await names.latinNames()).filter((n) => n.trim() !== "").length;
  // The order callback records that a build is due; no queue is involved (the one-off run does not use the job queue).
  let due = false;
  const status = await orderTaxonomyBuild({
    names,
    store,
    order: async () => {
      due = true;
    },
  });
  if (status === "up_to_date")
    return {
      ok: true,
      line: `pokedex-build: the stored tree already matches the catalog (${count} names), nothing to build. No request was sent.`,
    };
  if (!due)
    return {
      ok: true,
      line: "pokedex-build: the catalog has no approved species with a Latin name, nothing to build. No request was sent.",
    };
  if (options.dryRun)
    return {
      ok: true,
      line: `pokedex-build: dry run: the catalog (${count} names) differs from the stored tree; a build would ask OpenTree, Wikidata, Wikipedia and GBIF. No request was sent.`,
    };
  try {
    await runTaxonomyBuild({ names, store, sources }, now);
  } catch (error) {
    return {
      ok: false,
      line: `pokedex-build: the build failed (${messageOf(error)}); the stored tree stays as it was. Check the connection to OpenTree, Wikidata, Wikipedia and GBIF, then run it again.`,
    };
  }
  return { ok: true, line: `pokedex-build: the taxonomy tree of ${count} names is stored.` };
}

/** The command line: opens the database (DATABASE_URL, otherwise the test database), prints one line, returns the exit code. */
export async function runTaxonomyBuildCommand(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<number> {
  const pool = openPool(env["DATABASE_URL"] ?? testDatabaseUrl());
  try {
    await checkDbRoles(pool, roleCheckMode(env), (message) => console.warn(message));
    // The same source client as the api process: throttled, cached, with its user agent (see main.ts).
    const userAgent = `PflanzenDex/${env["APP_VERSION"] ?? "dev"} (https://github.com/PflanzenDex/PflanzenDex)`;
    const sources = createSourceClient({
      fetch,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      now: Date.now,
      cache: createMemorySourceCache(),
      userAgent,
    });
    const result = await runTaxonomyBuildOnce(
      {
        names: { latinNames: () => new SpeciesPostgres(pool).approvedLatinNames() },
        store: new TaxonomyPostgres(pool),
        sources,
        now: new Date(),
      },
      { dryRun: argv.includes("--dry-run") },
    );
    console.log(result.line);
    return result.ok ? 0 : 1;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , ...args] = process.argv; // node and the script path come first
  process.exitCode = await runTaxonomyBuildCommand(args, process.env);
}
