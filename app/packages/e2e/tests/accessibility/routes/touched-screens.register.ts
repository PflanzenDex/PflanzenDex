import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import {
  MAX_SHARDS,
  SCREENS_PER_SHARD,
  homeOf,
  outputLines,
  readScreens,
  shardCount,
  shardList,
} from "../../../support/display/selection/touched-screens";

// US-QG-02 (issue 2666): the checked-in register and the command line of the touched-screens mapper. Registered from
// touched-screens.spec.ts (pure: the register is read from its file; the command line is run as a child process, no browser).

function registerTests(): void {
  test("US-QG-02 every screen of the checked-in register has a home, so no screen falls to the fail-safe", () => {
    expect(
      readScreens()
        .filter((s) => homeOf(s) === null)
        .map((s) => s.id),
    ).toEqual([]);
  });

  test("US-QG-02 every layer file of the register exists under web/src, so its unit is a real one", () => {
    const webSrc = new URL("../../../../web/src/", import.meta.url);
    for (const s of readScreens())
      if (s.layerFile)
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- a layer file named by the checked-in register
        expect(existsSync(new URL(s.layerFile, webSrc)), `${s.id}: ${s.layerFile}`).toBe(true);
  });
}

function outputTests(): void {
  test("US-QG-02 the output lines: the screens, the shards and the count, one per line; no screen means no shard", () => {
    const everything = { all: true, ids: readScreens().map((s) => s.id) };
    expect(outputLines(everything)).toEqual([
      "ui-screens=",
      "ui-shards=[1,2,3,4,5]",
      `ui-count=${everything.ids.length}`,
    ]);
    expect(outputLines({ all: false, ids: ["today", "wish"] })).toEqual([
      "ui-screens=today,wish",
      "ui-shards=[1]",
      "ui-count=2",
    ]);
    expect(outputLines({ all: false, ids: [] })).toEqual([
      "ui-screens=",
      "ui-shards=[]",
      "ui-count=0",
    ]);
  });

  test("US-QG-02 the shard arithmetic: one shard per 17 screens, at most five: 0, 1, 17, 18, 85 and 163 screens", () => {
    expect(SCREENS_PER_SHARD).toBe(17);
    expect(MAX_SHARDS).toBe(5);
    expect(shardList(0)).toEqual([]);
    expect(shardList(1)).toEqual([1]);
    expect(shardList(17)).toEqual([1]);
    expect(shardList(18)).toEqual([1, 2]);
    expect(shardList(85)).toEqual([1, 2, 3, 4, 5]);
    expect(shardList(163)).toEqual([1, 2, 3, 4, 5]);
    expect(shardCount(86)).toBe(5);
  });
}

function commandLineTests(): void {
  test("US-QG-02 the command line: no base or an all-zero base runs every screen in five shards; a base with no change runs none", () => {
    const script = fileURLToPath(
      new URL("../../../support/display/selection/touched-screens.ts", import.meta.url),
    );
    const run = (args: string[]) =>
      spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
    const all = run(["0000000000000000000000000000000000000000"]);
    expect(all.status, all.stderr).toBe(0);
    expect(all.stdout).toContain("ui-shards=[1,2,3,4,5]");
    const none = run(["HEAD"]);
    expect(none.status, none.stderr).toBe(0);
    expect(none.stdout).toContain("ui-shards=[]");
    expect(none.stdout).toContain("ui-count=0");
  });
}

/** The register, output and command-line self-tests of the mapper (registered by touched-screens.spec.ts). */
export function touchedRegisterSelfTests(): void {
  registerTests();
  outputTests();
  commandLineTests();
}
