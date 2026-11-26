import type { Browser, Page } from "@playwright/test";
import { openScreen } from "../display/one-screen/fit";
import { checkExpect } from "../display/one-screen/fit.expect";
import type { Size } from "../display/one-screen/judge";
import type { Screen } from "../display/one-screen/register";
import type { SignedInState } from "../display/one-screen/sign-in";
import { failing, type Check } from "./check";
import { rootFontOf, screenChecksOf, shotOf, windowOf } from "./check.page";
import { cellName, type Cell } from "./device";
import { join } from "node:path";
import type { Flow, FlowContext } from "./flow";
import { shotsDirOf, type CellRecord } from "./report.cells";

// Judges one cell (US-DEV-01, issue 2504): opens the screen of the cell on the page the device gave, runs the screen-level default
// check, runs the flow of the cell (if any), takes the screenshots and returns the record. The record is written by the caller.
// A precondition that is not on the page (a seed gap) or a step that fails ends the cell as `error` with its reason: never a pass.

/** What the runner needs from the run: the web origin, the run folder and the sign-in of another account (flows). */
export interface RunEnv {
  browser: Browser;
  base: string;
  runDir: string;
  signedIn: (account: string) => Promise<SignedInState | undefined>;
}

/** The device as the cell names it: its label, and the model when it is the real phone. */
export interface DeviceInfo {
  label: string;
  model?: string;
  width: number;
  height: number;
}

/** What one cell is judged on: its page, its screen, its flow, its checks and screenshots so far (filled in as it runs). */
interface Judged {
  page: Page;
  env: RunEnv;
  cell: Cell;
  screen: Screen;
  flow: Flow | undefined;
  key: string;
  checks: Check[];
  shots: string[];
}

const reasonOf = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).split("\n")[0] ?? "";

/** The screenshot of the cell under `label`: written to the run folder, named as the cell, and its relative path. */
async function snap(page: Page, env: RunEnv, key: string, label: string): Promise<string> {
  const file = `${key}-${label}.png`;
  await shotOf(page, join(shotsDirOf(env.runDir), file));
  return `shots/${file}`;
}

/** The flow context of a cell: the page, the device settings, the checks and screenshots the flow records. */
function contextOf(j: Judged): FlowContext {
  const { page, env, cell, key, checks, shots } = j;
  return {
    page,
    base: env.base,
    browser: env.browser,
    device: cell.device,
    theme: cell.theme,
    text: cell.text,
    forced: cell.forced,
    signedIn: env.signedIn,
    check: (c) => checks.push(c),
    shot: async (label) => {
      const path = await snap(page, env, key, label);
      shots.push(path);
      return path;
    },
  };
}

/** The screen of the cell and its flow, run on the page: the default checks, the screenshots, then the flow. Returns the window. */
async function runCell(
  j: Judged,
  label: string,
): Promise<{ width: number; height: number; rem: number }> {
  const { page, env, cell, screen, flow, key, checks, shots } = j;
  await openScreen(page, env.base, screen);
  await checkExpect(page, screen);
  const win = await windowOf(page);
  const size: Size = {
    name: label,
    width: win.width,
    height: win.height,
    kind: cell.text === "200" ? "text200" : "fit",
  };
  checks.push(...(await screenChecksOf(page, size, cell.text)));
  shots.push(await snap(page, env, key, "screen"));
  if (flow) {
    await flow.run(contextOf(j));
    shots.push(await snap(page, env, key, "after"));
  }
  return { width: win.width, height: win.height, rem: await rootFontOf(page) };
}

/**
 * Judges one cell on a page that is ready to open its screen (signed in, with the page settings applied). `device` is what the
 * record says about the device; the window the page measured is recorded beside it. A failure of a step is an `error`, never a pass.
 */
export async function judgeCell(args: {
  page: Page;
  env: RunEnv;
  cell: Cell;
  screen: Screen;
  flow?: Flow;
  device: DeviceInfo;
  extra?: Check[];
}): Promise<CellRecord> {
  const { cell, device } = args;
  const started = Date.now();
  const j: Judged = {
    page: args.page,
    env: args.env,
    cell,
    screen: args.screen,
    flow: args.flow,
    key: cellName(cell),
    checks: [...(args.extra ?? [])],
    shots: [],
  };
  const declared = {
    label: device.label,
    ...(device.model ? { model: device.model } : {}),
    width: device.width,
    height: device.height,
  };
  try {
    const seen = await runCell(j, device.label);
    const measured = {
      ...declared,
      measuredWidth: seen.width,
      measuredHeight: seen.height,
      rem: seen.rem,
    };
    const status = failing(j.checks).length ? "fail" : "pass";
    return {
      key: j.key,
      cell,
      device: measured,
      status,
      checks: j.checks,
      shots: j.shots,
      ms: Date.now() - started,
    };
  } catch (error) {
    const none = { ...declared, measuredWidth: 0, measuredHeight: 0, rem: 0 };
    const reason = reasonOf(error);
    return {
      key: j.key,
      cell,
      device: none,
      status: "error",
      reason,
      checks: j.checks,
      shots: j.shots,
      ms: Date.now() - started,
    };
  }
}
