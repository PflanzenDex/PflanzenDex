import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Browser, Page } from "@playwright/test";
import { SCREENS } from "../display/one-screen/register";
import type { SignedInState } from "../display/one-screen/sign-in";
import type { Check } from "./check";
import type { DeviceId, TextSize, Theme } from "./device";

// A flow of the device check (US-DEV-01, issue 2504): one scripted interaction on a screen of the register. A flow is one file
// `flows/<area>/<name>.flow.ts` that default-exports `defineFlow({...})`; `loadFlows` finds it, so adding a flow means adding a
// file, never editing a list. The flow runs once per cell (device, theme, text size) of its screen, on the page the screen opened.

/** What a flow gets from the cell it runs in. `check` records a judged property; `shot` writes a screenshot of this cell. */
export interface FlowContext {
  page: Page;
  /** The web origin (localhost:<web port>): a flow that opens another route builds its URL from it. */
  base: string;
  browser: Browser;
  device: DeviceId;
  theme: Theme;
  text: TextSize;
  forced: boolean;
  /** The signed-in state of another demo account, for a second browser context (a friend, for example). */
  signedIn: (account: string) => Promise<SignedInState | undefined>;
  /** Records one check of this cell; a failing check fails the cell. */
  check: (check: Check) => void;
  /** Writes a screenshot of the current page under `label` (`<cell>-<label>.png`) and returns its path. */
  shot: (label: string) => Promise<string>;
}

/** One flow: a name (kebab case, unique), its title, the register id of the screen it opens, and the script. */
export interface Flow {
  name: string;
  title: string;
  screen: string;
  run: (ctx: FlowContext) => Promise<void>;
}

/** Declares a flow; the default export of a `.flow.ts` file. Typed here so each file gets the context type. */
export function defineFlow(flow: Flow): Flow {
  return flow;
}

const FLOWS_DIR = fileURLToPath(new URL("./flows/", import.meta.url));

/** The `.flow.ts` files under the flows folder, sorted, relative to it (`plant-layer/water.flow.ts`). */
export function flowFilesOf(dir: string = FLOWS_DIR): string[] {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the flows folder of this module, read recursively
  return readdirSync(dir, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith(".flow.ts"))
    .sort();
}

/** Kebab case as the layout rule reads it: lower-case letters and digits, joined by single dashes. */
const isKebab = (name: string): boolean =>
  name.split("-").every((part) => /^[a-z0-9]+$/.test(part));

/** Checks one flow module's default export: the shape, a kebab name and a screen the register holds (US-DEV-01). */
export function checkFlow(file: string, value: unknown, screens: readonly string[]): Flow {
  const flow = value as Partial<Flow> | undefined;
  if (
    !flow ||
    typeof flow.name !== "string" ||
    typeof flow.run !== "function" ||
    typeof flow.title !== "string" ||
    typeof flow.screen !== "string"
  )
    throw new Error(
      `device-check: flow ${file} must default-export defineFlow({ name, title, screen, run })`,
    );
  if (!isKebab(flow.name))
    throw new Error(`device-check: flow ${file} names "${flow.name}", which is not kebab case`);
  if (!screens.includes(flow.screen))
    throw new Error(
      `device-check: flow ${file} opens screen "${flow.screen}", which the register does not hold`,
    );
  return flow as Flow;
}

/**
 * Loads every flow of the folder (auto-registered, US-DEV-01): imports each `.flow.ts`, checks it, and refuses two flows with
 * one name. Sorted by name, so the matrix and the summary read the same order every run.
 */
export async function loadFlows(dir: string = FLOWS_DIR): Promise<Flow[]> {
  const screens = SCREENS.map((s) => s.id);
  const files = flowFilesOf(dir);
  const flows: Flow[] = [];
  for (const file of files) {
    const mod = (await import(pathToFileURL(join(dir, file)).href)) as { default?: unknown };
    flows.push(checkFlow(file, mod.default, screens));
  }
  const names = flows.map((f) => f.name);
  const twice = names.find((n, i) => names.indexOf(n) !== i);
  if (twice !== undefined) throw new Error(`device-check: two flows are named "${twice}"`);
  return flows.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
