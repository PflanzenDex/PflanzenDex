// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ERROR_TEXTS } from "@pflanzendex/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CarePhasesPage } from "./care-phases-page";
import { confirmPhaseSwitch } from "../../shared/api/care-phases-api";

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
  nextChange: { date: "2027-03-16", phase: "growth", days: 120 },
});
const token = async () => "tok";

/**
 * Records the key of a request. A key that comes back with another request is refused (`idempotency.key_conflict`), the
 * same request is answered without a second write; a new key is not answered here.
 */
function keyCheck(requests: Map<string, string>, init: RequestInit | undefined, path: string) {
  const key = (init?.headers as Record<string, string> | undefined)?.["Idempotency-Key"] ?? "";
  if (key === "") return undefined;
  const request = `${init?.method ?? "GET"} ${path} ${String(init?.body ?? "")}`;
  const seen = requests.get(key);
  if (seen === undefined) {
    requests.set(key, request);
    return undefined;
  }
  return seen === request
    ? response(200, {})
    : response(409, { error: { code: "idempotency.key_conflict", text: "x" } });
}

/**
 * Fake server: `phases` is what GET /care-phases answers now, `confirm` answers the POST (and may change `phases`). It
 * enforces the repeat-guard key as the API does (US-QS-03): a key that comes back with another request is refused with
 * `idempotency.key_conflict`, and a repeat of the same request is answered without a second write.
 */
function fakeServer(state: {
  phases: ReturnType<typeof row>[];
  confirm: (body: { specimenIds: string[]; timeZone: string }) => Promise<Response>;
  /** The location writes of the undo, in the order they arrived (US-QS-32). */
  moves?: { specimenId: string; locationId: string }[];
  /** A plant whose location write is refused (US-QS-32, a failed undo). */
  failLocationFor?: string;
}) {
  const requests = new Map<string, string>();
  const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
    const path = new URL(String(url)).pathname;
    const refused = keyCheck(requests, init, path);
    if (refused) return refused;
    if (path === "/locations") return response(200, { locations: [living, cold] });
    if (path === "/care-phases" && (init?.method ?? "GET") === "GET")
      return response(200, { phases: state.phases });
    if (path === "/care-phases/confirm")
      return state.confirm(JSON.parse(String(init?.body)) as never);
    if (/^\/specimens\/[^/]+\/location$/.test(path) && init?.method === "POST") {
      const specimenId = path.split("/")[2] ?? "";
      const locationId = (JSON.parse(String(init.body)) as { locationId: string }).locationId;
      if (state.failLocationFor === specimenId)
        return response(409, { error: { code: "specimen.archived", text: "raw" } });
      state.moves?.push({ specimenId, locationId });
      state.phases = state.phases.map((p) =>
        p.specimenId === specimenId ? { ...p, locationId } : p,
      );
      return response(200, { id: specimenId, locationId });
    }
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
    const r = await confirmPhaseSwitch("http://api", "tok", ["e1", "e2"], {
      fetchFn: fetchFn,
      key: "test-key",
    });
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
    expect(
      await confirmPhaseSwitch("http://api", "tok", ["e1"], { fetchFn: fetchFn, key: "test-key" }),
    ).toMatchObject({
      ok: false,
      error: { code: "care.target_unknown" },
    });
  });
});

describe("US-PHA-03 'Umstellen' on the page of the care phases", () => {
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
    await userEvent.click(screen.getByRole("button", { name: "Umstellen: Bogenhanf" }));
    expect((await screen.findByRole("status")).textContent).toContain(
      "„Bogenhanf“ steht jetzt am Standort „Kühler Flur“.",
    );
    expect(await screen.findByText("Standort: Kühler Flur")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Umstellen/ })).toBeNull();
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
    const button = await screen.findByRole("button", { name: "Umstellen: Bogenhanf" });
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
    expect(screen.queryByRole("button", { name: /^Umstellen/ })).toBeNull();
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
      "2 Pflanzen stehen jetzt am Standort „Kühler Flur“.",
    );
    expect(screen.queryByRole("button", { name: /Alle 2 nach/ })).toBeNull();
  });

  it("US-PHA-03 · DS-49 a refusal stays visible with the text of its code, the list stays and nothing is claimed (P-10)", async () => {
    const text = ERROR_TEXTS["care.target_unknown"];
    fakeServer({
      phases: [row("e1", "Bogenhanf", "s1", "s2")],
      confirm: () => response(409, { error: { code: "care.target_unknown", text } }),
    });
    render(<CarePhasesPage api="http://api" token={token} />);
    await userEvent.click(await screen.findByRole("button", { name: "Umstellen: Bogenhanf" }));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(text)).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Standort: Wohnzimmer")).toBeTruthy();
  });

  it("US-PHA-03 after a refusal the list is loaded again, a stale row disappears and the error stays", async () => {
    const text = ERROR_TEXTS["specimen.archived"];
    const state = {
      phases: [row("e1", "Bogenhanf", "s1", "s2")],
      confirm: async () => {
        state.phases = []; // archived in the meantime
        return response(409, { error: { code: "specimen.archived", text } });
      },
    };
    fakeServer(state);
    render(<CarePhasesPage api="http://api" token={token} />);
    await userEvent.click(await screen.findByRole("button", { name: "Umstellen: Bogenhanf" }));
    expect((await screen.findByRole("alert")).textContent).toContain(text);
    await vi.waitFor(() => expect(screen.queryByText("Bogenhanf")).toBeNull());
    expect(screen.getByRole("alert").textContent).toContain(text);
  });

  it("US-PHA-03 without sign-in the tap asks to sign in and sends nothing", async () => {
    let signedIn = true;
    const fetchFn = fakeServer({
      phases: [row("e1", "Bogenhanf", "s1", "s2")],
      confirm: () => response(200, { specimens: [] }),
    });
    render(<CarePhasesPage api="http://api" token={async () => (signedIn ? "tok" : undefined)} />);
    const button = await screen.findByRole("button", { name: "Umstellen: Bogenhanf" });
    signedIn = false;
    await userEvent.click(button);
    // The refusal (by its code) is replaced by the load error of the reload that follows; both ask to sign in.
    expect((await screen.findByRole("alert")).textContent).toMatch(/melde dich (neu )?an/);
    expect(posts(fetchFn)).toHaveLength(0);
  });
});

describe("US-QS-32 the bulk move 'Alle n nach … umstellen' can be undone in place (SG-FEED-03)", () => {
  it("US-QS-32 the group keeps its rows for the 8 s, and its undo sits where its button was: 'Umgestellt · Rückgängig'", async () => {
    const state = {
      phases: [row("e1", "Bogenhanf", "s1", "s2"), row("e3", "Efeu", "s9", "s2")],
      confirm: async () => {
        state.phases = state.phases.map((p) => ({ ...p, locationId: p.targetLocationId }));
        return response(200, { specimens: [] });
      },
      moves: [] as { specimenId: string; locationId: string }[],
    };
    fakeServer(state);
    render(<CarePhasesPage api="http://api" token={token} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Alle 2 nach Kühler Flur umstellen" }),
    );
    const undo = await screen.findByRole("button", {
      name: "Rückgängig: 2 Pflanzen nach Kühler Flur",
    });
    expect(undo.closest("p")?.textContent).toBe("Umgestellt · Rückgängig");
    expect(screen.getByText("Bogenhanf")).toBeTruthy();
    expect(screen.getByText("Efeu")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Alle 2 nach Kühler Flur umstellen" })).toBeNull();
  });

  it("US-QS-32 the bulk undo restores each plant's own earlier location with the location write, and the group button returns", async () => {
    const state = {
      phases: [row("e1", "Bogenhanf", "s1", "s2"), row("e3", "Efeu", "s9", "s2")],
      confirm: async () => {
        state.phases = state.phases.map((p) => ({ ...p, locationId: p.targetLocationId }));
        return response(200, { specimens: [] });
      },
      moves: [] as { specimenId: string; locationId: string }[],
    };
    fakeServer(state);
    render(<CarePhasesPage api="http://api" token={token} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Alle 2 nach Kühler Flur umstellen" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Rückgängig: 2 Pflanzen nach Kühler Flur" }),
    );
    await screen.findByRole("button", { name: "Alle 2 nach Kühler Flur umstellen" });
    expect(state.moves).toEqual([
      { specimenId: "e1", locationId: "s1" },
      { specimenId: "e3", locationId: "s9" },
    ]);
    expect(screen.getByRole("status").textContent).toBe("Rückgängig gemacht.");
  });

  it("US-QS-32 after the 8 s the held rows let go: the group is shown as moved and no undo is left", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const state = {
        phases: [row("e1", "Bogenhanf", "s1", "s2"), row("e3", "Efeu", "s9", "s2")],
        confirm: async () => {
          state.phases = state.phases.map((p) => ({ ...p, locationId: p.targetLocationId }));
          return response(200, { specimens: [] });
        },
      };
      fakeServer(state);
      render(<CarePhasesPage api="http://api" token={token} />);
      fireEvent.click(
        await screen.findByRole("button", { name: "Alle 2 nach Kühler Flur umstellen" }),
      );
      await screen.findByRole("button", { name: "Rückgängig: 2 Pflanzen nach Kühler Flur" });
      act(() => vi.advanceTimersByTime(8000));
      expect(screen.queryByRole("button", { name: /^Rückgängig/ })).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Alle 2 nach Kühler Flur umstellen" }),
      ).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("US-QS-03 · US-QS-32 the bulk undo of two plants sends every plant under a key of its own", () => {
  it("US-QS-03 · US-QS-32 the key-enforcing server applies both moves: no plant after the first is refused as a key conflict", async () => {
    const state = {
      phases: [row("e1", "Bogenhanf", "s1", "s2"), row("e3", "Efeu", "s9", "s2")],
      confirm: async () => {
        state.phases = state.phases.map((p) => ({ ...p, locationId: p.targetLocationId }));
        return response(200, { specimens: [] });
      },
      moves: [] as { specimenId: string; locationId: string }[],
    };
    const fetchFn = fakeServer(state);
    render(<CarePhasesPage api="http://api" token={token} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Alle 2 nach Kühler Flur umstellen" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Rückgängig: 2 Pflanzen nach Kühler Flur" }),
    );
    await screen.findByRole("button", { name: "Alle 2 nach Kühler Flur umstellen" });
    const moveKeys = fetchFn.mock.calls
      .filter(([url]) => /\/specimens\/[^/]+\/location$/.test(new URL(String(url)).pathname))
      .map(([, init]) => (init?.headers as Record<string, string>)["Idempotency-Key"]);
    expect(moveKeys).toHaveLength(2);
    expect(new Set(moveKeys).size).toBe(2);
    expect(state.moves).toHaveLength(2);
    expect(screen.queryByText(/Dieser Schlüssel/)).toBeNull();
  });
});

describe("US-QS-32 a failed bulk undo releases its rows and keeps the refusal", () => {
  it("US-QS-32 the held rows let go, the list shows the reloaded state and the refusal stays on the page", async () => {
    const state = {
      phases: [row("e1", "Bogenhanf", "s1", "s2"), row("e3", "Efeu", "s9", "s2")],
      confirm: async () => {
        state.phases = state.phases.map((p) => ({ ...p, locationId: p.targetLocationId }));
        return response(200, { specimens: [] });
      },
      moves: [] as { specimenId: string; locationId: string }[],
      failLocationFor: "e3",
    };
    fakeServer(state);
    render(<CarePhasesPage api="http://api" token={token} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Alle 2 nach Kühler Flur umstellen" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Rückgängig: 2 Pflanzen nach Kühler Flur" }),
    );
    expect(await screen.findByText(/Diese Pflanze ist archiviert/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Rückgängig: 2 Pflanzen/ })).toBeNull();
    expect(state.moves).toEqual([{ specimenId: "e1", locationId: "s1" }]);
  });
});
