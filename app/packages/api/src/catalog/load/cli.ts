import { appendFileSync } from "node:fs";
import type { Pool } from "pg";
import { checkDbRoles } from "@pflanzendex/db";
import { applyLoad, planLoad } from "./catalog-loader.ts";
import { START_SPECIES } from "./start-species.ts";
import type { StartSpecies } from "./start-species.ts";
import { checkAndReport, localDay } from "./research/check-cli.ts";
import type { DataCheck, ResearchFile } from "./research/check-data.ts";
import { readResearchData } from "./research/read-data.ts";

export interface CliDeps {
  readonly argv: readonly string[];
  readonly env: NodeJS.ProcessEnv;
  readonly openPool: (url: string) => Pool;
  readonly out: (line: string) => void;
  readonly now: () => Date;
  /** The curated list; tests pass their own. */
  readonly list?: readonly StartSpecies[];
  /** The researched attribute data (US-ENT-09); default: the data folder of the repo. */
  readonly readData?: () => readonly ResearchFile[];
}

const USAGE =
  "Usage: npm run catalog:load -- [--dry-run] [--confirm <database name>]   (env DATABASE_URL; CATALOG_LOAD_CONFIRM replaces --confirm; CATALOG_LOAD_LOG sets the log file)";

/** Host and database of the URL for the summary; never the user or the password. */
export function describeTarget(databaseUrl: string): { target: string; database: string } {
  const url = new URL(databaseUrl);
  const database = decodeURIComponent(url.pathname.slice(1));
  return { target: `${url.host}/${database}`, database };
}

function option(argv: readonly string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

interface Request {
  readonly dryRun: boolean;
  readonly confirm: string | undefined;
  readonly databaseUrl: string;
}

/** Reads and checks the command line and environment; `string` is the reason to refuse. */
function readRequest(deps: CliDeps): Request | string {
  const unknown = deps.argv.filter(
    (a, i) => !["--dry-run", "--confirm"].includes(a) && deps.argv[i - 1] !== "--confirm",
  );
  if (unknown.length > 0) return `Unknown argument: ${unknown.join(" ")}. ${USAGE}`;
  const databaseUrl = deps.env["DATABASE_URL"];
  if (!databaseUrl)
    return `DATABASE_URL is not set; this command never guesses a database. ${USAGE}`;
  return {
    dryRun: deps.argv.includes("--dry-run"),
    confirm: option(deps.argv, "--confirm") ?? deps.env["CATALOG_LOAD_CONFIRM"],
    databaseUrl,
  };
}

interface LoadContext {
  readonly deps: CliDeps;
  readonly request: Request;
  readonly target: ReturnType<typeof describeTarget>;
  readonly list: readonly StartSpecies[];
  readonly facts: DataCheck["facts"];
  readonly say: (line: string) => void;
}

/** Role check, summary, dry run or confirmed write; returns the exit code. */
async function loadInto(pool: Pool, ctx: LoadContext): Promise<number> {
  const { deps, request, target, list, say } = ctx;
  say(`Catalog load, ${deps.now().toISOString()}`);
  say(`Target: ${target.target}`);
  // The owner role must be neither superuser nor BYPASSRLS: every write below runs under the row rules.
  await checkDbRoles(pool, "enforce", say);
  const plan = await planLoad(pool, list, ctx.facts);
  say(`Curated list: ${plan.records.length} species`);
  say(`New: ${plan.fresh.length}, already present: ${plan.present.length}`);
  const a = plan.attributes;
  say(`Attribute values: new ${a.fresh}, changed ${a.changed}, unchanged ${a.unchanged}`);
  if (request.dryRun) {
    say("Dry run: nothing was written.");
    return 0;
  }
  if (request.confirm !== target.database) {
    say(
      `Refused: pass --confirm ${target.database} (or CATALOG_LOAD_CONFIRM=${target.database}) to write to this database.`,
    );
    return 1;
  }
  const created = await applyLoad(pool, plan, localDay(deps.now()));
  for (const latin of created) say(`added ${latin}`);
  say(
    `Done: ${created.length} species added, ${plan.records.length - created.length} already present.`,
  );
  say(
    `Attribute values written: ${a.write.length} (status "ungeprüft" until a reviewer confirms).`,
  );
  return 0;
}

/**
 * Operator command that loads the curated start catalog (#991, US-BES-12, US-ONB-01) and the researched attributes
 * (US-ENT-09, #1005): the data check runs first and refuses on any problem, then summary, `--dry-run` changes nothing,
 * a write needs the database name as confirmation, one transaction, protocol on stdout and in a file.
 * Returns the exit code (0 done or dry run, 1 refused or failed); errors are never swallowed (P-10).
 */
export async function runCatalogLoad(deps: CliDeps): Promise<number> {
  const lines: string[] = [];
  const say = (line: string) => {
    lines.push(line);
    deps.out(line);
  };
  const finish = (code: number): number => {
    const logFile = deps.env["CATALOG_LOAD_LOG"];
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- the operator names the log file on purpose
    if (logFile) appendFileSync(logFile, `${lines.join("\n")}\n`);
    return code;
  };
  const request = readRequest(deps);
  if (typeof request === "string") {
    say(request);
    return finish(1);
  }
  const list = deps.list ?? START_SPECIES;
  const data = checkAndReport(
    (deps.readData ?? (() => readResearchData()))(),
    list.map((s) => s.latin),
    deps.now(),
    say,
  );
  if (data.issues.length > 0) {
    say("Refused: fix the research data first (npm run catalog:check-data); nothing was written.");
    return finish(1);
  }
  let target: ReturnType<typeof describeTarget>;
  try {
    target = describeTarget(request.databaseUrl);
  } catch {
    say("DATABASE_URL cannot be parsed as a database URL (the value is not printed).");
    return finish(1);
  }
  const pool = deps.openPool(request.databaseUrl);
  try {
    return finish(await loadInto(pool, { deps, request, target, list, facts: data.facts, say }));
  } catch (error) {
    say(
      `Failed, no species was written: ${error instanceof Error ? error.message : String(error)}`,
    );
    return finish(1);
  } finally {
    await pool.end();
  }
}
