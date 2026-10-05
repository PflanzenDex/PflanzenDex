// Runs INSIDE the pinned Playwright container (started by ds-snapshots.mjs): serves the built catalog and
// runs the screenshot spec against it. Env: DS_CATALOG, DS_SNAPSHOT_DIR, DS_OUTPUT_DIR, DS_STORIES, DS_UPDATE.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "./check-conformance.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const { server, url } = await serve(process.env.DS_CATALOG);
const cli = path.join(here, "..", "..", "node_modules", "@playwright", "test", "cli.js");
// Async spawn: the catalog server lives in this process and must keep answering while the tests run.
const child = spawn(
  process.execPath,
  [
    cli,
    "test",
    "-c",
    path.join(here, "ds-snapshots.config.mjs"),
    `--update-snapshots=${process.env.DS_UPDATE === "1" ? "all" : "none"}`,
  ],
  { stdio: "inherit", env: { ...process.env, DS_BASE_URL: url } },
);
const status = await new Promise((resolve) => child.on("close", (code) => resolve(code ?? 1)));
server.close();
process.exit(status);
