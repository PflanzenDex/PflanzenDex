import { expect, type BrowserContext } from "@playwright/test";
import { WEB, test } from "../../../support/display/one-screen/sign-in";
import { applyFail, applyReply } from "../../../support/display/one-screen/fit.expect";
import { SCREENS } from "../../../support/display/one-screen/register";
import {
  cellsOf,
  parseFilters,
  type RawFilters,
} from "../../../support/device-check/device.filters";
import { titleOf, type Cell } from "../../../support/device-check/device";
import { openEmulated } from "../../../support/device-check/device.open";
import {
  startPhone,
  stopPhone,
  type PhoneSession,
} from "../../../support/device-check/device.phone";
import { runPhoneCells } from "../../../support/device-check/device.phone.run";
import { judgeCell, type RunEnv } from "../../../support/device-check/check.run";
import { loadFlows, type Flow } from "../../../support/device-check/flow";
import {
  cellNotes,
  runDirOf,
  skippedCell,
  writeCell,
  type CellRecord,
} from "../../../support/device-check/report.cells";
import { failureOf } from "../../../support/device-check/report.render";

// US-DEV-01 (issue 2504): the parametrized device check. `make device-check` sets SCREEN, FLOW, DEVICE, THEME, TEXT and FORCED
// (DEVICE_CHECK_* here). Every cell of the matrix is one test on the emulated devices; the attached phone is one test that runs
// its cells in turn (one adb session, one Chrome connection per cell). Local only for the phone; never part of CI (it blocks nothing).

const API = `http://localhost:${process.env["E2E_API_PORT"] ?? "3000"}`;
// The web, API and Keycloak ports the phone reaches over `adb reverse` (Keycloak: KC_HOSTNAME of config/dev/compose.yaml).
const KEYCLOAK_PORT = 18081;
const PHONE_PORTS = [
  Number(process.env["E2E_WEB_PORT"] ?? 5173),
  Number(process.env["E2E_API_PORT"] ?? 3000),
  KEYCLOAK_PORT,
];

const FLOWS = await loadFlows();
const FILTERS = parseFilters(
  {
    DEVICE_CHECK_SCREEN: process.env["DEVICE_CHECK_SCREEN"],
    DEVICE_CHECK_FLOW: process.env["DEVICE_CHECK_FLOW"],
    DEVICE_CHECK_DEVICE: process.env["DEVICE_CHECK_DEVICE"],
    DEVICE_CHECK_THEME: process.env["DEVICE_CHECK_THEME"],
    DEVICE_CHECK_TEXT: process.env["DEVICE_CHECK_TEXT"],
    DEVICE_CHECK_FORCED: process.env["DEVICE_CHECK_FORCED"],
  } satisfies RawFilters,
  { screens: SCREENS.map((s) => s.id), flows: FLOWS.map((f) => f.name) },
);
const CELLS = cellsOf(FILTERS, (name) => FLOWS.find((f) => f.name === name)?.screen ?? "");

const screenOf = (id: string) => {
  const screen = SCREENS.find((s) => s.id === id);
  if (!screen) throw new Error(`device-check: unknown screen "${id}"`);
  return screen;
};
const flowOf = (cell: Cell): Flow | undefined =>
  cell.kind === "flow" ? FLOWS.find((f) => f.name === cell.id) : undefined;
const planOf = (cell: Cell) => ({ cell, screen: screenOf(cell.screen), flow: flowOf(cell) });

test.describe.configure({ mode: "parallel", timeout: 240_000 });
test.describe("US-DEV-01 device check: the emulated devices", () => {
  for (const cell of CELLS.filter((c) => c.device !== "phone")) {
    test(
      `US-DEV-01 ${titleOf(cell)}`,
      { annotation: cellNotes([cell]) },
      async ({ browser, states }) => {
        const { screen, flow } = planOf(cell);
        const state = await states(screen.account);
        const { context, page, device } = await openEmulated(browser, cell, state);
        let record: CellRecord;
        try {
          await applyFail(context as BrowserContext, screen, API);
          // A screen whose state a refused write shows answers that write itself and sends nothing to the API, so parallel
          // cells and later runs do not consume the shared demo state (issue 2649).
          await applyReply(context as BrowserContext, screen, API);
          const env: RunEnv = { browser, base: WEB, runDir: runDirOf(), signedIn: states };
          record = await judgeCell({
            page,
            env,
            cell,
            screen,
            ...(flow ? { flow } : {}),
            device: { label: device.label, width: device.width, height: device.height },
          });
        } finally {
          await context.close();
        }
        writeCell(runDirOf(), record);
        expect(record.status, failureOf(record)).toBe("pass");
      },
    );
  }
});

test.describe("US-DEV-01 device check: the attached phone", () => {
  test.describe.configure({ mode: "serial", timeout: 900_000 });
  const phoneCells = CELLS.filter((c) => c.device === "phone");
  let phone: { session: PhoneSession | null; reason: string } | undefined;
  test.beforeAll(async () => {
    if (phoneCells.length) phone = await startPhone(PHONE_PORTS);
  });
  test.afterAll(async () => {
    if (phone?.session) {
      const left = await stopPhone(phone.session);
      if (left.length) console.log(`device-check: the phone was not put back: ${left.join(", ")}`);
    }
  });

  test(
    "US-DEV-01 the attached phone: its cells in turn",
    { annotation: cellNotes(phoneCells) },
    async () => {
      test.skip(phoneCells.length === 0, "no phone cell in this run");
      const start = phone ?? { session: null, reason: "no phone attached" };
      // A missing phone writes its cells as skipped with the reason (US-DEV-01, P-10), and the run passes.
      if (!start.session) {
        for (const cell of phoneCells) writeCell(runDirOf(), skippedCell(cell, start.reason));
        test.skip(true, start.reason);
        return;
      }
      const failures = await runPhoneCells(start.session, phoneCells.map(planOf), WEB);
      expect(failures, failures.join("\n")).toEqual([]);
    },
  );
});
