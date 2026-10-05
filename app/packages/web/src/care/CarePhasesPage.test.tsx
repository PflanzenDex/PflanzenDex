// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CarePhasesPage } from "./CarePhasesPage";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const phase = {
  specimenId: "e1",
  name: "Bogenhanf",
  speciesId: "a1",
  phase: "dormancy",
  locationId: "s1",
  targetLocationId: null,
  nextChange: { date: "2027-03-16", phase: "growth", days: 120 },
};
const location = { id: "s1", name: "Regal Süd", lightZoneId: null, kind: "indoor" };
const serverError = { error: { code: "server.error", text: "Der Server antwortet nicht." } };

/** Fake server per path; the only foreign system is the network, page and modules run for real. */
function fakeServer(routes: Record<string, () => Promise<Response>>) {
  const fetchFn = vi.fn<typeof fetch>(async (url) => {
    const path = new URL(String(url)).pathname;
    return (routes[path] ?? (() => response(404, {})))();
  });
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}
const token = async () => "tok";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-PHA-01 page of the care phases", () => {
  it("US-PHA-01 shows phase and location of the specimen after loading", async () => {
    fakeServer({
      "/care-phases": () => response(200, { phases: [phase] }),
      "/locations": () => response(200, { locations: [location] }),
    });
    render(<CarePhasesPage api="http://api" token={token} />);
    expect(screen.getByRole("status").textContent).toContain("geladen");
    expect(await screen.findByText("Bogenhanf")).toBeTruthy();
    expect(screen.getByText("Soll-Phase heute: Ruhephase")).toBeTruthy();
    expect(screen.getByText("Standort: Regal Süd")).toBeTruthy();
  });

  it("US-PHA-01 · DS-52 while loading, a skeleton carries the one loading status", () => {
    fakeServer({
      "/care-phases": () => new Promise<Response>(() => undefined),
      "/locations": () => response(200, { locations: [] }),
    });
    const { container } = render(<CarePhasesPage api="http://api" token={token} />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(container.querySelectorAll('[aria-hidden="true"].animate-pulse').length).toBeGreaterThan(
      0,
    );
  });

  it("US-PHA-01 · DS-26 without any phase the empty state links to the collection", async () => {
    fakeServer({
      "/care-phases": () => response(200, { phases: [] }),
      "/locations": () => response(200, { locations: [] }),
    });
    render(<CarePhasesPage api="http://api" token={token} />);
    const link = await screen.findByRole("link", { name: "Zum Bestand" });
    expect(link.getAttribute("href")).toBe("/collection");
  });

  it("US-PHA-01 without sign-in the request to sign in comes and nothing is queried", async () => {
    const fetchFn = fakeServer({});
    render(<CarePhasesPage api="http://api" token={async () => undefined} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Bitte melde dich neu an.");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("US-PHA-01 if the phase query fails, the error is there and reload fetches the list", async () => {
    let attempt = 0;
    fakeServer({
      "/care-phases": () =>
        ++attempt === 1 ? response(500, serverError) : response(200, { phases: [phase] }),
      "/locations": () => response(200, { locations: [location] }),
    });
    render(<CarePhasesPage api="http://api" token={token} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Der Server antwortet nicht.");
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByText("Bogenhanf")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("US-PHA-01 if the locations fail, the loading fails as a whole", async () => {
    fakeServer({
      "/care-phases": () => response(200, { phases: [phase] }),
      "/locations": () => response(500, serverError),
    });
    render(<CarePhasesPage api="http://api" token={token} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Der Server antwortet nicht.");
    expect(screen.queryByText("Bogenhanf")).toBeNull();
  });

  it("US-PHA-01 a page that was left no longer shows a late answer", async () => {
    let done: (r: Response) => void = () => undefined;
    const fetchFn = fakeServer({
      "/care-phases": () => new Promise<Response>((ok) => (done = ok)),
      "/locations": () => response(200, { locations: [] }),
    });
    const { unmount, container } = render(<CarePhasesPage api="http://api" token={token} />);
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
    unmount();
    done(new Response(JSON.stringify({ phases: [phase] }), { status: 200 }));
    await new Promise((r) => setTimeout(r, 0));
    expect(container.textContent).toBe("");
  });
});
