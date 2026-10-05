import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "../kernel";
import { renderToString as render } from "react-dom/server";
import type { MeasurementView, MeasurementRow } from "@pflanzendex/core";
import { describe, expect, it, vi } from "vitest";
import { measurementSchema, toMeasurementInput } from "./schemas";
import { MeasurementHeader } from "./measurement-header";
import { MeasureForm } from "./measure-form";
import { MeasurePage } from "./MeasurePage";
import { MeasurementList } from "./measurement-list";
import { recordMeasurement, loadMeasurementView } from "./api/measurements-api";

// React separates adjacent text parts with comments in server rendering; for text checks we remove them.
const renderToString = (e: Parameters<typeof render>[0]) => render(e).replaceAll("<!-- -->", "");
const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const measurement = (extra: Partial<MeasurementRow> = {}): MeasurementRow => ({
  id: "m1",
  specimenId: "e1",
  date: "2026-10-03",
  value: 12.5,
  quality: "healthy",
  note: null,
  ratedBy: "keeper",
  ...extra,
});
const view = (extra: Partial<MeasurementView> = {}): MeasurementView => ({
  specimenId: "e1",
  growthMeasure: "rosette_diameter",
  measurements: [],
  last: null,
  lastRating: null,
  ...extra,
});
/** The schema decides; the first message it carries is what the form shows under the field. */
const checkInput = (f: Record<string, string>) => {
  const r = measurementSchema.safeParse(f);
  return r.success
    ? { ok: true as const, input: toMeasurementInput(r.data) }
    : { ok: false as const, text: r.error.issues[0]?.message ?? "" };
};
const fields = (extra: Record<string, string> = {}) => ({
  value: "12,5",
  date: "2026-10-03",
  quality: "healthy",
  note: "",
  ...extra,
});

describe("US-WAC-01 client of the measure API", () => {
  it("records with bearer token, time zone of the device and a fresh Idempotency-Key", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => response(201, measurement()));
    const r = await recordMeasurement({ api: "http://api", token: "tok", fetchFn }, "e1", {
      value: 12.5,
      quality: "healthy",
    });
    expect(r).toMatchObject({ ok: true, value: { value: 12.5 } });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://api/specimens/e1/measurements");
    expect(init?.method).toBe("POST");
    const header = init?.headers as Record<string, string>;
    expect(header["Authorization"]).toBe("Bearer tok");
    expect(header["Idempotency-Key"]).toBeTruthy();
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ value: 12.5, quality: "healthy" });
    expect(body["timeZone"]).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it("an error of the API stays an error with code and text", async () => {
    const error = { code: "specimen.not_found", text: "Das Exemplar gibt es nicht." };
    const fetchFn = vi.fn<typeof fetch>(async () => response(404, { error }));
    const r = await recordMeasurement({ api: "http://api", token: "tok", fetchFn }, "e1", {
      value: 1,
      quality: "healthy",
    });
    expect(r).toMatchObject({ ok: false, error: { code: "specimen.not_found" } });
  });

  it("loads the view of a specimen", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => response(200, view()));
    const r = await loadMeasurementView("http://api", "tok", "e1", fetchFn);
    expect(r).toMatchObject({ ok: true, value: { growthMeasure: "rosette_diameter" } });
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe("http://api/specimens/e1/measurements");
  });
});

describe("US-WAC-01 checking the input before sending", () => {
  it("accepts numbers with comma or point in the step 0.5 and builds the input", () => {
    expect(checkInput(fields())).toEqual({
      ok: true,
      input: { value: 12.5, quality: "healthy", date: "2026-10-03" },
    });
    expect(
      checkInput(fields({ value: " 7.5 ", note: " Neuer Trieb ", quality: "etiolated" })),
    ).toMatchObject({
      ok: true,
      input: { value: 7.5, quality: "etiolated", note: "Neuer Trieb" },
    });
  });

  it.each(["", "abc", "-1", "-0,5", "1e3", "12,3", "1,2,3", "20000"])(
    "rejects %j and names what to do",
    (value) => {
      const r = checkInput(fields({ value }));
      expect(r.ok).toBe(false);
      expect(!r.ok && r.text).toMatch(/Zahl|Schritten/);
    },
  );

  it("rejects an unknown quality", () => {
    expect(checkInput(fields({ quality: "super" })).ok).toBe(false);
  });
});

describe("US-WAC-01 Ansicht „Messen“", () => {
  it('shows "Was messen?", last measurement and last rating', () => {
    const m = measurement({ quality: "etiolated" });
    const html = renderToString(
      <MeasurementHeader view={view({ measurements: [m], last: m, lastRating: "etiolated" })} />,
    );
    expect(html).toContain("Was messen?");
    expect(html).toContain("Rosettendurchmesser");
    expect(html).toContain("12,5 cm am 03.10.2026");
    expect(html).toContain("Vergeilt/dünn");
  });

  it('without measurement: "noch keine Messung", and without species the measure stays "unknown" (P-08)', () => {
    const html = renderToString(<MeasurementHeader view={view({ growthMeasure: null })} />);
    expect(html).toContain("noch keine Messung");
    expect(html).toContain("noch keine Bewertung");
    expect(html).toContain("unbekannt");
  });

  it("the course names value, date, quality and note; when empty it says what to do (P-09)", () => {
    const list = renderToString(
      <MeasurementList
        measurements={[measurement({ note: "nach dem Umtopfen" })]}
        onAdd={() => undefined}
      />,
    );
    expect(list).toContain("12,5 cm · 03.10.2026");
    expect(list).toContain("Gesund");
    expect(list).toContain("nach dem Umtopfen");
    expect(renderToString(<MeasurementList measurements={[]} onAdd={() => undefined} />)).toContain(
      "Trage oben den ersten Messwert ein",
    );
  });

  it("the form has number, date, quality (healthy preset), note and says that the photo is missing", () => {
    const html = renderToString(<MeasureForm unit="cm" onSend={async () => null} />);
    expect(html).toContain("Messwert (cm, in Schritten von 0,5)");
    expect(html).toMatch(/<input[^>]*type="date"[^>]*>/);
    expect(html).toMatch(/<input[^>]*value="\d{4}-\d{2}-\d{2}"[^>]*>/);
    expect(html).toMatch(/<option value="healthy" selected/);
    expect(html).toContain("Vergeilt/dünn");
    expect(html).toContain("Notiz (optional)");
    expect(html).toContain("Ein Foto kannst du hier noch nicht hinzufügen.");
  });

  it('the page shows "wird geladen" first and offers the way back', () => {
    const html = renderToString(
      <QueryClientProvider client={createQueryClient()}>
        <MeasurePage
          api="http://api"
          token={async () => "tok"}
          specimen={{ id: "e1", name: "Bogenhanf" }}
          onBack={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect(html).toContain("Messen: Bogenhanf");
    expect(html).toContain("Messungen werden geladen");
    expect(html).toContain("Zurück zum Bestand");
  });
});
