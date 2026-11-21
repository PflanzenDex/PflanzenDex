// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { growthNoteText, type GrowthMoments } from "@/achievements";
import { AnnouncerProvider } from "@/shared/platform/announcer/announcer";
import { LayerHost } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { MeasurePage } from "../measure-page";

// The growth read is the app's own (no mock): the save invalidates it, and the page shows the copy it had until the
// new answer comes (issue 1795). These tests hold answers, so the announcer is seen against the real refetch timing.

type GrowthMoment = GrowthMoments["latest"];

/** A no-break space reads as a space: the announcer text joins value and unit with one (US-QS-24). */
const norm = (text: string): string => text.replace(/\u00a0/g, " ");

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

/** An answer that waits until the test gives it: a read or a photo on its way (US-QS-08, issue 2323). */
function heldAnswer() {
  let release: (answer: Promise<Response>) => void = () => undefined;
  const answer = new Promise<Response>((resolve) => {
    release = (later) => resolve(later);
  });
  return { answer, release };
}

const specimen = { id: "e1", name: "Bogenhanf" };
const measurement = {
  id: "m1",
  specimenId: "e1",
  date: "2026-10-01",
  value: 12.5,
  quality: "healthy",
  note: null,
  ratedBy: "keeper",
  photo: null,
};
const IMAGE = new File([new Uint8Array([1, 2, 3])], "pflanze.jpg", { type: "image/jpeg" });
const moment = (since: string, growth: number): GrowthMoment => ({
  kind: "moment",
  since,
  growth,
  ratePerYear: 12,
  record: null,
});
const growthBody = (latest: GrowthMoment) => ({ calmMode: false, latest, records: [] });

/**
 * The server of the page. Read number n of the growth answers `growth(n)`; a photo upload answers `photo()`. Every other
 * request is the measurement view, and a measurement write stores it.
 */
function server(growth: (read: number) => Promise<Response>, photo?: () => Promise<Response>) {
  let growthReads = 0;
  const measurements: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const address = String(url);
      if (init?.method === "POST" && address.includes("/measurements/photo")) {
        return photo ? photo() : json(201, { photo: "p.webp" });
      }
      if (init?.method === "POST") {
        measurements.unshift(measurement);
        return json(201, measurement);
      }
      if (address.includes("/achievements/growth/")) {
        growthReads += 1;
        return growth(growthReads);
      }
      return json(200, {
        specimenId: "e1",
        growthMeasure: "height",
        etiolationSigns: null,
        measurements,
        last: measurements[0] ?? null,
        lastRating: measurements.length ? "healthy" : null,
        growth: { count: measurements.length, ratePerYear: null, trend: null, signal: null },
      });
    }),
  );
}

/** The page with the announcer, so the one polite region exists (US-QS-08). */
function showPage() {
  return render(
    <AnnouncerProvider>
      <MemoryRouter>
        <LayerHost>
          <MeasurePage
            api="http://api"
            token={async () => "tok"}
            specimen={specimen}
            onBack={vi.fn()}
          />
        </LayerHost>
      </MemoryRouter>
    </AnnouncerProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Every text the polite region takes, in order, its no-break spaces read as spaces (US-QS-08). */
function recordPolite(): { taken: string[]; politeText: () => string } {
  const region = document.querySelector<HTMLElement>('.sr-only[aria-live="polite"]') as HTMLElement;
  const politeText = () => norm(region.textContent ?? "");
  const taken: string[] = [];
  new MutationObserver(() => taken.push(politeText())).observe(region, {
    childList: true,
    characterData: true,
    subtree: true,
  });
  return { taken, politeText };
}

const SAVED = "Gesichert: 12,5 cm am 01.10.2026.";
const noteOf = (latest: GrowthMoment): string =>
  norm(
    growthNoteText({ moments: { latest, records: new Set(), stale: false }, justSaved: true }) ??
      "",
  );

describe("US-QS-08 the growth note after a save comes from the read the save starts (issue 2323)", () => {
  it("US-QS-08 the earlier note is never read after a save: the save is said alone while the read after it is on its way", async () => {
    const later = heldAnswer();
    server((read) => (read === 1 ? json(200, growthBody(moment("2026-08-01", 1))) : later.answer));
    showPage();
    const polite = recordPolite();
    await userEvent.type(await screen.findByLabelText(/Messwert/), "12,5");
    await userEvent.click(screen.getByRole("button", { name: "Messung sichern" }));
    await vi.waitFor(() => expect(polite.politeText()).toBe(SAVED));
    // The card shows the earlier note until the new answer comes; the announcer does not read it.
    expect(polite.taken).toEqual([SAVED]);
    const combined = `${SAVED} ${noteOf(moment("2026-09-01", 3))}`;
    later.release(json(200, growthBody(moment("2026-09-01", 3))));
    await vi.waitFor(() => expect(polite.politeText()).toBe(combined));
    expect(polite.taken).toEqual([SAVED, combined]);
  });

  it("US-QS-08 a plain save is announced as one text: the confirmation with the growth note, every text it takes starts with the confirmation", async () => {
    server((read) =>
      json(200, growthBody(read === 1 ? moment("2026-08-01", 1) : moment("2026-09-01", 3))),
    );
    showPage();
    const polite = recordPolite();
    await userEvent.type(await screen.findByLabelText(/Messwert/), "12,5");
    await userEvent.click(screen.getByRole("button", { name: "Messung sichern" }));
    const combined = `${SAVED} ${noteOf(moment("2026-09-01", 3))}`;
    await vi.waitFor(() => expect(polite.politeText()).toBe(combined));
    // Never the note alone, and never the earlier note (issue 2323).
    expect(polite.taken.length).toBeGreaterThan(0);
    for (const text of polite.taken) expect(text.startsWith(SAVED)).toBe(true);
    expect(polite.taken.at(-1)).toBe(combined);
  });

  it("US-QS-08 a read that answers during the photo upload is the answer of its save: the confirmation carries the note once, though the view reads again after the photo", async () => {
    const photo = heldAnswer();
    const refresh = heldAnswer();
    server(
      (read) =>
        read === 1
          ? json(200, growthBody(moment("2026-08-01", 1)))
          : read === 2
            ? json(200, growthBody(moment("2026-09-01", 3)))
            : refresh.answer,
      () => photo.answer,
    );
    showPage();
    const polite = recordPolite();
    await userEvent.type(await screen.findByLabelText(/Messwert/), "12,5");
    await userEvent.upload(screen.getByLabelText("Foto wählen"), IMAGE);
    await userEvent.click(screen.getByRole("button", { name: "Messung sichern" }));
    // The read after the save answers while the photo is stored: the save is not confirmed yet, so nothing is said.
    await vi.waitFor(() =>
      expect(
        document
          .querySelector('[data-slot="growth-note"]')
          ?.textContent?.includes("Wachstumsmoment: 3"),
      ).toBe(true),
    );
    expect(polite.taken).toEqual([]);
    photo.release(json(201, { photo: "p.webp" }));
    const combined = `${SAVED} ${noteOf(moment("2026-09-01", 3))}`;
    await vi.waitFor(() => expect(polite.politeText()).toBe(combined));
    // The view reads again after the photo is stored: that read is on its way at the confirmation, and it says nothing more.
    refresh.release(json(200, growthBody(moment("2026-09-01", 3))));
    await new Promise((done) => setTimeout(done, 50));
    expect(polite.taken).toEqual([combined]);
  });

  it("US-QS-08 a refused photo announces no growth note, only the error", async () => {
    server(
      (read) =>
        json(200, growthBody(read === 1 ? moment("2026-08-01", 1) : moment("2026-09-01", 3))),
      () => json(415, { error: { code: "media.type_unsupported", text: "raw server text" } }),
    );
    showPage();
    const polite = recordPolite();
    await userEvent.type(await screen.findByLabelText(/Messwert/), "12,5");
    await userEvent.upload(screen.getByLabelText("Foto wählen"), IMAGE);
    await userEvent.click(screen.getByRole("button", { name: "Messung sichern" }));
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-live="assertive"]')?.textContent).toContain(
        "Die Messung ist gesichert, das Foto nicht.",
      ),
    );
    // The note is read and shown for the kept measurement, but a refused photo confirms nothing: nothing is said.
    await vi.waitFor(() =>
      expect(document.querySelector('[data-slot="growth-note"]')?.textContent).toContain(
        "Wachstumsmoment: 3",
      ),
    );
    expect(polite.taken).toEqual([]);
    expect(polite.politeText()).toBe("");
  });
});
