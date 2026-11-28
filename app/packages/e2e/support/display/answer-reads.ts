import type { Page } from "@playwright/test";

// Reads of the API answered from fixtures for the layout tests (US-QS-15, issue 1903): the layout depends on the names and the
// lengths only, so the fixture gives the same layout on every run. Every other request, and every write, goes to the real API.
const API = `http://localhost:${process.env["E2E_API_PORT"] ?? "3000"}`;
const WEB = `http://localhost:${process.env["E2E_WEB_PORT"] ?? "5173"}`;
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/** Answers the reads of the API by path from `bodies` (a Buffer is a picture); anything else goes on to the real API. */
export async function answerReads(page: Page, bodies: Record<string, unknown>): Promise<void> {
  await page.route(`${API}/**`, async (route) => {
    const body = bodies[new URL(route.request().url()).pathname];
    if (route.request().method() !== "GET" || body === undefined) return route.continue();
    const headers = { "access-control-allow-origin": WEB };
    if (Buffer.isBuffer(body))
      return route.fulfill({ status: 200, contentType: "image/png", headers, body });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers,
      body: JSON.stringify(body),
    });
  });
}

/** An address of a Commons file: long and without a place to break, as the real ones are. */
const ADDRESS =
  "https://commons.wikimedia.org/wiki/File:Ficus_lyrata_in_Wohnzimmer_am_Fenster_Aufnahme_2024_hochaufloesend.jpg";

/** The reads of the wishlist with one open wish "w1" whose picture comes with a long source address; `stored` has a local copy. */
export function wishReads(stored: boolean): Record<string, unknown> {
  const hint = { text: "Beginne oben.", nextAction: "Kaufe die Pflanze." };
  return {
    "/wishes/candidates": {
      candidates: [
        {
          id: "w1",
          name: "Ficus lyrata",
          german: "Geigenfeige",
          title: "Geigenfeige (Ficus lyrata)",
          stock: 1,
          zoneText: "Lampe 3 · 1 Pflanze",
          zone: { id: "z1", name: "Lampe 3" },
          difficulty: 2,
          reasoning: "Mehr Platz in Lampe 4",
          image: {
            url: ADDRESS,
            source: `Anna Beispiel, ${ADDRESS}`,
            license: "CC BY-SA 4.0",
            stored,
          },
          priority: { kind: "thinnest", text: "Hier steht schon 1 Pflanze." },
        },
      ],
      zones: [{ zoneId: "z1", name: "Lampe 3", count: 1 }],
      hint,
      duplicates: [],
      duplicateHint: null,
      unfit: [],
      replenishment: {
        buffer: 3,
        zones: [],
        actions: { discover: false, suggestions: false },
        nextAction: null,
      },
    },
    "/wishes/bought": { bought: [], hint },
    "/wishes/discarded": { discarded: [], hint },
    "/wishes/w1/image": PNG,
  };
}
