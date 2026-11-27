import type { Locator, Page } from "@playwright/test";
import { openView, signInToApp } from "../../../support/display/display";
import { expect, test } from "../../../support/fixtures";

// US-QS-15 (issue 2644): the search row of Sammlung > Arten at 360 px and 200 % text, in the real browser. The field and the
// button "Filter" shared one row that did not wrap: the field shrank to about 135 px and showed "S" of its placeholder
// "Suche". The Katalog search wraps its button under the field (issue 1019), and so does this row. jsdom has no layout, so
// the width of the placeholder is measured here: the room the text needs (canvas `measureText` with the font of the field,
// plus its padding) against the room the field gives (`clientWidth`). The caught species are a fixture of the route
// `/pokedex/ownership` (the row shows only for a keeper with caught species; every other read is the real API).

const API = `http://localhost:${process.env["E2E_API_PORT"] ?? "3000"}`;
const WEB = `http://localhost:${process.env["E2E_WEB_PORT"] ?? "5173"}`;
const PHONE = { width: 360, height: 640 } as const;

const SPECIES = ["Ficus lyrata", "Aloe vera", "Monstera deliciosa"].map((species) => ({
  species,
  genus: species.split(" ")[0],
  chips: [],
  specimenCount: 1,
  caughtDate: { date: "2026-01-01", source: "caught_at" },
  germanName: null,
  familyLatin: null,
  familyGerman: null,
  genusSpeciesCount: null,
}));

/** Answers the reads of the Pokédex with the fixture; the rest of the API is the real one. */
async function fixtureOwnership(page: Page): Promise<void> {
  const answer = (path: string, body: unknown) =>
    page.route(
      (url) => url.href.startsWith(`${API}${path}`),
      (route) => {
        if (route.request().method() !== "GET") return route.continue();
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "access-control-allow-origin": WEB },
          body: JSON.stringify(body),
        });
      },
    );
  await answer("/pokedex/ownership", { ownership: { caught: SPECIES, unidentified: [] } });
  await answer("/pokedex/seen", { seen: SPECIES.map((s) => s.species) });
}

/**
 * What the placeholder needs (the width of its text, measured with the font of the field) and what the field gives it (the
 * width of its content box: the width of the field without its padding and border; the `clientWidth` of an input is that
 * width already in Chromium, so the box is read from the layout instead).
 */
async function placeholderRoom(field: Locator) {
  return field.evaluate(async (el) => {
    const input = el as HTMLInputElement;
    await document.fonts.ready;
    const style = getComputedStyle(input);
    const context = document.createElement("canvas").getContext("2d");
    if (!context) throw new Error("no canvas context to measure the placeholder");
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    if (!context.font.includes(style.fontSize))
      throw new Error(`the font ${style.font} was not taken`);
    if (style.letterSpacing !== "normal") context.letterSpacing = style.letterSpacing;
    const frame = ["paddingLeft", "paddingRight", "borderLeftWidth", "borderRightWidth"].reduce(
      (sum, side) => sum + parseFloat(style[side as "paddingLeft"]),
      0,
    );
    const width = input.getBoundingClientRect().width;
    return {
      placeholder: input.placeholder,
      needed: Math.ceil(context.measureText(input.placeholder).width),
      given: Math.floor(width - frame),
      field: Math.round(width),
    };
  });
}

/** The placeholder fits its field and the button stays inside the window; the numbers go into the report of the run. */
async function expectRowFits(field: Locator, filter: Locator, size: string) {
  const room = await placeholderRoom(field);
  test.info().annotations.push({ type: size, description: JSON.stringify(room) });
  expect(room.placeholder).not.toBe("");
  expect(
    room.given,
    `${size}: the field (${room.field} px) gives its placeholder "${room.placeholder}" ${room.given} px, it needs ${room.needed} px`,
  ).toBeGreaterThanOrEqual(room.needed);
  const box = await filter.boundingBox();
  if (!box) throw new Error("the button Filter has no box");
  expect(box.x, `${size}: the button Filter starts left of the window`).toBeGreaterThanOrEqual(0);
  expect(
    box.x + box.width,
    `${size}: the button Filter ends right of the window`,
  ).toBeLessThanOrEqual(PHONE.width);
}

test.describe("US-QS-15 the search row of Sammlung > Arten at 200 % text (issue 2644)", () => {
  test("US-QS-15 the placeholder of the search field fits its field at 360 px, at 100 % and at 200 % text, and the button Filter stays in the window", async ({
    page,
    account,
  }, info) => {
    test.skip(
      info.project.name !== "mobil",
      "a phone width: the desktop project is not sized for 360 px",
    );
    test.setTimeout(120_000);
    await page.setViewportSize(PHONE);
    await fixtureOwnership(page);
    await signInToApp(page, account);
    await openView(page, "/collection?view=species");

    const field = page.getByRole("searchbox", { name: /^Suche/ });
    const filter = page.getByRole("button", { name: "Filter", exact: true });
    await expect(field).toBeVisible();
    await expect(filter).toBeVisible();
    await expectRowFits(field, filter, "360 px, 100 % text");

    // 200 % text is set the way the one-screen gate sets it (`html { font-size: 200% }`).
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await expect(field).toBeVisible();
    await expectRowFits(field, filter, "360 px, 200 % text");
  });
});
