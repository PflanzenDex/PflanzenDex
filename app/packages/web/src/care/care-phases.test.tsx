import { renderToString as render } from "react-dom/server";
import type { LightLocation, PhasesRow } from "@pflanzendex/core";
import { describe, expect, it, vi } from "vitest";
import { PhasesList } from "./phases-list";
import { loadCarePhases } from "./api/care-phases-api";

const renderToString = (e: Parameters<typeof render>[0]) => render(e).replaceAll("<!-- -->", "");
const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const locations: LightLocation[] = [
  { id: "s1", name: "Regal Süd", lightZoneId: null, kind: "indoor" },
];
const row = (extra: Partial<PhasesRow> = {}): PhasesRow => ({
  specimenId: "e1",
  name: "Bogenhanf",
  speciesId: "a1",
  phase: "dormancy",
  locationId: "s1",
  targetLocationId: null,
  nextChange: { date: "2027-03-16", phase: "growth", days: 120 },
  ...extra,
});

describe("US-PHA-01 client of the care phases API", () => {
  it("US-PHA-01 asks with bearer token and the time zone of the device", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => response(200, { phases: [row()] }));
    const r = await loadCarePhases("http://api", "tok", fetchFn);
    expect(r).toMatchObject({ ok: true, value: [{ specimenId: "e1" }] });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(String(url)).toBe(`http://api/care-phases?timeZone=${encodeURIComponent(zone)}`);
    expect((init?.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok");
  });

  it("US-PHA-01 an error of the API stays an error with code", async () => {
    const error = { code: "input.invalid", text: "Die Eingabe ist ungültig." };
    const fetchFn = vi.fn<typeof fetch>(async () => response(400, { error }));
    expect(await loadCarePhases("http://api", "tok", fetchFn)).toMatchObject({
      ok: false,
      error: { code: "input.invalid" },
    });
  });
});

describe("US-PHA-01 list of the care phases", () => {
  it("US-PHA-01 shows phase, location and unknown target location per specimen (P-08)", () => {
    const h = renderToString(<PhasesList rows={[row()]} locations={locations} />);
    expect(h).toContain("Bogenhanf");
    expect(h).toContain("Soll-Phase heute: Ruhephase");
    expect(h).toContain("Standort: Regal Süd");
    expect(h).toContain("Soll-Standort: unbekannt");
  });

  it("US-PHA-01 growth phase is named as such", () => {
    const h = renderToString(<PhasesList rows={[row({ phase: "growth" })]} locations={[]} />);
    expect(h).toContain("Soll-Phase heute: Wachstumsphase");
    expect(h).toContain("Standort: unbekannt");
  });

  it("US-PHA-01 empty list says what to do (P-09)", () => {
    const h = renderToString(<PhasesList rows={[]} locations={[]} />);
    expect(h).toContain("Ruhephasen-Zeitraum");
    expect(h).toContain("Lege im Bestand ein Exemplar");
  });
});

describe("US-PHA-04 next phase change in the list", () => {
  const show = (nextChange: PhasesRow["nextChange"]) =>
    renderToString(<PhasesList rows={[row({ nextChange })]} locations={locations} />);

  it("US-PHA-04 a change today says 'heute'", () => {
    expect(show({ date: "2026-11-01", phase: "dormancy", days: 0 })).toContain(
      "Nächster Wechsel zur Ruhephase: heute",
    );
  });

  it("US-PHA-04 up to 14 days ahead: in N days with the date", () => {
    expect(show({ date: "2026-10-06", phase: "growth", days: 1 })).toContain(
      "Nächster Wechsel zur Wachstumsphase: in 1 Tag (06.10.2026)",
    );
    expect(show({ date: "2026-10-19", phase: "dormancy", days: 14 })).toContain(
      "Nächster Wechsel zur Ruhephase: in 14 Tagen (19.10.2026)",
    );
  });

  it("US-PHA-04 more than 14 days ahead: only the date", () => {
    const h = show({ date: "2026-10-20", phase: "dormancy", days: 15 });
    expect(h).toContain("Nächster Wechsel zur Ruhephase: 20.10.2026");
    expect(h).not.toContain("in 15 Tagen");
  });

  it("US-PHA-04 without a change in this and the next year it says so and what to check (P-08, P-09)", () => {
    const h = show(null);
    expect(h).toContain("Nächster Phasenwechsel: keiner in diesem und im nächsten Jahr.");
    expect(h).toContain("Prüfe den Ruhephasen-Zeitraum im Pflegeprofil der Art.");
  });
});
