// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LayerScope } from "@/shared/ui/layer-scope";
import { HintsPage } from "./hints-page";
import { delayLoads } from "@/shared/ui/skeleton.loading-contract";
import { setViewportWidth } from "@/shared/testing/viewport-mock";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const noLocation = {
  kind: "location_missing",
  specimenId: "e1",
  specimenName: "Bogenhanf",
  locationId: null,
  text: "„Bogenhanf“ hat noch keinen Standort.",
  nextAction: "Weise der Pflanze einen Standort zu.",
};
const noZone = {
  kind: "location_without_zone",
  specimenId: "e2",
  specimenName: "Aloe",
  locationId: "s1",
  text: "„Aloe“ steht am Standort „Kiste“, der noch keine Lichtzone hat.",
  nextAction: "Weise dem Standort „Kiste“ eine Lichtzone zu.",
};
const noSpecies = {
  kind: "species_missing",
  specimenId: "e3",
  specimenName: "Rätsel",
  locationId: "s1",
  text: "Die Art von „Rätsel“ ist nicht lesbar.",
  nextAction: "Wähle für die Pflanze eine Art aus dem Katalog.",
};
const serverError = { error: { code: "server.error", text: "Der Server antwortet nicht." } };

function fakeServer(hints: () => Promise<Response>) {
  const fetchFn = vi.fn<typeof fetch>(async (url) => {
    const path = new URL(String(url)).pathname;
    if (path === "/locations") return response(200, { locations: [] });
    return path === "/specimens/hints" ? hints() : response(404, {});
  });
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}
const token = async () => "tok";
const noop = () => undefined;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-BES-08 page of the hints about incomplete specimens", () => {
  it("US-BES-08 shows every hint with its text and next action", async () => {
    fakeServer(() => response(200, { hints: [noLocation, noZone, noSpecies] }));
    delayLoads();
    render(<HintsPage api="http://api" token={token} onOpen={noop} />);
    expect((await screen.findByRole("status")).textContent).toContain("geladen");
    expect(await screen.findByText(noLocation.text)).toBeTruthy();
    expect(screen.getByText(noZone.text)).toBeTruthy();
    expect(screen.getByText(noSpecies.text)).toBeTruthy();
    expect(screen.getByText(noZone.nextAction)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Hinweise" })).toBeTruthy();
  });

  it("US-BES-08 the action button leads to where the hint is fixed", async () => {
    fakeServer(() => response(200, { hints: [noSpecies, noZone] }));
    const open = vi.fn();
    render(<HintsPage api="http://api" token={token} onOpen={open} />);
    await userEvent.click(await screen.findByRole("button", { name: /Standorte verwalten/ }));
    expect(open).toHaveBeenLastCalledWith("light");
    await userEvent.click(screen.getByRole("button", { name: /Zur Sammlung/ }));
    expect(open).toHaveBeenLastCalledWith("collection");
  });

  it("US-BES-08 without hints it says so and what the page checks (P-09)", async () => {
    fakeServer(() => response(200, { hints: [] }));
    render(<HintsPage api="http://api" token={token} onOpen={noop} />);
    await screen.findByText(/Nichts fehlt/);
    expect(screen.getByText(/Jede Pflanze hat eine Art/).textContent).toContain("Standort");
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("US-BES-08 without sign-in the request to sign in comes and nothing is queried", async () => {
    const fetchFn = fakeServer(() => response(200, { hints: [] }));
    render(<HintsPage api="http://api" token={async () => undefined} onOpen={noop} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Bitte melde dich neu an.");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("US-BES-08 if loading fails the error stays visible and reload fetches the hints (P-10)", async () => {
    let attempt = 0;
    fakeServer(() =>
      ++attempt === 1 ? response(500, serverError) : response(200, { hints: [noLocation] }),
    );
    render(<HintsPage api="http://api" token={token} onOpen={noop} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Der Server antwortet nicht.");
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByText(noLocation.text)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("US-BES-08 a page that was left no longer shows a late answer", async () => {
    let done: (r: Response) => void = () => undefined;
    const fetchFn = fakeServer(() => new Promise<Response>((ok) => (done = ok)));
    const { unmount, container } = render(
      <HintsPage api="http://api" token={token} onOpen={noop} />,
    );
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
    unmount();
    done(new Response(JSON.stringify({ hints: [noLocation] }), { status: 200 }));
    await new Promise((r) => setTimeout(r, 0));
    expect(container.textContent).toBe("");
  });
});

describe("US-QS-14 · US-BES-08 the hints as a section of Heute (host)", () => {
  it("US-QS-14 has no title of its own, so the one h1 stays with the page, and shows the hints in warning cards", async () => {
    fakeServer(() => response(200, { hints: [noZone] }));
    render(
      <MemoryRouter>
        <HintsPage api="http://api" token={token} onOpen={noop} host />
      </MemoryRouter>,
    );
    expect(await screen.findByText(noZone.text)).toBeTruthy();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByText(noZone.text).closest("div")?.className).toContain("bg-warning");
  });

  it("US-QS-18 · US-QS-15 in the layer of Heute the hints are one scrolling list, with no pages and no position in the address (issue 2418)", async () => {
    // A sheet, a dialog or a pane never pages: the layer scrolls (SG-LIST-01).
    setViewportWidth(768);
    fakeServer(() => response(200, { hints: [noZone, noSpecies, noLocation, noZone] }));
    render(
      <MemoryRouter initialEntries={["/today?sheet=hints&lfrom=3"]}>
        <LayerScope.Provider value>
          <HintsPage api="http://api" token={token} onOpen={noop} host />
        </LayerScope.Provider>
      </MemoryRouter>,
    );
    const list = await screen.findByRole("list", { name: "Fehlende Angaben" });
    expect(list.hasAttribute("data-page-fit")).toBe(false);
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    expect(screen.queryByText(/^Seite \d+ von \d+$/)).toBeNull();
    expect(screen.queryByRole("button", { name: /^(Zurück|Weiter)$/ })).toBeNull();
  });

  it("US-QS-14 · US-BES-08 without hints the empty state is a level 3 heading with the way to the collection", async () => {
    fakeServer(() => response(200, { hints: [] }));
    const open = vi.fn();
    render(
      <MemoryRouter>
        <HintsPage api="http://api" token={token} onOpen={open} host />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { level: 3, name: "Nichts fehlt" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Zur Sammlung" }));
    expect(open).toHaveBeenCalledWith("collection");
  });

  it("US-QS-14 · P-10 a failed load keeps the error and the retry", async () => {
    fakeServer(() => response(500, serverError));
    render(
      <MemoryRouter>
        <HintsPage api="http://api" token={token} onOpen={noop} host />
      </MemoryRouter>,
    );
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Der Server antwortet nicht.");
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
  });
});

describe("US-QS-32 the sheet Fehlt noch: one line of help, the rest behind Mehr erfahren (SG-COPY-05, SG-FMT-03)", () => {
  it("US-QS-32 the line counts plants, not hints: two hints of one plant agree in the singular, and the example sits behind Mehr erfahren", async () => {
    const second = {
      ...noZone,
      kind: "location_missing",
      text: "„Aloe“ hat noch keinen Standort.",
    };
    fakeServer(() => response(200, { hints: [noZone, second] }));
    render(
      <MemoryRouter>
        <HintsPage api="http://api" token={token} onOpen={noop} host />
      </MemoryRouter>,
    );
    const line = await screen.findByText("Ohne diese Angaben fehlt sie in Auswertungen.");
    expect(line.closest("details")).toBeNull();
    const more = line.parentElement?.querySelector("details");
    expect(more?.textContent).toContain("Die Verteilung auf die Lichtzonen zum Beispiel");
    expect(more?.textContent).not.toContain("Ohne diese Angaben");
  });

  it("US-QS-32 SG-FMT-03 hints of two plants agree in number: 'Ohne diese Angaben fehlen sie'", async () => {
    fakeServer(() => response(200, { hints: [noZone, noSpecies] }));
    render(
      <MemoryRouter>
        <HintsPage api="http://api" token={token} onOpen={noop} host />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Ohne diese Angaben fehlen sie in Auswertungen.")).toBeTruthy();
    expect(screen.queryByText(/Diese Pflanzen sind unvollständig/)).toBeNull();
  });
});
