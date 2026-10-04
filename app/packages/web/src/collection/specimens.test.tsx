import { renderToString as render } from "react-dom/server";
import type { Species, Specimen } from "@pflanzendex/core";
import { describe, expect, it, vi } from "vitest";
import { createSpecimen } from "./specimens-api";
import { CreateForm } from "./create-form";
import { nameConflict } from "./text";

// React separates adjacent text parts with comments in server rendering; for text checks we remove them.
const renderToString = (e: Parameters<typeof render>[0]) => render(e).replaceAll("<!-- -->", "");
const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const species = {
  id: "a1",
  latinName: "Dracaena trifasciata",
  germanName: "Bogenhanf",
} as Species;
const locations = [
  { id: "s1", name: "Regal Süd", lightZoneId: null, kind: "indoor" as const },
  { id: "s2", name: "Balkon", lightZoneId: null, kind: "outdoor" as const },
];
const specimen = (extra: Partial<Specimen> = {}): Specimen => ({
  id: "e1",
  speciesId: "a1",
  name: "Bogenhanf",
  marker: null,
  locationId: null,
  status: "plant",
  caughtAt: "2026-10-03",
  createdAt: "2026-10-03T08:00:00Z",
  archivedAt: null,
  archivedReason: null,
  measurements: [],
  treatments: [],
  ...extra,
});

describe("US-BES-02 client of the specimen API", () => {
  it("creates with bearer token, the device's time zone and a fresh Idempotency-Key", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => response(201, specimen()));
    const r = await createSpecimen("http://api", "tok", { speciesId: "a1" }, fetchFn);
    expect(r).toMatchObject({ ok: true, value: { name: "Bogenhanf" } });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://api/specimens");
    expect(init?.method).toBe("POST");
    const header = init?.headers as Record<string, string>;
    expect(header["Authorization"]).toBe("Bearer tok");
    expect(header["Idempotency-Key"]).toBeTruthy();
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body["speciesId"]).toBe("a1");
    expect(body["timeZone"]).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it("a taken name stays an error with code and the existing specimens", async () => {
    const error = {
      code: "specimen.name_taken",
      text: "Gibt es schon.",
      data: { name: "Bogenhanf", existing: [{ id: "e1", name: "Bogenhanf" }] },
    };
    const fetchFn = vi.fn<typeof fetch>(async () => response(409, { error }));
    const r = await createSpecimen("http://api", "tok", { speciesId: "a1" }, fetchFn);
    expect(r).toMatchObject({ ok: false, error: { code: "specimen.name_taken" } });
    expect(!r.ok && nameConflict(r.error)?.existing).toEqual([{ id: "e1", name: "Bogenhanf" }]);
  });
});

describe('US-BES-02 form "Create specimen"', () => {
  const html = (extra: Partial<Parameters<typeof CreateForm>[0]> = {}) =>
    renderToString(
      <CreateForm
        species={species}
        siblings={[]}
        locations={locations}
        onSend={async () => null}
        onCancel={vi.fn()}
        {...extra}
      />,
    );

  it("shows the chosen species and the name fixed before saving", () => {
    const h = html();
    expect(h).toContain("Exemplar anlegen");
    expect(h).toContain("Dracaena trifasciata");
    expect(h).toContain("Name: Bogenhanf");
  });

  it("only the species is required: location and marker are free, location can be chosen from the own ones", () => {
    const h = html();
    expect(h).toContain("Standort noch unbekannt");
    expect(h).toContain("Regal Süd");
    expect(h).toContain("Balkon");
    expect(h).toContain("Kennzeichen (optional)");
    expect(h.split("<").filter((t) => t.includes("required"))).toEqual([]);
  });

  it("explains caught_at (today, local date) and names no invented location", () => {
    const h = html();
    expect(h).toContain("Gefangen am: heute");
    expect(h).toContain("Ohne Auswahl bleibt der Standort unbekannt");
  });

  it("with a taken name: error with the existing specimens and the prompt for a marker (P-09)", () => {
    const error = {
      code: "specimen.name_taken",
      text: "Ein Exemplar mit diesem Namen gibt es schon. Gib ein Kennzeichen an (zum Beispiel eine Farbe).",
      data: { name: "Bogenhanf", existing: [{ id: "e1", name: "Bogenhanf" }] },
    } as unknown as Parameters<typeof nameConflict>[0];
    const h = html({ errorStart: error });
    expect(h).toContain("Ein Exemplar mit diesem Namen gibt es schon. Gib ein Kennzeichen an");
    expect(h).toContain("Schon vorhanden: Bogenhanf");
    expect(h).toContain("heißt das neue Exemplar dann „Bogenhanf – Kennzeichen“");
  });
});
