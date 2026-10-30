import { START_SPECIES } from "../start-species.ts";
import { runCheckData } from "./check-cli.ts";
import { readResearchData } from "./read-data.ts";

// Usage: `npm run catalog:check-data -w @pflanzendex/api` (no database). See docs/guides/operations/release-and-rollback.md.
process.exitCode = runCheckData({
  readData: () => readResearchData(),
  startList: START_SPECIES.map((s) => s.latin),
  out: (line) => console.log(line),
  now: () => new Date(),
});
