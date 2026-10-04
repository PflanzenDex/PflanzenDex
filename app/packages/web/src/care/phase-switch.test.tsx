// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CarePhasesPage } from "./CarePhasesPage";
import { confirmPhaseSwitch } from "./care-phases-api";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const living = { id: "s1", name: "Wohnzimmer", lightZoneId: null, kind: "indoor" };
const cold = { id: "s2", name: "Kühler Flur", lightZoneId: null, kind: "indoor" };
const row = (
  id: string,
  name: string,
  locationId: string | null,
  targetLocationId: string | null,
) => ({
  specimenId: id,
  name,
  speciesId: "a1",
  phase: "dormancy",
  locationId,
  targetLocationId,
});
const token = async () => "tok";

/** Fake server: `phases` is what GET /care-phases answers now, `confirm` answers the POST (and may change `phases`). */
function fakeServer(state: {
  phases: ReturnType<typeof row>[];
  confirm: (body: { specimenIds: string[]; timeZone: string }) => Promise<Response>;
}) {
  const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path === "/locations") return response(200, { locations: [living, cold] });
    if (path === "/care-phases" && (init?.method ?? "GET") === "GET")
      return response(200, { phases: state.phases });
    if (path === "/care-phases/confirm")
      return state.confirm(JSON.parse(String(init?.body)) as never);
    return response(404, {});
  });
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}
const posts = (fetchFn: ReturnType<typeof fakeServer>) =>
  fetchFn.mock.calls.filter(([url]) => String(url).endsWith("/care-phases/confirm"));
const sent = (fetchFn: ReturnType<typeof fakeServer>) =>
  JSON.parse(String(posts(fetchFn)[0]?.[1]?.body)) as { specimenIds: string[] };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-PHA-03 client of the confirm API", () => {
  it("US-PHA-03 posts the IDs and the time zone of the device with a fresh repeat-guard key", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      response(200, { specimens: [{ specimenId: "e1", locationId: "s2", changed: true }] }),
    );
    const r = await confirmPhaseSwitch("http://api", "tok", ["e1", "e2"], fetchFn);
    expect(r).toMatchObject({ ok: true, value: [{ specimenId: "e1", changed: true }] });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://api/care-phases/confirm");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      specimenIds: ["e1", "e2"],
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    const headers = init?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer tok");
    expect(headers["Idempotency-Key"]).toBeTruthy();
  });

  it("US-PHA-03 an error of the API stays an error with code", async () => {
    const error = { code: "care.target_unknown", text: "Kein Soll-Standort." };
    const fetchFn = vi.fn<typeof fetch>(async () => response(409, { error }));
    expect(await confirmPhaseSwitch("http://api", "tok", ["e1"], fetchFn)).toMatchObject({
      ok: false,
      error: { code: "care.target_unknown" },
    });
  });
});

describe("US-PHA-03 'Jetzt umgestellt' on the page of the care phases", () => {
  it("US-PHA-03 a tap sets the specimen, the row updates at once and the page says what changed", async () => {
    const state = {
      phases: [row("e1", "Bogenhanf", "s1", "s2")],
      confirm: async () => {
        state.phases = [row("e1", "Bogenhanf", "s2", "s2")];
        return response(200, {
          specimens: [{ specimenId: "e1", locationId: "s2", changed: true }],
        });
      },
    };
    const fetchFn = fakeServer(state);
    render(<CarePhasesPage api="http://api" token={token} />);
    expect(await screen.findByText("Standort: Wohnzimmer")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Jetzt umgestellt: Bogenhanf" }));
    expect((await screen.findByRole("status")).textContent).toContain(
      "„Bogenhanf“ steht jetzt am Standort „Kühler Flur“.",
    );
    expect(await screen.findByText("Standort: Kühler Flur")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Jetzt umgestellt/ })).toBeNull();
    expect(posts(fetchFn)).toHaveLength(1);
    expect(sent(fetchFn).specimenIds).toEqual(["e1"]);
  });

  it("US-PHA-03 a double tap sends one request: the button is blocked while it runs", async () => {
    let release: (r: Response) => void = () => undefined;
    const state = {
      phases: [row("e1", "Bogenhanf", "s1", "s2")],
      confirm: () => new Promise<Response>((done) => (release = done)),
    };
    const fetchFn = fakeServer(state);
    render(<CarePhasesPage api="http://api" token={token} />);
    const button = await screen.findByRole("button", { name: "Jetzt umgestellt: Bogenhanf" });
    await userEvent.dblClick(button);
    await vi.waitFor(() => expect(posts(fetchFn)).toHaveLength(1));
    expect((button as HTMLButtonElement).disabled).toBe(true);
    release(new Response(JSON.stringify({ specimens: [] }), { status: 200 }));
    await vi.waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    expect(posts(fetchFn)).toHaveLength(1);
  });

  it("US-PHA-03 a specimen at its target, or without a known target, has no button (P-08)", async () => {
    fakeServer({
      phases: [row("e1", "Am Ziel", "s2", "s2"), row("e2", "Ohne Ziel", "s1", null)],
      confirm: () => response(500, {}),
    });
    render(<CarePhasesPage api="http://api" token={token} />);
    expect(await screen.findByText("Am Ziel")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /umgestellt/ })).toBeNull();
    expect(screen.getByText("Soll-Standort: unbekannt")).toBeTruthy();
  });

  it("US-PHA-03 specimens with the same target are confirmed in one step", async () => {
    const state = {
      phases: [
        row("e1", "Bogenhanf", "s1", "s2"),
        row("e2", "Aloe", null, "s2"),
        row("e3", "Efeu", "s2", "s2"),
        row("e4", "Kaktus", "s2", "s1"),
      ],
      confirm: async () => {
        state.phases = state.phases.map((p) => ({ ...p, locationId: p.targetLocationId }));
        return response(200, { specimens: [] });
      },
    };
    const fetchFn = fakeServer(state);
    render(<CarePhasesPage api="http://api" token={token} />);
    const all = await screen.findByRole("button", { name: "Alle 2 nach Kühler Flur umstellen" });
    expect(screen.queryByRole("button", { name: /Alle 1 nach/ })).toBeNull();
    await userEvent.click(all);
    await vi.waitFor(() => expect(posts(fetchFn)).toHaveLength(1));
    expect(sent(fetchFn).specimenIds).toEqual(["e1", "e2"]);
    expect((await screen.findByRole("status")).textContent).toContain(
      "2 Exemplare stehen jetzt am Standort „Kühler Flur“.",
    );
    expect(screen.queryByRole("button", { name: /Alle 2 nach/ })).toBeNull();
  });

  it("US-PHA-03 a refusal stays visible, the list stays and nothing is claimed (P-10)", async () => {
    const text = "Für dieses Exemplar ist noch kein Soll-Standort bekannt.";
    fakeServer({
      phases: [row("e1", "Bogenhanf", "s1", "s2")],
      confirm: () => response(409, { error: { code: "care.target_unknown", text } }),
    });
    render(<CarePhasesPage api="http://api" token={token} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Jetzt umgestellt: Bogenhanf" }),
    );
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(text)).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Standort: Wohnzimmer")).toBeTruthy();
  });

  it("US-PHA-03 without sign-in the tap asks to sign in and sends nothing", async () => {
    let signedIn = true;
    const fetchFn = fakeServer({
      phases: [row("e1", "Bogenhanf", "s1", "s2")],
      confirm: () => response(200, { specimens: [] }),
    });
    render(<CarePhasesPage api="http://api" token={async () => (signedIn ? "tok" : undefined)} />);
    const button = await screen.findByRole("button", { name: "Jetzt umgestellt: Bogenhanf" });
    signedIn = false;
    await userEvent.click(button);
    expect((await screen.findByRole("alert")).textContent).toContain("Bitte melde dich neu an.");
    expect(posts(fetchFn)).toHaveLength(0);
  });
});
