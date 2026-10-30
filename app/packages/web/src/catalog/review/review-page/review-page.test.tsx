// @vitest-environment jsdom
import { ERROR_TEXTS, type ReviewEntry, type ReviewList } from "@pflanzendex/core";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/lib/viewport-mock";
import { ReviewPage } from "./review-page";
import { ageText, issueText, movedText, summaryText } from "../review-text";

const NOW = Date.parse("2026-10-10T12:00:00Z");
const token = async () => "tok";
const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const species = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  latinName: "Echeveria elegans",
  genus: "Echeveria",
  epithet: "elegans",
  cultivar: null,
  germanName: null,
  englishName: null,
  synonyms: [],
  familyGerman: null,
  familyLatin: null,
  difficulty: 2,
  standardLevel: 3,
  lightDemandLux: 40000,
  dormancyFrom: "11-01",
  dormancyUntil: "02-15",
  locationHint: null,
  growthMeasure: "rosette_diameter",
  etiolationSigns: "Rosette streckt sich.",
  wateringHint: null,
  substrate: null,
  pruning: null,
  growthHacks: null,
  successCriteria: "Dichte Rosette.",
  botanicalStory: null,
  source: "RHS",
  reviewStatus: "proposal",
  createdBy: "user",
  own: false,
  version: 1,
  ...over,
});

/** One review case; `status` `curated` is an approved operator batch, anything else an open proposal. */
const entry = (
  over: Partial<ReviewEntry> = {},
  status = "proposal",
  id = "c1",
  content: Record<string, unknown> = {},
): ReviewEntry =>
  ({
    reviewCase: {
      id,
      creatorId: "u1",
      objectKind: "species",
      objectId: `s-${id}`,
      status,
      reason: null,
      reviewedBy: null,
      createdAt: "2026-10-07T08:00:00Z",
      mergedInto: null,
    },
    species: species({ id: `s-${id}`, ...content }),
    aiCreated: false,
    issues: [],
    similar: [],
    ...over,
  }) as ReviewEntry;
const list = (
  entries: ReviewEntry[],
  open = entries.filter((e) => e.reviewCase.status !== "curated").length,
): ReviewList => ({
  open,
  oldestOpenAt: open > 0 ? "2026-10-07T08:00:00Z" : null,
  entries,
});

type Posted = { path: string; body: Record<string, unknown>; key: string | undefined };
function server(initial: ReviewList, write: () => Promise<Response> = () => response(200, {})) {
  const posts: Posted[] = [];
  let current = initial;
  const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path === "/review" && (init?.method ?? "GET") === "GET") return response(200, current);
    if (init?.method === "POST") {
      posts.push({
        path,
        body: JSON.parse(String(init.body)) as Record<string, unknown>,
        key: (init.headers as Record<string, string>)["Idempotency-Key"],
      });
      current = list([], 0);
      return write();
    }
    return response(404, {});
  });
  vi.stubGlobal("fetch", fetchFn);
  return { posts, fetchFn };
}

function Address() {
  const l = useLocation();
  return <span data-testid="address">{l.pathname + l.search}</span>;
}
const address = () => screen.getByTestId("address").textContent ?? "";
const show = (at = "/review") =>
  render(
    <MemoryRouter initialEntries={[at]}>
      <ReviewPage api="http://api" token={token} now={() => NOW} />
      <Address />
    </MemoryRouter>,
  );
/** Opens the case with the given name from its compact row (US-QS-15). */
async function openRow(name: string) {
  await userEvent.click(
    await screen.findByRole("button", { name: (accessible) => accessible.includes(name) }),
  );
  return screen.findByRole("dialog", { name });
}

beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
});
beforeEach(() => setViewportWidth(360));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-BES-10 review list shows the open cases", () => {
  it("US-BES-10 the list shows only open proposals by default, with their number and age", async () => {
    server(
      list([
        entry({ aiCreated: true }),
        entry({}, "curated", "b1", { latinName: "Haworthia fasciata" }),
      ]),
    );
    show();
    expect(await screen.findByText(/1 offener Vorschlag, der älteste vor 3 Tagen/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Echeveria elegans/ })).toBeTruthy();
    expect(screen.queryByText("Haworthia fasciata")).toBeNull();
  });

  it("US-BES-10 the empty state appears only when nothing is open; approved batches are one choice away", async () => {
    server(list([entry({}, "curated", "b1", { latinName: "Haworthia fasciata" })], 0));
    const user = userEvent.setup();
    show();
    expect(await screen.findByText("Keine offenen Vorschläge")).toBeTruthy();
    expect(screen.getByText("Es ist nichts zu prüfen.")).toBeTruthy();
    expect(screen.queryByText("Haworthia fasciata")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Freigegeben" }));
    expect(address()).toContain("show=approved");
    expect(await screen.findByRole("button", { name: /Haworthia fasciata/ })).toBeTruthy();
    expect(screen.queryByText("Keine offenen Vorschläge")).toBeNull();
  });

  it("US-BES-10 the approved choice without batches says so and offers the open list (P-09)", async () => {
    server(list([], 0));
    const user = userEvent.setup();
    show("/review?show=approved");
    expect(await screen.findByText("Noch keine freigegebenen Chargen")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Offene Vorschläge ansehen" }));
    expect(address()).not.toContain("show=");
  });

  it("US-BES-10 · DS-48 the empty state offers to reload the list (P-09)", async () => {
    const { fetchFn } = server(list([], 0));
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Liste neu laden" }));
    await vi.waitFor(() => expect(fetchFn.mock.calls.length).toBeGreaterThan(1));
  });

  it("US-BES-10 · DS-48 the loading state is one skeleton status", async () => {
    server(list([entry()]));
    show();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    await screen.findByRole("button", { name: /Echeveria elegans/ });
  });

  it("US-BES-10 a row opens its case in the layer with the fields, source and AI marking", async () => {
    server(list([entry({ aiCreated: true })]));
    show();
    const dialog = await openRow("Echeveria elegans");
    expect(address()).toContain("sheet=case-c1");
    expect(within(dialog).getByText("40.000 Lux")).toBeTruthy();
    expect(within(dialog).getByText("01.11. bis 15.02.")).toBeTruthy();
    expect(within(dialog).getByText("RHS")).toBeTruthy();
    expect(within(dialog).getByText(/KI-erstellt, noch nicht geprüft/)).toBeTruthy();
  });

  it("US-BES-10 a profile without a source cannot be approved and says why (P-09)", async () => {
    server(
      list([
        entry(
          {
            issues: [{ field: "source", reason: "source_missing" }],
          },
          "proposal",
          "c1",
          { source: null },
        ),
      ]),
    );
    show();
    const dialog = await openRow("Echeveria elegans");
    const approve = within(dialog).getByRole("button", { name: "Freigeben" });
    expect((approve as HTMLButtonElement).disabled).toBe(true);
    expect(
      within(dialog).getByText(/Quelle fehlt \(Pflicht für Lichtbedarf und Ruhephase\)/),
    ).toBeTruthy();
    expect(within(dialog).getByText("unbekannt", { selector: "dd" })).toBeTruthy();
  });

  it("US-BES-10 approving in the layer sends one write with an Idempotency-Key, closes it and reloads the list", async () => {
    const { posts } = server(list([entry()]));
    const user = userEvent.setup();
    show();
    const dialog = await openRow("Echeveria elegans");
    await user.click(within(dialog).getByRole("button", { name: "Freigeben" }));
    expect((await screen.findByRole("status")).textContent).toContain("freigegeben");
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ path: "/review/c1/decide", body: { status: "reviewed" } });
    expect(posts[0]?.key).toBeTruthy();
    expect(address()).not.toContain("sheet=");
    expect(await screen.findByText("Keine offenen Vorschläge")).toBeTruthy();
  });

  it("US-BES-10 rejecting in the layer needs a reason and sends it", async () => {
    const { posts } = server(list([entry()]));
    const user = userEvent.setup();
    show();
    const dialog = await openRow("Echeveria elegans");
    await user.click(within(dialog).getByRole("tab", { name: "Entscheiden" }));
    const reject = within(dialog).getByRole("button", { name: "Zurückweisen" });
    expect((reject as HTMLButtonElement).disabled).toBe(true);
    await user.type(
      within(dialog).getByLabelText("Grund für die Zurückweisung"),
      "  Quelle fehlt ",
    );
    await user.click(reject);
    expect((await screen.findByRole("status")).textContent).toContain("zurückgewiesen");
    expect(posts[0]).toMatchObject({
      path: "/review/c1/decide",
      body: { status: "rejected", reason: "Quelle fehlt" },
    });
  });

  it("US-BES-10 a duplicate hint in the layer offers the merge; the result names what moved and what was kept (P-10)", async () => {
    const { posts } = server(
      list([
        entry({
          similar: [
            { id: "t1", latinName: "Echeveria elegans 'Albicans'", matchedOn: "Echeveria elegans" },
          ],
        }),
      ]),
      () =>
        response(200, {
          reviewCase: {},
          moved: [
            { kind: "specimen", moved: 2, kept: 0 },
            { kind: "care_profile", moved: 0, kept: 1 },
          ],
        }),
    );
    const user = userEvent.setup();
    show();
    const dialog = await openRow("Echeveria elegans");
    await user.click(within(dialog).getByRole("tab", { name: "Entscheiden" }));
    expect(within(dialog).getByText(/Mögliche Dublette/)).toBeTruthy();
    await user.click(
      within(dialog).getByRole("button", {
        name: /Mit Echeveria elegans 'Albicans' zusammenführen/,
      }),
    );
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("zusammengeführt");
    expect(status.textContent).toContain("2 Pflanzen übernommen");
    expect(status.textContent).toContain("1 Pflegeprofil nicht übernommen");
    expect(posts[0]).toMatchObject({ path: "/review/c1/merge", body: { targetSpeciesId: "t1" } });
  });

  it("US-BES-10 a refusal stays visible on the page with the German text of its code (approval incomplete)", async () => {
    server(list([entry()]), () =>
      response(409, { error: { code: "review.approval_incomplete", text: "Nicht vollständig." } }),
    );
    const user = userEvent.setup();
    show();
    const dialog = await openRow("Echeveria elegans");
    await user.click(within(dialog).getByRole("button", { name: "Freigeben" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      ERROR_TEXTS["review.approval_incomplete"],
    );
  });

  it("US-BES-10 an approved operator batch opens without any decision (its layer has no actions)", async () => {
    server(list([entry({}, "curated", "b1", { latinName: "Haworthia fasciata" })], 0));
    const user = userEvent.setup();
    show("/review?show=approved");
    await user.click(await screen.findByRole("button", { name: /Haworthia fasciata/ }));
    const dialog = await screen.findByRole("dialog", { name: "Haworthia fasciata" });
    expect(within(dialog).getByText(/Betreiber-Charge, bereits freigegeben/)).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Freigeben" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Zurückweisen" })).toBeNull();
  });

  it("US-BES-10 an entry without content is named as such, in the row and in its layer", async () => {
    server(list([entry({ species: null })]));
    show();
    expect(await screen.findByRole("button", { name: /Unbekannte Art/ })).toBeTruthy();
    const dialog = await openRow("Unbekannte Art");
    expect(within(dialog).getByText(/Inhalt dieses Vorschlags ist nicht verfügbar/)).toBeTruthy();
  });

  it("US-BES-10 a plant keeper gets the server's refusal with a reload option", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response(403, { error: { code: "access.denied", text: "Darauf hast du keinen Zugriff." } }),
      ),
    );
    show();
    expect(await screen.findByText(/keinen Zugriff/)).toBeTruthy();
  });
});

describe("US-QS-15 review list on one screen", () => {
  it("US-QS-15 the page is marked as one screen (DS-61)", async () => {
    server(list([entry()]));
    show();
    await screen.findByRole("button", { name: /Echeveria elegans/ });
    expect(document.querySelector("[data-fit-screen]")).not.toBeNull();
  });

  it("US-QS-15 each case is a compact row; the list is paged in whole rows with the page in the address", async () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      entry({}, "proposal", `c${i + 1}`, { latinName: `Species ${i + 1}` }),
    );
    server(list(many, 10));
    const user = userEvent.setup();
    show();
    const rows = await screen.findByRole("list", { name: "Offene Vorschläge" });
    expect(within(rows).getAllByRole("button")).toHaveLength(4);
    expect(screen.getByText("Seite 1 von 3")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Weiter" }));
    expect(address()).toContain("page=2");
    expect(screen.getByRole("button", { name: /Species 5/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Species 1$/ })).toBeNull();
  });

  it("US-QS-15 a changed choice starts the list at page 1", async () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      entry({}, "proposal", `c${i + 1}`, { latinName: `Species ${i + 1}` }),
    );
    server(list(many, 10), () => response(200, {}));
    const user = userEvent.setup();
    show("/review?page=2");
    await user.click(await screen.findByRole("button", { name: "Freigegeben" }));
    expect(address()).not.toContain("page=");
  });

  it("US-QS-15 a case layer opened by a link reopens at once (deep link ?sheet=case-<id>)", async () => {
    server(list([entry()]));
    show("/review?sheet=case-c1");
    expect(await screen.findByRole("dialog", { name: "Echeveria elegans" })).toBeTruthy();
  });

  it("US-QS-15 Escape closes the layer and returns the focus to its row", async () => {
    server(list([entry()]));
    const user = userEvent.setup();
    show();
    await openRow("Echeveria elegans");
    await user.keyboard("{Escape}");
    await vi.waitFor(() => expect(address()).not.toContain("sheet="));
    expect(document.activeElement?.textContent).toContain("Echeveria elegans");
  });

  it("US-QS-15 the layer's tab is in the address; a link to the decision tab opens it selected", async () => {
    server(list([entry()]));
    const user = userEvent.setup();
    show();
    const dialog = await openRow("Echeveria elegans");
    await user.click(within(dialog).getByRole("tab", { name: "Entscheiden" }));
    expect(address()).toContain("ltab=decide");
    expect(
      within(dialog).getByRole("tab", { name: "Entscheiden" }).getAttribute("aria-selected"),
    ).toBe("true");
    cleanup();
    show("/review?sheet=case-c1&ltab=decide");
    const again = await screen.findByRole("dialog", { name: "Echeveria elegans" });
    expect(
      within(again).getByRole("tab", { name: "Entscheiden" }).getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("US-QS-15 from 1024 px the case stands beside the list as a pane, not as a dialog", async () => {
    setViewportWidth(1440);
    server(list([entry()]));
    show("/review?sheet=case-c1");
    const pane = await screen.findByRole("complementary", { name: "Echeveria elegans" });
    expect(within(pane).getByRole("button", { name: "Freigeben" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("US-BES-10 texts", () => {
  it("ages and summaries", () => {
    expect(ageText("2026-10-10T08:00:00Z", NOW)).toBe("heute");
    expect(ageText("2026-10-09T08:00:00Z", NOW)).toBe("vor 1 Tag");
    expect(ageText("2026-10-11T08:00:00Z", NOW)).toBe("heute");
    expect(summaryText(list([entry(), entry({}, "proposal", "c2")]), NOW)).toContain(
      "2 offene Vorschläge",
    );
    expect(summaryText(list([], 0), NOW)).toBe("");
  });

  it("issues and moved references", () => {
    expect(issueText({ field: "etiolationSigns", reason: "missing" })).toContain("fehlt");
    expect(issueText({ field: "growthMeasure", reason: "missing" })).toBe("Wachstumsmaß fehlt");
    expect(movedText({ reviewCase: entry().reviewCase, moved: [] })).toContain("nichts");
    expect(
      movedText({
        reviewCase: entry().reviewCase,
        moved: [
          { kind: "specimen", moved: 1, kept: 0 },
          { kind: "other_kind", moved: 2, kept: 0 },
        ],
      }),
    ).toBe("1 Pflanze übernommen; 2 other_kind übernommen.");
  });
});
