// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HintsPage } from "./hints-page";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const noLocation = {
  kind: "location_missing",
  specimenId: "e1",
  specimenName: "Bogenhanf",
  locationId: null,
  text: "„Bogenhanf“ hat noch keinen Standort.",
  nextAction: "Weise dem Exemplar einen Standort zu.",
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
  nextAction: "Wähle für das Exemplar eine Art aus dem Katalog.",
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
    render(<HintsPage api="http://api" token={token} onOpen={noop} />);
    expect(screen.getByRole("status").textContent).toContain("geladen");
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
    await userEvent.click(screen.getByRole("button", { name: /Zum Bestand/ }));
    expect(open).toHaveBeenLastCalledWith("collection");
  });

  it("US-BES-08 without hints it says so and what the page checks (P-09)", async () => {
    fakeServer(() => response(200, { hints: [] }));
    render(<HintsPage api="http://api" token={token} onOpen={noop} />);
    await screen.findByText(/Keine Hinweise/);
    expect(screen.getByText(/Jedes Exemplar hat eine Art/).textContent).toContain("Standort");
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
    render(<HintsPage api="http://api" token={token} onOpen={noop} host />);
    expect(await screen.findByText(noZone.text)).toBeTruthy();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByText(noZone.text).closest("li")?.className).toContain("bg-warning");
  });

  it("US-QS-14 · US-BES-08 without hints the empty state is a level 3 heading with the way to the collection", async () => {
    fakeServer(() => response(200, { hints: [] }));
    const open = vi.fn();
    render(<HintsPage api="http://api" token={token} onOpen={open} host />);
    expect(await screen.findByRole("heading", { level: 3, name: "Keine Hinweise" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Zum Bestand" }));
    expect(open).toHaveBeenCalledWith("collection");
  });

  it("US-QS-14 · P-10 a failed load keeps the error and the retry", async () => {
    fakeServer(() => response(500, serverError));
    render(<HintsPage api="http://api" token={token} onOpen={noop} host />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Der Server antwortet nicht.");
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
  });
});
