// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CareProfileEntry, Layered } from "@pflanzendex/core";
import { CareProfileSection } from "./care-profile-page/care-profile-page";
import { loadCareProfiles, saveCareProfile } from "./care-profile/care-profile-api";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
const none = <T,>(): Layered<T> => ({
  catalog: null,
  own: null,
  effective: null,
  source: "unknown",
});
const living = { id: "l1", name: "Wohnzimmer", lightZoneId: "z2", kind: "indoor" };
const hall = { id: "l2", name: "Kühler Flur", lightZoneId: null, kind: "indoor" };
const zones = [
  { id: "z1", name: "Zone 1", luxCeiling: 5000, ppfd: null, sortOrder: 0 },
  { id: "z2", name: "Zone 2", luxCeiling: 15000, ppfd: null, sortOrder: 1 },
  { id: "z3", name: "Zone 3", luxCeiling: 30000, ppfd: null, sortOrder: 2 },
];

/** An entry as the API delivers it: the catalog says Zone 3 and 01.11. to 15.03., I deviate in nothing yet. */
const entry = (
  extra: Partial<CareProfileEntry["profile"]> = {},
  deviates = false,
): CareProfileEntry => ({
  speciesId: "s1",
  speciesName: "Bogenhanf",
  activeSpecimens: 2,
  wateringHint: "Alle zwei Wochen gießen",
  deviates,
  mergedInto: null,
  notice: null,
  profile: {
    growthLocation: none(),
    dormancyLocation: none(),
    lightZone: { catalog: "z3", own: null, effective: "z3", source: "catalog" },
    dormancy: {
      catalog: { from: "11-01", until: "03-15" },
      own: null,
      effective: { from: "11-01", until: "03-15" },
      source: "catalog",
    },
    wateringGrowthDays: none(),
    wateringDormancyDays: none(),
    ownHints: none(),
    ...extra,
  },
});

/** Fake server: reads the view, locations and zones; `PUT /care-profiles/<id>` is answered by `save`. */
function fakeServer(state: {
  entries: CareProfileEntry[];
  locations?: unknown[];
  save?: (body: Record<string, unknown>) => Promise<Response>;
}) {
  const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path === "/care-profiles") return response(200, { entries: state.entries });
    if (path === "/locations")
      return response(200, { locations: state.locations ?? [living, hall] });
    if (path === "/light-zones") return response(200, { zones });
    if (init?.method === "PUT" && path.startsWith("/care-profiles/"))
      return (state.save ?? (() => response(200, {})))(JSON.parse(String(init.body)));
    return response(404, {});
  });
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}
const puts = (fetchFn: ReturnType<typeof fakeServer>) =>
  fetchFn.mock.calls.filter(([, init]) => init?.method === "PUT");
const sent = (fetchFn: ReturnType<typeof fakeServer>) =>
  puts(fetchFn).map(([, init]) => JSON.parse(String(init?.body)) as unknown);
const open = () => render(<CareProfileSection api="http://api" token={token} speciesId="s1" />);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-BES-09 client of the care profile API", () => {
  it("US-BES-09 loads the view of the account", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => response(200, { entries: [entry()] }));
    const r = await loadCareProfiles("http://api", "tok", fetchFn);
    expect(r).toMatchObject({ ok: true, value: [{ speciesName: "Bogenhanf" }] });
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe("http://api/care-profiles");
  });

  it("US-BES-09 puts the changes with a fresh repeat-guard key; null is sent as null", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => response(200, { speciesId: "s 1" }));
    await saveCareProfile(
      "http://api",
      "tok",
      { speciesId: "s 1", changes: { growthLocationId: null, wateringGrowthDays: 7 } },
      fetchFn,
    );
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://api/care-profiles/s%201");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({
      growthLocationId: null,
      wateringGrowthDays: 7,
    });
    expect((init?.headers as Record<string, string>)["Idempotency-Key"]).toBeTruthy();
  });

  it("US-BES-09 an error of the API stays an error with code", async () => {
    const error = { code: "location.not_found", text: "Diesen Standort gibt es nicht." };
    const fetchFn = vi.fn<typeof fetch>(async () => response(404, { error }));
    expect(
      await saveCareProfile("http://api", "tok", { speciesId: "s1", changes: {} }, fetchFn),
    ).toMatchObject({ ok: false, error: { code: "location.not_found" } });
  });
});

describe("US-BES-09 the care profile page shows the catalog value and my deviation side by side", () => {
  it("US-BES-09 shows per species the catalog values and what I can deviate in, and says it is private", async () => {
    fakeServer({ entries: [entry()] });
    open();
    expect(await screen.findByRole("heading", { name: "Bogenhanf" })).toBeTruthy();
    expect(screen.getByText(/2 aktive Exemplare/)).toBeTruthy();
    expect(screen.getByText("Katalog: Zone 3")).toBeTruthy();
    expect(screen.getByText("Katalog: 01.11. bis 15.03.")).toBeTruthy();
    expect(screen.getAllByText("Katalog: unbekannt").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Hinweis der Art: Alle zwei Wochen gießen/)).toBeTruthy();
    expect(screen.getByText(/privat und nie Teil einer Freigabe/)).toBeTruthy();
  });

  it("US-BES-09 shows my deviation where there is one and marks it as mine", async () => {
    fakeServer({
      entries: [
        entry(
          {
            lightZone: { catalog: "z3", own: "z2", effective: "z2", source: "profile" },
            growthLocation: { catalog: null, own: "l1", effective: "l1", source: "profile" },
          },
          true,
        ),
      ],
    });
    open();
    const zone = (await screen.findByLabelText("Lichtzone für „Bogenhanf“")) as HTMLSelectElement;
    expect(zone.value).toBe("z2");
    expect(
      (screen.getByLabelText("Soll-Standort Wachstumsphase für „Bogenhanf“") as HTMLSelectElement)
        .value,
    ).toBe("l1");
    expect(screen.getByText("Meine Abweichung gilt")).toBeTruthy();
  });

  it("US-BES-09 the target location is selected from my locations, never typed (FR-PHA-03)", async () => {
    fakeServer({ entries: [entry()] });
    open();
    const select = await screen.findByLabelText("Soll-Standort Ruhephase für „Bogenhanf“");
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Katalog gilt", "Wohnzimmer", "Kühler Flur"]);
    const lightZone = screen.getByLabelText("Lichtzone für „Bogenhanf“");
    expect(
      within(lightZone)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Katalog gilt", "Zone 1", "Zone 2", "Zone 3"]);
    expect(screen.queryByRole("textbox", { name: /Standort/ })).toBeNull();
  });

  it("US-BES-09 without any location the page says to create one first (P-09)", async () => {
    fakeServer({ entries: [entry()], locations: [] });
    open();
    expect(
      await screen.findByText(
        /Lege zuerst in der Sammlung unter „Standorte verwalten“ einen Standort an/,
      ),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Soll-Standort Wachstumsphase für „Bogenhanf“")).toBeNull();
  });

  it("US-BES-09 without a species in the collection the page says what to do next (P-09)", async () => {
    fakeServer({ entries: [] });
    open();
    expect(await screen.findByText(/Du hast noch kein Exemplar dieser Art/)).toBeTruthy();
  });

  it("US-BES-09 without sign-in nothing is requested and the user is asked to sign in", async () => {
    const fetchFn = fakeServer({ entries: [entry()] });
    render(<CareProfileSection api="http://api" token={async () => undefined} speciesId="s1" />);
    expect(await screen.findByText(/melde dich neu an/)).toBeTruthy();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("US-BES-09 change my deviation", () => {
  it("US-BES-09 choosing a location and saving sends only the changed field and says what changed", async () => {
    const state = {
      entries: [entry()],
      save: async () => {
        state.entries = [
          entry(
            { growthLocation: { catalog: null, own: "l1", effective: "l1", source: "profile" } },
            true,
          ),
        ];
        return response(200, { speciesId: "s1" });
      },
    };
    const fetchFn = fakeServer(state);
    open();
    const save = await screen.findByRole("button", { name: "Speichern: Bogenhanf" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    await userEvent.selectOptions(
      screen.getByLabelText("Soll-Standort Wachstumsphase für „Bogenhanf“"),
      "l1",
    );
    await userEvent.click(save);
    expect((await screen.findByRole("status")).textContent).toContain(
      "Pflegeprofil für „Bogenhanf“ gespeichert.",
    );
    expect(sent(fetchFn)).toEqual([{ growthLocationId: "l1" }]);
    expect(String(puts(fetchFn)[0]?.[0])).toBe("http://api/care-profiles/s1");
    expect(
      (
        (await screen.findByLabelText(
          "Soll-Standort Wachstumsphase für „Bogenhanf“",
        )) as HTMLSelectElement
      ).value,
    ).toBe("l1");
  });

  it("US-BES-09 watering intervals and own hints are sent as numbers and text", async () => {
    const fetchFn = fakeServer({ entries: [entry()] });
    open();
    await userEvent.type(
      await screen.findByLabelText("Gießintervall Wachstumsphase (Tage) für „Bogenhanf“"),
      "7",
    );
    await userEvent.type(
      screen.getByLabelText("Eigene Hinweise für „Bogenhanf“"),
      "Im Winter trocken",
    );
    await userEvent.click(screen.getByRole("button", { name: "Speichern: Bogenhanf" }));
    await screen.findByRole("status");
    expect(sent(fetchFn)).toEqual([{ wateringGrowthDays: 7, ownHints: "Im Winter trocken" }]);
  });

  it("US-BES-09 dormancy from/until is chosen as month and day and sent as a pair MM-DD", async () => {
    const fetchFn = fakeServer({ entries: [entry()] });
    open();
    await userEvent.selectOptions(
      await screen.findByLabelText("Ruhephase von (Monat) für „Bogenhanf“"),
      "10",
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Ruhephase von (Tag) für „Bogenhanf“"),
      "15",
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Ruhephase bis (Monat) für „Bogenhanf“"),
      "2",
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Ruhephase bis (Tag) für „Bogenhanf“"),
      "28",
    );
    await userEvent.click(screen.getByRole("button", { name: "Speichern: Bogenhanf" }));
    await screen.findByRole("status");
    expect(sent(fetchFn)).toEqual([{ dormancyFrom: "10-15", dormancyUntil: "02-28" }]);
  });

  it("US-BES-09 half a dormancy period is not sent: the page says what is missing", async () => {
    const fetchFn = fakeServer({ entries: [entry()] });
    open();
    await userEvent.selectOptions(
      await screen.findByLabelText("Ruhephase von (Monat) für „Bogenhanf“"),
      "10",
    );
    await userEvent.click(screen.getByRole("button", { name: "Speichern: Bogenhanf" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Gib Beginn und Ende der Ruhephase vollständig an",
    );
    expect(puts(fetchFn)).toHaveLength(0);
  });

  it("US-BES-09 'Auf Katalog zurücksetzen' per field sends null for exactly that field", async () => {
    const own = entry(
      {
        lightZone: { catalog: "z3", own: "z2", effective: "z2", source: "profile" },
        wateringGrowthDays: { catalog: null, own: 7, effective: 7, source: "profile" },
      },
      true,
    );
    const fetchFn = fakeServer({ entries: [own] });
    open();
    const reset = await screen.findByRole("button", {
      name: "Auf Katalog zurücksetzen: Lichtzone (Bogenhanf)",
    });
    await userEvent.click(reset);
    expect((await screen.findByRole("status")).textContent).toContain(
      "„Lichtzone“ für „Bogenhanf“ gilt wieder nach Katalog.",
    );
    expect(sent(fetchFn)).toEqual([{ lightZoneId: null }]);
  });

  it("US-BES-09 a field without deviation has nothing to reset: the button is disabled", async () => {
    fakeServer({ entries: [entry()] });
    open();
    const reset = await screen.findByRole("button", {
      name: "Auf Katalog zurücksetzen: Lichtzone (Bogenhanf)",
    });
    expect((reset as HTMLButtonElement).disabled).toBe(true);
  });

  it("US-BES-09 resetting the dormancy period resets from and until together", async () => {
    const own = entry(
      {
        dormancy: {
          catalog: { from: "11-01", until: "03-15" },
          own: { from: "10-15", until: "02-28" },
          effective: { from: "10-15", until: "02-28" },
          source: "profile",
        },
      },
      true,
    );
    const fetchFn = fakeServer({ entries: [own] });
    open();
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Auf Katalog zurücksetzen: Ruhephase (Bogenhanf)",
      }),
    );
    await screen.findByRole("status");
    expect(sent(fetchFn)).toEqual([{ dormancyFrom: null, dormancyUntil: null }]);
  });

  it("US-BES-09 a refusal stays visible with the text of the error (P-10)", async () => {
    fakeServer({
      entries: [entry()],
      save: () =>
        response(404, {
          error: { code: "location.not_found", text: "Diesen Standort gibt es nicht." },
        }),
    });
    open();
    await userEvent.selectOptions(
      await screen.findByLabelText("Soll-Standort Ruhephase für „Bogenhanf“"),
      "l2",
    );
    await userEvent.click(screen.getByRole("button", { name: "Speichern: Bogenhanf" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Diesen Standort gibt es nicht.",
    );
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("US-BES-09 a double tap on save sends one request", async () => {
    let finish: (r: Response) => void = () => undefined;
    const fetchFn = fakeServer({
      entries: [entry()],
      save: () => new Promise<Response>((resolve) => (finish = resolve)),
    });
    open();
    await userEvent.selectOptions(
      await screen.findByLabelText("Soll-Standort Wachstumsphase für „Bogenhanf“"),
      "l1",
    );
    const save = screen.getByRole("button", { name: "Speichern: Bogenhanf" });
    await userEvent.dblClick(save);
    finish(new Response("{}", { status: 200 }));
    await screen.findByRole("status");
    expect(puts(fetchFn)).toHaveLength(1);
  });
});

describe("US-BES-10 a care profile kept on a merged proposal is shown, not editable (P-10)", () => {
  it("US-BES-10 shows the notice with the next action and my kept values, without a form", async () => {
    const kept: CareProfileEntry = {
      ...entry(
        {
          ownHints: {
            catalog: null,
            own: "Mein alter Hinweis",
            effective: "Mein alter Hinweis",
            source: "profile",
          },
        },
        true,
      ),
      speciesId: "gone",
      speciesName: "Dein zusammengeführter Vorschlag",
      activeSpecimens: 0,
      mergedInto: { speciesId: "s1", speciesName: "Bogenhanf" },
      notice: {
        text: "Dein Vorschlag wurde mit „Bogenhanf“ zusammengeführt.",
        nextAction:
          "Öffne das Pflegeprofil von „Bogenhanf“ und übernimm von Hand, was du behalten willst.",
      },
    };
    fakeServer({ entries: [entry(), kept] });
    open();
    expect(
      await screen.findByRole("heading", { name: "Dein zusammengeführter Vorschlag" }),
    ).toBeTruthy();
    expect(screen.getByText(/zusammengeführt\./)).toBeTruthy();
    expect(screen.getByText(/übernimm von Hand/)).toBeTruthy();
    expect(screen.getByText("Mein alter Hinweis")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Speichern/ })).toHaveLength(1);
  });
});
