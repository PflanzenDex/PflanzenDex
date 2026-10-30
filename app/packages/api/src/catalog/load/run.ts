import { openPool } from "@pflanzendex/db";
import { runCatalogLoad } from "./cli.ts";

// Usage (production, inside the api container): `npm run catalog:load -- --dry-run`, then
// `npm run catalog:load -- --confirm <database name>`. See docs/guides/operations/release-and-rollback.md.
process.exitCode = await runCatalogLoad({
  argv: process.argv.slice(2),
  env: process.env,
  openPool: (url) => openPool(url),
  out: (line) => console.log(line),
  now: () => new Date(),
});
