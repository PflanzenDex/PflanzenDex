// @vitest-environment jsdom
import { cleanup, render as rtl, screen } from "@testing-library/react";
import { renderToString as render } from "react-dom/server";
import type { SpecimenCard } from "@pflanzendex/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CollectionList } from "./collection-list/collection-list";
import { loadCards } from "./cards-api";

// React separates adjacent text parts with comments in server rendering; for text checks we remove them.
const renderToString = (e: Parameters<typeof render>[0]) => render(e).replaceAll("<!-- -->", "");
const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const card = (extra: Partial<SpecimenCard> = {}): SpecimenCard => ({
  id: "e1",
  name: "Bogenhanf",
  speciesId: "a1",
  marker: null,
  speciesName: "Bogenhanf",
  status: "plant",
  location: "Regal Süd",
  lightZone: "Zone 3",
  caughtAt: "2026-09-01",
  photo: null,
  lastMeasurement: null,
  treatment: null,
  moreTreatments: 0,
  ...extra,
});
const ACCESS = { api: "http://api", token: async () => "tok" };
const html = (cards: SpecimenCard[]) =>
  renderToString(<CollectionList cards={cards} onSpeciesChoose={vi.fn()} photoAccess={ACCESS} />);

describe("US-BES-06 client of the cards API", () => {
  it("loads the cards with bearer token and the time zone of the device", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => response(200, { cards: [card()] }));
    const r = await loadCards("http://api", "tok", fetchFn);
    expect(r).toMatchObject({ ok: true, value: [{ id: "e1" }] });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(String(url)).toBe(`http://api/specimens/cards?timeZone=${encodeURIComponent(timeZone)}`);
    expect((init?.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok");
  });

  it("a server error stays an error with code, no empty list (P-10)", async () => {
    const error = { code: "input.invalid", text: "Ungültig." };
    const fetchFn = vi.fn<typeof fetch>(async () => response(400, { error }));
    expect(await loadCards("http://api", "tok", fetchFn)).toMatchObject({
      ok: false,
      error: { code: "input.invalid" },
    });
  });
});

describe("US-BES-06 Karte: Inhalt", () => {
  it("shows name, species, light zone, status and location", () => {
    const h = html([card()]);
    expect(h).toContain("Bogenhanf");
    expect(h).toContain("Art: Bogenhanf");
    expect(h).toContain("Lichtzone: Zone 3");
    expect(h).toContain("Status: Pflanze");
    expect(h).toContain("Standort: Regal Süd");
  });

  it('missing values are called "unknown", nothing is invented (P-08)', () => {
    const h = html([card({ speciesName: null, location: null, lightZone: null })]);
    expect(h).toContain("Art: unbekannt");
    expect(h).toContain("Lichtzone: unbekannt");
    expect(h).toContain("Standort: unbekannt");
  });

  it("shows the levels of the status in words", () => {
    expect(html([card({ status: "cutting" })])).toContain("Status: Steckling");
    expect(html([card({ status: "archived" })])).toContain("Status: Archiviert");
  });

  it("without a photo a placeholder with text is shown, not just an image", () => {
    const h = html([card()]);
    expect(h).toContain("Noch kein Foto");
    expect(h).not.toContain("<img");
  });
});

describe("US-WAC-05 the latest photo on the card is private (P-05)", () => {
  const withPhoto = card({
    photo: { url: "/specimens/e1/measurements/m1/photo", date: "2026-09-28" },
  });
  const show = () =>
    rtl(<CollectionList cards={[withPhoto]} onSpeciesChoose={vi.fn()} photoAccess={ACCESS} />);
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:card");
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("fetches the photo with the token and shows it as a link that opens it large, with description and date", async () => {
    const fetchFn = vi.fn<typeof fetch>(
      async () => new Response(new Uint8Array([1]), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchFn);
    show();
    const img = await screen.findByRole("img", { name: "Foto von Bogenhanf vom 28.09.2026" });
    expect(img.getAttribute("src")).toBe("blob:card");
    expect(img.closest("a")?.getAttribute("href")).toBe("blob:card");
    expect(screen.getByRole("link", { name: "Foto von Bogenhanf groß öffnen" })).toBeTruthy();
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://api/specimens/e1/measurements/m1/photo");
    expect((init?.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok");
  });

  it("says that it is loading, and why when the photo is gone (German text of the code)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        response(404, { error: { code: "measurement.photo_not_found", text: "raw" } }),
      ),
    );
    show();
    expect(screen.getByText("Lädt …")).toBeTruthy();
    expect(await screen.findByText("Zu dieser Messung gibt es kein Foto.")).toBeTruthy();
  });
});

describe("US-BES-06 Karte: letzte Messung", () => {
  it('without measurement: "noch keine Messung"', () => {
    expect(html([card()])).toContain("noch keine Messung");
  });

  it("shows value, quality and date of the last measurement; the value has the unit cm (US-WAC-01)", () => {
    const h = html([
      card({
        lastMeasurement: { date: "2026-10-01", value: 12.5, quality: "healthy", note: null },
      }),
    ]);
    expect(h).toContain("Letzte Messung: ");
    expect(h).toContain("12,5 cm");
    expect(h).toContain(">Gesund</strong> am 01.10.2026");
    expect(h).not.toContain("noch keine Messung");
  });

  it("a whole value is shown without a decimal place", () => {
    const h = html([
      card({ lastMeasurement: { date: "2026-10-01", value: 14, quality: "healthy", note: null } }),
    ]);
    expect(h).toContain("14 cm");
  });

  it("etiolated/thin is never a success: warning class, no success word, hint to the success criteria", () => {
    const h = html([
      card({
        lastMeasurement: { date: "2026-10-01", value: 12.5, quality: "etiolated", note: null },
      }),
    ]);
    expect(h).toContain("Letzte Messung: ");
    expect(h).toContain(">Vergeilt/dünn</strong> am 01.10.2026");
    expect(h).toContain("kein Erfolgssignal");
    expect(h).toContain('data-quality="etiolated"');
    expect(h).not.toContain('data-quality="healthy"');
  });

  it("the note is collapsible (closed at first) and missing when there is none", () => {
    const using = html([
      card({
        lastMeasurement: {
          date: "2026-10-01",
          value: 12.5,
          quality: "healthy",
          note: "Neues Blatt.",
        },
      }),
    ]);
    expect(using).toMatch(/<details(?![^>]*\sopen)[^>]*>\s*<summary[^>]*>Notiz/);
    expect(using).toContain("Neues Blatt.");
    const without = html([
      card({
        lastMeasurement: { date: "2026-10-01", value: 12.5, quality: "healthy", note: null },
      }),
    ]);
    expect(without).not.toContain("<details");
  });
});

describe("US-BES-06 Karte: offene Behandlung", () => {
  const treatment = (text: string, kind: "overdue" | "today" | "soon", days: number) => ({
    reason: "Neem spritzen",
    dueDate: { kind, days, text },
  });

  it('without open treatment: "keine offene Behandlung"', () => {
    expect(html([card()])).toContain("keine offene Behandlung");
  });

  it("shows reason and due date, overdue items are highlighted", () => {
    const h = html([card({ treatment: treatment("überfällig seit 3 Tg.", "overdue", 3) })]);
    expect(h).toContain("Neem spritzen");
    expect(h).toContain("überfällig seit 3 Tg.");
    expect(h).toContain('data-due="overdue"');
    const today = html([card({ treatment: treatment("heute fällig", "today", 0) })]);
    expect(today).toContain("heute fällig");
    const soon = html([card({ treatment: treatment("in 2 Tg.", "soon", 2) })]);
    expect(soon).toContain("in 2 Tg.");
    expect(soon).not.toContain('data-due="overdue"');
  });

  it('with several "+N weitere" is shown, with one it is not', () => {
    const b = treatment("in 2 Tg.", "soon", 2);
    expect(html([card({ treatment: b, moreTreatments: 2 })])).toContain("+2 weitere");
    expect(html([card({ treatment: b })])).not.toContain("more");
  });
});

describe("US-BES-06 grid and operation", () => {
  it("a grid of list items, one card per specimen, with a heading per card", () => {
    const h = html([card(), card({ id: "e2", name: "Aloe" })]);
    expect(h.match(/<li /g)).toHaveLength(2);
    expect(h).toContain("<ul ");
    expect(h).toContain("<h2");
  });

  it("the grid adapts to the width: one to two columns on the phone, more on wide screens", () => {
    const h = html([card()]);
    expect(h).toContain("grid-cols-1");
    expect(h).toContain("sm:grid-cols-2");
    expect(h).toContain("lg:grid-cols-3");
    expect(h).not.toMatch(/\bmax-(sm|md|lg|xl):/);
  });

  it("without specimens: says what to do (P-09), and offers the species choice", () => {
    const h = html([]);
    expect(h).toContain("Du hast noch kein Exemplar");
    expect(h).toContain("Art wählen");
  });

  it("the button for another specimen stays below the cards", () => {
    expect(html([card()])).toContain("Weiteres Exemplar: Art wählen");
  });
});
