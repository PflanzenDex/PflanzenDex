import { expect, test } from "@playwright/test";
import {
  SCREENS,
  idsFromEnv,
  selectedScreens,
  screensOf,
  type Screen,
} from "../../../support/display/one-screen/register";
import { measurementsOf, sizesOf } from "../../../support/display/one-screen/register.check";
import { sizeSetOf, sizesIn, type SizeSet } from "../../../support/display/selection/size-set";

// US-QG-02 (owner decision d-190, issue 2666): which sizes of the one-screen gate a run measures (ONE_SCREEN_SIZES) and which screens
// it selects (UI_SCREENS). Pure self-tests, no browser: the sets are passed in, so the tests do not read the environment of the run.

const entry = (over: Partial<Screen> & Pick<Screen, "id">): Screen => ({
  account: "test2",
  path: "/",
  kind: "overview",
  state: "many",
  ...over,
});

// US-QG-02 (issue 2666): the size set (ONE_SCREEN_SIZES) and the selection of screens (UI_SCREENS) are pure; the self-tests pin
// what a pull request run and the nightly warning run measure, without reading the environment of the run (they pass the sets).
function sizeSetTests(): void {
  const names = (set: SizeSet) => sizesIn(set).map((s) => s.name);
  test("US-QG-02 ONE_SCREEN_SIZES: gate is the six fit and cap sizes, text200 the 200 % text size, all every size; unset is all", () => {
    expect(names("gate")).toEqual([
      "360x640",
      "390x844",
      "768x1024",
      "1024x768",
      "1920x1080",
      "2560x1440",
    ]);
    expect(names("text200")).toEqual(["360x640@200%"]);
    expect(names("all")).toHaveLength(7);
    expect(sizeSetOf(undefined)).toBe("all");
    expect(sizeSetOf("")).toBe("all");
    expect(sizeSetOf("gate")).toBe("gate");
  });

  test("US-QG-02 ONE_SCREEN_SIZES: an unknown set is refused before anything is measured", () => {
    expect(() => sizeSetOf("text")).toThrow(
      'ONE_SCREEN_SIZES "text" is not one of all, gate, text200',
    );
  });

  test("US-QG-02 ONE_SCREEN_SIZES: a screen with its own sizes keeps the ones the set names, and none is left at text200 when it has none", () => {
    const own = entry({ id: "own", sizes: ["360x640", "390x844", "360x640@200%"] });
    expect(sizesOf(own, "gate").map((s) => s.name)).toEqual(["360x640", "390x844"]);
    expect(sizesOf(own, "text200").map((s) => s.name)).toEqual(["360x640@200%"]);
    const phone = entry({ id: "phone", sizes: ["360x640", "390x844"] });
    expect(sizesOf(phone, "text200")).toEqual([]);
    expect(measurementsOf([own, phone], "gate")).toBe(4);
  });

  test("US-QG-02 UI_SCREENS: a comma list selects screens by id; empty is every screen; an unknown id is refused", () => {
    expect(idsFromEnv("today, collection ,")).toEqual(["today", "collection"]);
    expect(idsFromEnv("")).toEqual([]);
    expect(idsFromEnv(undefined)).toEqual([]);
    expect(selectedScreens([]).map((s) => s.id)).toEqual(SCREENS.map((s) => s.id));
    expect(selectedScreens(["today", "welcome"]).map((s) => s.id)).toEqual(["today", "welcome"]);
    expect(() => selectedScreens(["no-such-screen"])).toThrow("UI_SCREENS names unknown screens");
  });

  test("US-QG-02 UI_SCREENS: the shards of a partial run split the selected screens only, and every selected screen is in one shard", () => {
    const ids = ["today", "collection", "welcome", "friends", "account", "discover"];
    const parts = [1, 2].map((i) => screensOf("", `${i}/2`, ids).map((s) => s.id));
    expect(parts.flat().sort()).toEqual([...ids].sort());
    expect(parts[0]?.some((id) => parts[1]?.includes(id))).toBe(false);
    expect(screensOf("today", "", ids).map((s) => s.id)).toEqual(["today"]);
    expect(() => screensOf("account", "", ["today"])).toThrow("unknown screen");
  });
}

sizeSetTests();
