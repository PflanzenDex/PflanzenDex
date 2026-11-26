import { execFile } from "node:child_process";
import { chromium, type Browser, type Page } from "@playwright/test";
import { promisify } from "node:util";

// The attached real phone (US-DEV-01, issue 2504; local only, never CI). adb finds it; `adb forward` gives Playwright the Chrome
// DevTools socket of the phone's Chrome; `adb reverse` lets the phone reach the web, API and Keycloak ports of this machine as
// localhost. Everything the run changes on the phone (the forwards, the reverses, the night mode) is put back in `close`, also
// when a check failed. The navigator.onLine shim of PF-040 is applied per page by the caller.

const execFileAsync = promisify(execFile);

/** The Chrome DevTools port of the phone on this machine (`adb forward tcp:<port> localabstract:chrome_devtools_remote`). */
export const PHONE_CDP_PORT = 9222;

/** An adb call with a short time limit; its output as text. Throws with adb's own message when it fails. */
export async function adb(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("adb", args, { timeout: 20_000, maxBuffer: 1 << 20 });
  return stdout;
}

/** The phone the run uses: its serial and model. `reason` is set when none is attached (or adb is missing). */
export interface AttachedPhone {
  serial: string;
  model: string;
}

/** The first attached phone in the `device` state of `adb devices`, or null with the reason. Never throws. */
export async function attachedPhone(): Promise<{ phone: AttachedPhone | null; reason: string }> {
  let listing: string;
  try {
    listing = await adb(["devices"]);
  } catch (error) {
    return {
      phone: null,
      reason: `no phone attached (adb is not usable: ${(error as Error).message.split("\n")[0]})`,
    };
  }
  const serial = listing
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .find((parts) => parts[1] === "device")?.[0];
  if (!serial) return { phone: null, reason: "no phone attached" };
  const model =
    (await adb(["-s", serial, "shell", "getprop", "ro.product.model"])).trim() || "unknown model";
  return { phone: { serial, model }, reason: "" };
}

/** The night mode of the phone as `cmd uimode night` reports it: `yes` or `no` (auto counts as no). */
export async function nightModeOf(serial: string): Promise<boolean> {
  return /Night mode: yes/.test(await adb(["-s", serial, "shell", "cmd", "uimode", "night"]));
}

/** Sets the night mode of the phone (the system setting the theme of the cell follows). */
export async function setNightMode(serial: string, on: boolean): Promise<void> {
  await adb(["-s", serial, "shell", "cmd", "uimode", "night", on ? "yes" : "no"]);
}

/** Opens the port forwards of the run: the web, API and Keycloak ports as localhost on the phone, and the Chrome socket here. */
export async function forwardPhone(serial: string, ports: readonly number[]): Promise<void> {
  for (const port of ports) await adb(["-s", serial, "reverse", `tcp:${port}`, `tcp:${port}`]);
  await adb([
    "-s",
    serial,
    "forward",
    `tcp:${PHONE_CDP_PORT}`,
    "localabstract:chrome_devtools_remote",
  ]);
}

/** Takes back what forwardPhone and setNightMode changed. Each step is tried, so one failure does not keep the others. */
export async function releasePhone(
  serial: string,
  ports: readonly number[],
  nightBefore: boolean,
): Promise<string[]> {
  const failures: string[] = [];
  const steps: [string, () => Promise<unknown>][] = [
    ["forward", () => adb(["-s", serial, "forward", "--remove", `tcp:${PHONE_CDP_PORT}`])],
    ...ports.map((port): [string, () => Promise<unknown>] => [
      `reverse ${port}`,
      () => adb(["-s", serial, "reverse", "--remove", `tcp:${port}`]),
    ]),
    ["night mode", () => setNightMode(serial, nightBefore)],
  ];
  for (const [name, step] of steps) {
    try {
      await step();
    } catch (error) {
      failures.push(`${name}: ${(error as Error).message.split("\n")[0]}`);
    }
  }
  return failures;
}

/** Connects Playwright to the Chrome of the phone through the forwarded socket. Throws when Chrome is not running on the phone. */
export function connectPhone(): Promise<Browser> {
  return chromium.connectOverCDP(`http://localhost:${PHONE_CDP_PORT}`, { timeout: 20_000 });
}

/** What the run holds on the phone: the phone, its night mode before the run, and the ports it forwards. */
export interface PhoneSession {
  serial: string;
  model: string;
  nightBefore: boolean;
  ports: readonly number[];
}

/** The result of starting the phone: a session, or the reason there is none (no phone, or adb cannot forward). */
export interface PhoneStart {
  session: PhoneSession | null;
  reason: string;
}

/**
 * Starts the phone for the run: finds it, reads its night mode and forwards the ports. Whatever it changed is put back when a
 * step fails. Returns the reason instead of throwing. The Chrome connection is made per cell (connectPhone), so a Chrome that is
 * not running is a skipped cell with its reason and not a dead session for the whole run (US-DEV-01).
 */
export async function startPhone(ports: readonly number[]): Promise<PhoneStart> {
  const { phone, reason } = await attachedPhone();
  if (!phone) return { session: null, reason };
  const nightBefore = await nightModeOf(phone.serial).catch(() => false);
  try {
    await forwardPhone(phone.serial, ports);
  } catch (error) {
    const failures = await releasePhone(phone.serial, ports, nightBefore);
    const cleanup = failures.length ? ` (cleanup: ${failures.join(", ")})` : "";
    return {
      session: null,
      reason: `adb forward failed: ${(error as Error).message.split("\n")[0]}${cleanup}`,
    };
  }
  return { session: { serial: phone.serial, model: phone.model, nightBefore, ports }, reason: "" };
}

/** Ends the phone session: takes back the forwards and the night mode. Returns what could not be put back. */
export async function stopPhone(session: PhoneSession): Promise<string[]> {
  return releasePhone(session.serial, session.ports, session.nightBefore);
}

/**
 * The navigator.onLine shim of the isolated network (PF-040): the phone's network reports offline without a SIM, so the app shows
 * its offline state. The CDP session ends with the page, so nothing outlives the cell.
 */
export async function onlineShim(page: Page): Promise<void> {
  const session = await page.context().newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: 1e9,
    uploadThroughput: 1e9,
  });
}
