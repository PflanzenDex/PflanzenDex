import { expect, test } from "@playwright/test";
import { SCREENS } from "../../../support/display/one-screen/register";
import {
  cellName,
  DEFAULT_DEVICES,
  EMULATED_DEVICES,
  type Cell,
} from "../../../support/device-check/device";
import {
  cellCount,
  cellsOf,
  listOf,
  parseFilters,
  similarOf,
  type RawFilters,
} from "../../../support/device-check/device.filters";
import { checkFlow, flowFilesOf, loadFlows } from "../../../support/device-check/flow";

// Self-tests of the device check (US-DEV-01, issue 2504), part 1: the filters refuse an unknown value before anything starts, the
// matrix and the flows. Pure: no browser, no server. The checks and the summary are in display-checks.device.self-checks.spec.ts.

const SCREEN_IDS = SCREENS.map((s) => s.id);
const filtersOf = (raw: RawFilters, flows: string[] = []) =>
  parseFilters(raw, { screens: SCREEN_IDS, flows });
const refusalOf = (raw: RawFilters, flows: string[] = []): string => {
  try {
    filtersOf(raw, flows);
  } catch (error) {
    return (error as Error).message;
  }
  return "";
};

test.describe("US-DEV-01 self-test: the filters refuse unknown values and default to the matrix", () => {
  test("US-DEV-01 the defaults are the three emulated devices, both themes and 100 % text (d-190)", () => {
    const f = filtersOf({ DEVICE_CHECK_SCREEN: "today" });
    expect(f.devices).toEqual(DEFAULT_DEVICES);
    expect(DEFAULT_DEVICES).toEqual(["iphone16", "oneplus15r", "large"]);
    expect(f.themes).toEqual(["light", "dark"]);
    expect(f.texts).toEqual(["100"]);
    expect(f.forced).toBe(false);
  });

  test("US-DEV-01 one screen on the matrix is 3 devices x 2 themes x 1 text size = 6 cells (d-190)", () => {
    const f = filtersOf({ DEVICE_CHECK_SCREEN: "today" });
    expect(cellCount(f)).toBe(6);
    expect(cellsOf(f, () => "").length).toBe(6);
  });

  test("US-DEV-01 an unknown screen id is refused by name, with the closest ids", () => {
    const message = refusalOf({ DEVICE_CHECK_SCREEN: "todya" });
    expect(message).toContain('unknown screen "todya"');
    expect(message).toContain('did you mean "today"');
  });

  test("US-DEV-01 an unknown device, theme or text size is refused with the valid values", () => {
    expect(refusalOf({ DEVICE_CHECK_SCREEN: "today", DEVICE_CHECK_DEVICE: "pixel9" })).toContain(
      "iphone16, oneplus15r, large, phone",
    );
    expect(refusalOf({ DEVICE_CHECK_SCREEN: "today", DEVICE_CHECK_THEME: "sepia" })).toContain(
      "light, dark",
    );
    expect(refusalOf({ DEVICE_CHECK_SCREEN: "today", DEVICE_CHECK_TEXT: "150" })).toContain(
      "100, 200",
    );
  });

  test("US-DEV-01 a run with neither SCREEN nor FLOW is refused: the whole register is not a run of this tool", () => {
    expect(refusalOf({})).toContain("give SCREEN=<id>");
    expect(refusalOf({ DEVICE_CHECK_SCREEN: "  " })).toContain("give SCREEN=<id>");
  });

  test("US-DEV-01 an unknown flow name is refused, and FORCED takes only 0 or 1", () => {
    expect(refusalOf({ DEVICE_CHECK_FLOW: "water" }, ["water-plant"])).toContain(
      'unknown flow "water"',
    );
    expect(refusalOf({ DEVICE_CHECK_SCREEN: "today", DEVICE_CHECK_FORCED: "yes" })).toContain(
      'FORCED "yes"',
    );
  });

  test("US-DEV-01 blank values mean all, and repeated values are kept once in their first order", () => {
    expect(listOf(" a, ,a ,b")).toEqual(["a", "b"]);
    expect(listOf("")).toEqual([]);
    const f = filtersOf({
      DEVICE_CHECK_SCREEN: "today,today",
      DEVICE_CHECK_THEME: "dark,dark",
      DEVICE_CHECK_TEXT: "",
    });
    expect(f.screens).toEqual(["today"]);
    expect(f.themes).toEqual(["dark"]);
    expect(f.texts).toEqual(["100"]);
  });
});

test.describe("US-DEV-01 self-test: the device list and similar ids", () => {
  test("US-DEV-01 DEVICE=phone is a device of the matrix, next to the emulated ones", () => {
    const f = filtersOf({ DEVICE_CHECK_SCREEN: "today", DEVICE_CHECK_DEVICE: "phone,iphone16" });
    expect(f.devices).toEqual(["iphone16", "phone"]);
    expect(cellCount(f)).toBe(4);
  });

  test("US-DEV-01 a similar id is found by a shared prefix or a small edit", () => {
    expect(similarOf("todya", SCREEN_IDS)).toContain("today");
    expect(similarOf("collection-plant-layr", SCREEN_IDS)).toContain("collection-plant-layer");
  });
});

test.describe("US-DEV-01 self-test: the matrix and the flows", () => {
  test("US-DEV-01 a flow runs on the screen it opens, and the cells carry the forced flag", () => {
    const f = filtersOf(
      { DEVICE_CHECK_FLOW: "water-plant", DEVICE_CHECK_TEXT: "200", DEVICE_CHECK_FORCED: "1" },
      ["water-plant"],
    );
    const cells = cellsOf(f, () => "collection-plant-overview");
    expect(cells.length).toBe(6);
    expect(
      cells.every((c) => c.kind === "flow" && c.screen === "collection-plant-overview" && c.forced),
    ).toBe(true);
  });

  test("US-DEV-01 a cell name is its id, device, theme and text size, with -forced when forced colors are on", () => {
    const cell: Cell = {
      kind: "screen",
      id: "today",
      screen: "today",
      device: "large",
      theme: "dark",
      text: "200",
      forced: true,
    };
    expect(cellName(cell)).toBe("today-large-dark-200-forced");
    expect(cellName({ ...cell, forced: false })).toBe("today-large-dark-200");
  });

  test("US-DEV-01 the flows folder loads: every flow has a kebab name and a screen of the register", async () => {
    const flows = await loadFlows();
    expect(flows.map((f) => f.name)).toEqual(["friend-request", "water-plant", "zone-delete"]);
    for (const flow of flows) expect(SCREEN_IDS).toContain(flow.screen);
    expect(flowFilesOf().length).toBe(3);
  });

  test("US-DEV-01 a flow file that names an unknown screen, has no run or a bad name is refused", () => {
    const run = async () => undefined;
    expect(() =>
      checkFlow("x.flow.ts", { name: "x", title: "x", screen: "nowhere", run }, SCREEN_IDS),
    ).toThrow('opens screen "nowhere"');
    expect(() =>
      checkFlow("x.flow.ts", { name: "x", title: "x", screen: "today" }, SCREEN_IDS),
    ).toThrow("defineFlow");
    expect(() =>
      checkFlow("x.flow.ts", { name: "Not Kebab", title: "x", screen: "today", run }, SCREEN_IDS),
    ).toThrow("kebab");
  });

  test("US-DEV-01 the emulated devices are 393, 424 and 430 px wide", () => {
    expect(EMULATED_DEVICES.map((d) => d.width)).toEqual([393, 424, 430]);
  });
});
