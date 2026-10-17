// @vitest-environment jsdom
import { ERROR_TEXTS, type ReviewEntry, type ReviewList } from "@pflanzendex/core";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
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
const entry = (over: Partial<ReviewEntry> = {}, status = "proposal"): ReviewEntry =>
  ({
    reviewCase: {
      id: "c1",
      creatorId: "u1",
      objectKind: "species",
      objectId: "s1",
      status,
      reason: null,
      reviewedBy: null,
      createdAt: "2026-10-07T08:00:00Z",
      mergedInto: null,
    },
    species: species(),
    aiCreated: false,
    issues: [],
    similar: [],
    ...over,
  }) as ReviewEntry;
const list = (entries: ReviewEntry[], open = entries.length): ReviewList => ({
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
const show = () => render(<ReviewPage api="http://api" token={token} now={() => NOW} />);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-BES-10 review list page", () => {
  it("US-BES-10 shows number and age of open proposals and per entry the fields, source and AI marking", async () => {
    server(list([entry({ aiCreated: true })]));
    show();
    expect(screen.getByRole("status").textContent).toContain("wird geladen");
    expect(await screen.findByText(/1 offener Vorschlag, der älteste vor 3 Tagen/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Echeveria elegans" })).toBeTruthy();
    expect(screen.getByText("40.000 Lux")).toBeTruthy();
    expect(screen.getByText("01.11. bis 15.02.")).toBeTruthy();
    expect(screen.getByText("RHS")).toBeTruthy();
    expect(screen.getByText(/KI-erstellt, noch nicht von Menschen geprüft/)).toBeTruthy();
  });

  it("US-BES-10 an empty list says there is nothing to review (P-09)", async () => {
    server(list([], 0));
    show();
    expect(await screen.findByText(/Keine offenen Vorschläge/)).toBeTruthy();
  });

  it("US-BES-10 · DS-48 the empty state offers to reload the list (P-09)", async () => {
    const { fetchFn } = server(list([], 0));
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Liste neu laden" }));
    await vi.waitFor(() => expect(fetchFn.mock.calls.length).toBeGreaterThan(1));
  });

  it("US-BES-10 · DS-48 the loading state is one skeleton status", async () => {
    server(list([entry()]));
    show();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    await screen.findByRole("heading", { name: "Echeveria elegans" });
  });

  it("US-BES-10 a profile without a source cannot be approved and says why (P-09)", async () => {
    server(
      list([
        entry({
          species: species({ source: null }) as never,
          issues: [{ field: "source", reason: "source_missing" }],
        }),
      ]),
    );
    show();
    const approve = await screen.findByRole("button", { name: "Freigeben" });
    expect((approve as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Quelle fehlt \(Pflicht für Lichtbedarf und Ruhephase\)/)).toBeTruthy();
    expect(screen.getByText("unbekannt", { selector: "dd" })).toBeTruthy();
  });

  it("US-BES-10 approving sends one write with an Idempotency-Key and reloads the list", async () => {
    const { posts } = server(list([entry()]));
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Freigeben" }));
    expect((await screen.findByRole("status")).textContent).toContain("freigegeben");
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ path: "/review/c1/decide", body: { status: "reviewed" } });
    expect(posts[0]?.key).toBeTruthy();
    expect(await screen.findByText(/Keine offenen Vorschläge/)).toBeTruthy();
  });

  it("US-BES-10 rejecting needs a reason and sends it", async () => {
    const { posts } = server(list([entry()]));
    const user = userEvent.setup();
    show();
    const reject = await screen.findByRole("button", { name: "Zurückweisen" });
    expect((reject as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText("Grund für die Zurückweisung"), "  Quelle fehlt ");
    await user.click(reject);
    expect((await screen.findByRole("status")).textContent).toContain("zurückgewiesen");
    expect(posts[0]).toMatchObject({
      path: "/review/c1/decide",
      body: { status: "rejected", reason: "Quelle fehlt" },
    });
  });

  it("US-BES-10 a duplicate hint offers the merge; the result names what moved and what was kept (P-10)", async () => {
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
    expect(await screen.findByText(/Mögliche Dublette/)).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: /Mit Echeveria elegans 'Albicans' zusammenführen/ }),
    );
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("zusammengeführt");
    expect(status.textContent).toContain("2 Exemplare übernommen");
    expect(status.textContent).toContain("1 Pflegeprofil nicht übernommen");
    expect(posts[0]).toMatchObject({ path: "/review/c1/merge", body: { targetSpeciesId: "t1" } });
  });

  it("US-BES-10 a refusal stays visible with the German text of its code (approval incomplete)", async () => {
    server(list([entry()]), () =>
      response(409, { error: { code: "review.approval_incomplete", text: "Nicht vollständig." } }),
    );
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Freigeben" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      ERROR_TEXTS["review.approval_incomplete"],
    );
  });

  it("US-BES-10 operator batches are listed without actions", async () => {
    server(list([entry({}, "curated")], 0));
    show();
    const item = (await screen.findByRole("heading", { name: "Echeveria elegans" })).closest("li");
    expect(
      within(item as HTMLElement).getByText(/Betreiber-Charge, bereits freigegeben/),
    ).toBeTruthy();
    expect(within(item as HTMLElement).queryByRole("button")).toBeNull();
  });

  it("US-BES-10 an entry without content is named as such", async () => {
    server(list([entry({ species: null })]));
    show();
    expect(await screen.findByText("Unbekannte Art")).toBeTruthy();
    expect(screen.getByText(/Inhalt dieses Vorschlags ist nicht verfügbar/)).toBeTruthy();
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

describe("US-BES-10 texts", () => {
  it("ages and summaries", () => {
    expect(ageText("2026-10-10T08:00:00Z", NOW)).toBe("heute");
    expect(ageText("2026-10-09T08:00:00Z", NOW)).toBe("vor 1 Tag");
    expect(ageText("2026-10-11T08:00:00Z", NOW)).toBe("heute");
    expect(summaryText(list([entry(), entry()]), NOW)).toContain("2 offene Vorschläge");
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
    ).toBe("1 Exemplar übernommen; 2 other_kind übernommen.");
  });
});
