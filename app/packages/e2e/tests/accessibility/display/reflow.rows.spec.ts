import type { Page, TestInfo } from "@playwright/test";
import { answerReads, wishReads } from "../../../support/display/answer-reads";
import { layoutProblems, signInToApp } from "../../../support/display/display";
import type { TestAccount } from "../../../support/account";
import { expect, test } from "../../../support/fixtures";

// US-QS-15 (issue 1903, SG-TYPE-04, SG-TYPE-05): rows and cards of the sheets at 200 % text on the phone widths of the device
// check (393, 424 and 430 px) and at 360 px, in the style of the FR-BES-23 test of reflow.spec.ts. The reads come from fixtures
// (like today-layout.spec.ts), so the layout depends on the names and lengths only. The text size is set the way the one-screen
// gate sets it (`html { font-size: 200% }`). The file is separate because reflow.spec.ts stands at the 200 lines of max-lines.
const WIDTHS = [360, 393, 424, 430];

/** Signs in, opens the sheet at its address with the reads answered, and sets 200 % text; a phone-width test only. */
async function openSheet(
  who: { page: Page; account: TestAccount; info: TestInfo },
  path: string,
  reads: Record<string, unknown>,
): Promise<void> {
  const { page, account, info } = who;
  test.skip(info.project.name !== "mobil", "the sheets are phone layers: a phone width");
  await signInToApp(page, account);
  await answerReads(page, reads);
  await page.goto(path);
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
}

const due = (specimenId: string, name: string, last: string | null, intervalDays: number) => ({
  specimenId,
  name,
  intervalDays,
  lastWateredOn: last,
  daysSince: last ? 12 : 0,
});

/** The text column, the button and the row of every checkbox row in the open sheet (in rem of the root font size). */
function checkRows(page: Page) {
  return page.evaluate(() => {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const labels = document.querySelectorAll("[role=dialog] label:has(input[type=checkbox])");
    // A label of the other view of the sheet is not shown and has no box.
    const shown = Array.from(labels).filter((label) => label.getBoundingClientRect().width > 0);
    const rect = (el: Element | null) => el?.getBoundingClientRect() ?? new DOMRect();
    return shown.map((label) => {
      const text = rect(label.querySelector(":scope > span"));
      const box = rect(label);
      const row = rect(label.parentElement);
      const button = rect(label.nextElementSibling);
      return {
        name: (label.textContent ?? "").slice(0, 20),
        textRem: text.width / rem,
        buttonBelow: button.top >= box.bottom - 1,
        inside: button.right <= row.right + 1 && box.right <= row.right + 1,
      };
    });
  });
}

test.describe("US-QS-15 due watering rows at 200 % text (issue 1903)", () => {
  const DUE = {
    due: [
      due("s1", "Echte Aloe – Zweiter Ableger", null, 42),
      due("s2", "Schmetterlingsorchidee", "2026-10-01", 14),
      due("s3", "Efeu", "2026-10-02", 5),
    ],
  };

  test("US-QS-15 the name of a due plant keeps its column and 'Gegossen' wraps below it at 360 to 430 px", async ({
    page,
    account,
  }, info) => {
    await openSheet({ page, account, info }, "/today?sheet=watering", { "/watering/due": DUE });
    await expect(page.getByRole("checkbox", { name: /Efeu/ })).toBeVisible();
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      const rows = await checkRows(page);
      expect(rows).toHaveLength(3);
      for (const row of rows) {
        // One letter per line was a column of 25 px (under one rem); a name keeps at least four rem.
        expect(row.textRem, `${width} px: the text column of ${row.name}`).toBeGreaterThan(4);
        expect(row.buttonBelow, `${width} px: Gegossen below ${row.name}`).toBe(true);
        expect(row.inside, `${width} px: ${row.name} stays inside its row`).toBe(true);
      }
      expect(await layoutProblems(page), `${width} px`).toEqual([]);
    }
  });
});

test.describe("US-QS-15 the wish card at 200 % text (issue 1903)", () => {
  for (const stored of [false, true]) {
    test(`US-QS-15 a long picture address stays inside the card at 360 to 430 px (${stored ? "stored" : "external"} picture)`, async ({
      page,
      account,
    }, info) => {
      const path = "/collection?view=wishlist&sheet=wish-w1";
      await openSheet({ page, account, info }, path, wishReads(stored));
      const card = page.getByRole("dialog").locator("li").first();
      await expect(card.getByText(/^Quelle: Anna Beispiel/)).toBeVisible();
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 800 });
        const fit = await card.evaluate((el) => {
          const edge = el.getBoundingClientRect().right;
          const texts = Array.from(el.querySelectorAll("h2, figcaption, p"));
          const right = texts.map((e) => e.getBoundingClientRect().right);
          return { overflow: el.scrollWidth - el.clientWidth, farthest: Math.max(...right) - edge };
        });
        expect(fit.overflow, `${width} px: the card scrolls sideways`).toBeLessThanOrEqual(0);
        expect(fit.farthest, `${width} px: a text sticks out of the card`).toBeLessThanOrEqual(1);
      }
    });
  }
});

test.describe("US-QS-15 the plant picker of 'Behandlung planen' at 200 % text (issue 1903)", () => {
  const plants = ["Birkenfeige", "Schmetterlingsorchidee", "Efeutute – Ampel"].map((name, i) => ({
    id: `p${i}`,
    name,
    location: "Wohnzimmer Fenster",
  }));

  test("US-QS-15 the search field and the location have a line each at full width, and a name keeps its column beside its box", async ({
    page,
    account,
  }, info) => {
    const reads = { "/specimens/treatable": { specimens: plants } };
    await openSheet({ page, account, info }, "/today?sheet=plan", reads);
    const search = page.getByRole("searchbox", { name: "Pflanze suchen" });
    const place = page.getByRole("combobox", { name: "Standort" });
    await expect(search).toBeVisible();
    // A placeholder that does not fit ends with an ellipsis, not with a cut letter.
    await expect(search).toHaveCSS("text-overflow", "ellipsis");
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      const [s, p] = [await search.boundingBox(), await place.boundingBox()];
      const below = s && p && p.y >= s.y + s.height;
      expect(below, `${width} px: the location lies below the search`).toBe(true);
      const same = s && p && Math.abs(s.width - p.width) <= 1;
      expect(same, `${width} px: the search and the location are full width`).toBe(true);
      for (const row of await checkRows(page))
        expect(row.textRem, `${width} px: the name column of ${row.name}`).toBeGreaterThan(4);
      expect(await layoutProblems(page), `${width} px`).toEqual([]);
    }
  });
});
