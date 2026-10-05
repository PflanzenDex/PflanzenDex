// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HintsPage } from "./HintsPage";
import { setSpecimenLocation } from "./specimens-api";

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
  text: "„Aloe“ steht am Standort „Regal Süd“, der noch keine Lichtzone hat.",
  nextAction: "Weise dem Standort „Regal Süd“ eine Lichtzone zu.",
};
const shelf = { id: "s1", name: "Regal Süd", lightZoneId: null, kind: "indoor" };
const hall = { id: "s2", name: "Flur", lightZoneId: null, kind: "indoor" };
const token = async () => "tok";
const noop = () => undefined;

/** Fake server: hints and locations are read, `POST /specimens/<id>/location` is answered by `locate`. */
function fakeServer(state: {
  hints: unknown[];
  locations?: unknown[];
  locate?: () => Promise<Response>;
}) {
  const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path === "/specimens/hints") return response(200, { hints: state.hints });
    if (path === "/locations")
      return response(200, { locations: state.locations ?? [shelf, hall] });
    if (init?.method === "POST" && path.endsWith("/location"))
      return (state.locate ?? (() => response(200, {})))();
    return response(404, {});
  });
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}
const posts = (fetchFn: ReturnType<typeof fakeServer>) =>
  fetchFn.mock.calls.filter(([, init]) => init?.method === "POST");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-PHA-03 client of the location API", () => {
  it("US-PHA-03 posts the chosen location ID with a fresh repeat-guard key", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => response(200, { id: "e1", locationId: "s1" }));
    const r = await setSpecimenLocation(
      "http://api",
      "tok",
      { id: "e 1", locationId: "s1" },
      fetchFn,
    );
    expect(r).toMatchObject({ ok: true, value: { locationId: "s1" } });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://api/specimens/e%201/location");
    expect(JSON.parse(String(init?.body))).toEqual({ locationId: "s1" });
    expect((init?.headers as Record<string, string>)["Idempotency-Key"]).toBeTruthy();
  });

  it("US-PHA-03 an error of the API stays an error with code", async () => {
    const error = { code: "location.not_found", text: "Diesen Standort gibt es nicht." };
    const fetchFn = vi.fn<typeof fetch>(async () => response(404, { error }));
    expect(
      await setSpecimenLocation("http://api", "tok", { id: "e1", locationId: "x" }, fetchFn),
    ).toMatchObject({ ok: false, error: { code: "location.not_found" } });
  });
});

describe("US-PHA-03 set the location from the hint 'location missing' (BES-08)", () => {
  it("US-PHA-03 choosing a location and tapping sets it, the hint disappears and the page says what changed", async () => {
    const state = {
      hints: [noLocation],
      locate: async () => {
        state.hints = [];
        return response(200, { id: "e1", locationId: "s2" });
      },
    };
    const fetchFn = fakeServer(state);
    render(<HintsPage api="http://api" token={token} onOpen={noop} />);
    await userEvent.selectOptions(await screen.findByLabelText("Standort für „Bogenhanf“"), "s2");
    await userEvent.click(screen.getByRole("button", { name: "Standort setzen: Bogenhanf" }));
    expect((await screen.findByRole("status")).textContent).toContain(
      "„Bogenhanf“ steht jetzt am Standort „Flur“.",
    );
    expect(await screen.findByText(/Keine Hinweise/)).toBeTruthy();
    expect(screen.queryByText(noLocation.text)).toBeNull();
    expect(posts(fetchFn)).toHaveLength(1);
    expect(String(posts(fetchFn)[0]?.[0])).toBe("http://api/specimens/e1/location");
    expect(JSON.parse(String(posts(fetchFn)[0]?.[1]?.body))).toEqual({ locationId: "s2" });
  });

  it("US-PHA-03 the location is selected from the own ones, never typed, and nothing is sent before a choice", async () => {
    const fetchFn = fakeServer({ hints: [noLocation] });
    render(<HintsPage api="http://api" token={token} onOpen={noop} />);
    const select = await screen.findByLabelText("Standort für „Bogenhanf“");
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Standort wählen …", "Regal Süd", "Flur"]);
    expect(screen.queryByRole("textbox")).toBeNull();
    const button = screen.getByRole("button", { name: "Standort setzen: Bogenhanf" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(button);
    expect(posts(fetchFn)).toHaveLength(0);
  });

  it("US-PHA-03 a double tap sends one request while it runs", async () => {
    let release: (r: Response) => void = () => undefined;
    const fetchFn = fakeServer({
      hints: [noLocation],
      locate: () => new Promise<Response>((done) => (release = done)),
    });
    render(<HintsPage api="http://api" token={token} onOpen={noop} />);
    await userEvent.selectOptions(await screen.findByLabelText("Standort für „Bogenhanf“"), "s1");
    await userEvent.dblClick(screen.getByRole("button", { name: "Standort setzen: Bogenhanf" }));
    await vi.waitFor(() => expect(posts(fetchFn)).toHaveLength(1));
    release(new Response("{}", { status: 200 }));
    await vi.waitFor(() => expect(posts(fetchFn)).toHaveLength(1));
  });

  it("US-PHA-03 only the hint 'location missing' offers the choice, the zone hint keeps its link", async () => {
    fakeServer({ hints: [noLocation, noZone] });
    render(<HintsPage api="http://api" token={token} onOpen={noop} />);
    await screen.findByText(noZone.text);
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Standorte und Licht/ })).toBeTruthy();
  });

  it("US-PHA-03 without any location it says what to do first (P-09)", async () => {
    fakeServer({ hints: [noLocation], locations: [] });
    render(<HintsPage api="http://api" token={token} onOpen={noop} />);
    expect((await screen.findByText(/noch keinen Standort angelegt/)).textContent).toContain(
      "Standorte und Licht",
    );
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("US-PHA-03 a refusal stays visible and the hint stays (P-10)", async () => {
    const text = "Diesen Standort gibt es nicht.";
    fakeServer({
      hints: [noLocation],
      locate: () => response(404, { error: { code: "location.not_found", text } }),
    });
    render(<HintsPage api="http://api" token={token} onOpen={noop} />);
    await userEvent.selectOptions(await screen.findByLabelText("Standort für „Bogenhanf“"), "s1");
    await userEvent.click(screen.getByRole("button", { name: "Standort setzen: Bogenhanf" }));
    expect((await screen.findByRole("alert")).textContent).toContain(text);
    expect(screen.getByText(noLocation.text)).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("US-PHA-03 without sign-in the tap asks to sign in and sends nothing", async () => {
    let signedIn = true;
    const fetchFn = fakeServer({ hints: [noLocation] });
    render(
      <HintsPage
        api="http://api"
        token={async () => (signedIn ? "tok" : undefined)}
        onOpen={noop}
      />,
    );
    await userEvent.selectOptions(await screen.findByLabelText("Standort für „Bogenhanf“"), "s1");
    signedIn = false;
    await userEvent.click(screen.getByRole("button", { name: "Standort setzen: Bogenhanf" }));
    // The refusal by its code (ERROR_TEXTS) or, once the page has reloaded, the load error: both ask to sign in.
    expect((await screen.findByRole("alert")).textContent).toMatch(/Bitte melde dich/);
    expect(posts(fetchFn)).toHaveLength(0);
  });
});
