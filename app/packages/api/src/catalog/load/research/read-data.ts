import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { ResearchFile } from "./check-data.ts";

/** The researched start-catalog data in the repo (US-ENT-09, #1005): `data/batch-NN/part-N.json`. */
export const DATA_DIR = fileURLToPath(new URL("./data", import.meta.url));

function walk(dir: string): string[] {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the data folder of the repo or a test folder
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".json") ? [join(dir, e.name)] : [],
  );
}

/** Every `*.json` below `dir` in path order, parsed; a file that does not parse has `json: undefined`. */
export function readResearchData(dir: string = DATA_DIR): ResearchFile[] {
  return walk(dir)
    .sort()
    .map((file) => {
      let json: unknown;
      try {
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- found by walking the data folder
        json = JSON.parse(readFileSync(file, "utf8"));
      } catch {
        json = undefined;
      }
      return { path: relative(dir, file).split("\\").join("/"), json };
    });
}
