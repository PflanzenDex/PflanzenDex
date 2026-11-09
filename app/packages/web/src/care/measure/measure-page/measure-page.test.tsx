// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ERROR_TEXTS } from "@pflanzendex/core";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { AnnouncerProvider } from "@/shared/platform/announcer/announcer";
import type { GrowthMoments } from "@/achievements";
import { MeasurePage } from "./measure-page";
import { delayLoads } from "@/shared/ui/display/skeleton/loading-contract";

/** The growth moments the page reads; a test sets them before it saves (US-ACH-05, issue 1644). */
const growth = vi.hoisted(() => ({ moments: null as GrowthMoments | null }));
vi.mock("@/achievements", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/achievements")>()),
  useGrowthMoments: () => growth.moments,
}));
const UNKNOWN_GROWTH: GrowthMoments = { latest: { kind: "unknown" }, records: new Set() };
const UNKNOWN_NOTE = /Dein Wachstum ist noch unbekannt/;

/** A box for a mocked `getBoundingClientRect`: jsdom lays nothing out, so the placement tests give the rects a place (issue 1644). */
const rectAt = (top: number, bottom: number): DOMRect =>
  ({
    top,
    bottom,
    left: 0,
    right: 0,
    width: 0,
    height: bottom - top,
    x: 0,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect;

/** A refused photo is an assertive toast, and the list or form keeps its place (US-QS-07, DS-54). */
async function refusalToast(): Promise<HTMLElement> {
  const region = () => document.querySelector<HTMLElement>('[aria-live="assertive"]');
  await vi.waitFor(() => expect(region()?.textContent).not.toBe(""));
  return region() as HTMLElement;
}

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
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
const specimen = { id: "e1", name: "Bogenhanf" };

function fakeServer(
  opts: {
    loadError?: boolean;
    save?: () => Promise<Response>;
    signs?: string | null;
    withPhoto?: boolean;
    photoSave?: (key?: string) => Promise<Response>;
    existing?: unknown[];
  } = {},
) {
  const photoPosts: { url: string; type: string | undefined; key: string | undefined }[] = [];
  const measurements: unknown[] = [...(opts.existing ?? [])];
  const posts: { body: Record<string, unknown>; key: string | undefined }[] = [];
  let loadAttempts = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).endsWith("/photo"))
        return new Response(new Uint8Array([1]), {
          status: 200,
          headers: { "content-type": "image/webp" },
        });
      if (init?.method === "POST" && String(url).includes("/measurements/photo")) {
        const h = init.headers as Record<string, string>;
        photoPosts.push({ url: String(url), type: h["Content-Type"], key: h["Idempotency-Key"] });
        return opts.photoSave
          ? opts.photoSave(h["Idempotency-Key"])
          : response(201, { photo: "p.webp" });
      }
      if (init?.method === "POST") {
        posts.push({
          body: JSON.parse(String(init.body)) as Record<string, unknown>,
          key: (init.headers as Record<string, string>)["Idempotency-Key"],
        });
        if (opts.save) return opts.save();
        measurements.unshift(opts.withPhoto ? { ...measurement, photo: "p.webp" } : measurement);
        return response(201, measurement);
      }
      loadAttempts += 1;
      if (opts.loadError && loadAttempts === 1)
        return response(500, { error: { code: "server.error", text: "Das hat nicht geklappt." } });
      return response(200, {
        specimenId: "e1",
        growthMeasure: "height",
        etiolationSigns: opts.signs ?? null,
        measurements,
        last: measurements[0] ?? null,
        lastRating: measurements.length ? "healthy" : null,
        growth: { count: measurements.length, ratePerYear: null, trend: null, signal: null },
      });
    }),
  );
  return { posts, photoPosts, loads: () => loadAttempts };
}

const show = (token: () => Promise<string | undefined> = async () => "tok", onBack = vi.fn()) =>
  render(
    <MemoryRouter>
      <MeasurePage api="http://api" token={token} specimen={specimen} onBack={onBack} />
    </MemoryRouter>,
  );

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:photo");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  growth.moments = null;
});

/** The course lives in its own layer "Verlauf", opened from the fact line (US-WAC-01, US-QS-15). */
const openCourse = async () =>
  userEvent.click(await screen.findByRole("button", { name: /^Verlauf \(/ }));

/** The entries and their photos are in the part "Messungen" of the layer (US-QS-15). */
const openEntries = async () => {
  await openCourse();
  await userEvent.click(await screen.findByRole("button", { name: "Messungen" }));
};

describe("US-WAC-01 Seite Messen", () => {
  it('US-WAC-01 shows "Was messen?" after loading and the empty course with next step (P-09)', async () => {
    fakeServer();
    delayLoads();
    show();
    expect((await screen.findByRole("status")).textContent).toContain("werden geladen");
    expect((await screen.findAllByText("noch keine Messung")).length).toBeGreaterThan(0);
    await openCourse();
    expect(await screen.findByText("Noch keine Messung")).toBeTruthy();
    expect(screen.getByText("Trage oben den ersten Messwert ein.")).toBeTruthy();
    expect(screen.getByText(/Höhe\./)).toBeTruthy();
  });

  it('US-WAC-03 shows rate and trend of the view; with one measurement "noch keine Rate"', async () => {
    fakeServer();
    show();
    await screen.findAllByText("noch keine Messung");
    await userEvent.type(screen.getByLabelText(/Messwert/), "12,5");
    await userEvent.click(screen.getByRole("button", { name: "Messung speichern" }));
    await openCourse();
    expect(await screen.findByText("1 Messung — noch keine Rate")).toBeTruthy();
  });

  it("US-WAC-01 saves with Idempotency-Key, reports the measurement and reloads the course", async () => {
    const { posts } = fakeServer();
    show();
    await userEvent.type(await screen.findByLabelText(/Messwert/), "12,5");
    await userEvent.click(screen.getByRole("button", { name: "Messung speichern" }));
    expect(await screen.findByText("Gespeichert: 12,5 cm am 01.10.2026.")).toBeTruthy();
    await openEntries();
    expect(
      await screen.findByRole("heading", { level: 3, name: "12,5\u00a0cm · 01.10.2026" }),
    ).toBeTruthy();
    expect(posts[0]?.body).toMatchObject({ value: 12.5, quality: "healthy" });
    expect(posts[0]?.key).toBeTruthy();
  });

  it("US-QS-03 a second try after a lost answer sends the same Idempotency-Key: one measurement", async () => {
    const save = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockImplementation(() => response(201, measurement));
    const { posts } = fakeServer({ save });
    show();
    await userEvent.type(await screen.findByLabelText(/Messwert/), "12,5");
    await userEvent.click(screen.getByRole("button", { name: "Messung speichern" }));
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    await userEvent.click(screen.getByRole("button", { name: "Messung speichern" }));
    expect(await screen.findByText("Gespeichert: 12,5 cm am 01.10.2026.")).toBeTruthy();
    expect(posts).toHaveLength(2);
    expect(posts[1]?.key).toBe(posts[0]?.key);
  });

  it("US-QS-03 a changed value after a lost answer keeps the key of the save: the server refuses it as a key conflict, then a new save is a new write", async () => {
    // The server keeps the first save of a key; a second request with the same key and another body is refused.
    const { posts } = fakeServer({
      save: async () => {
        const sent = posts.at(-1);
        const earlier = posts.slice(0, -1).find((p) => p.key === sent?.key);
        if (earlier && JSON.stringify(earlier.body) !== JSON.stringify(sent?.body))
          return response(409, { error: { code: "idempotency.key_conflict", text: "x" } });
        if (posts.length === 1) throw new TypeError("Failed to fetch");
        return response(201, measurement);
      },
    });
    show();
    await userEvent.type(await screen.findByLabelText(/Messwert/), "12,5");
    await userEvent.click(screen.getByRole("button", { name: "Messung speichern" }));
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    await userEvent.clear(screen.getByLabelText(/Messwert/));
    await userEvent.type(screen.getByLabelText(/Messwert/), "13");
    await userEvent.click(screen.getByRole("button", { name: "Messung speichern" }));
    await vi.waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1]?.key).toBe(posts[0]?.key);
    expect(posts[1]?.body).toMatchObject({ value: 13 });
    expect(await screen.findByText(/Schlüssel/)).toBeTruthy();
    expect(screen.queryByText(/Gespeichert:/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Messung speichern" }));
    await vi.waitFor(() => expect(posts).toHaveLength(3));
    expect(posts[2]?.key).not.toBe(posts[0]?.key);
    expect(await screen.findByText(/Gespeichert:/)).toBeTruthy();
  });

  it('US-WAC-02 "Wie erkennen?" opens the etiolation signs of the species; etiolated/thin is sent', async () => {
    const { posts } = fakeServer({ signs: "Rosette streckt sich, Blätter werden blass." });
    show();
    const summary = await screen.findByText("Wie erkennen?");
    const details = summary.closest("details");
    expect(details?.open).toBe(false);
    await userEvent.click(summary);
    expect(details?.open).toBe(true);
    expect(screen.getByText(/Rosette streckt sich, Blätter werden blass\./)).toBeTruthy();
    await userEvent.type(screen.getByLabelText(/Messwert/), "8");
    await userEvent.selectOptions(screen.getByLabelText("Qualität"), "etiolated");
    await userEvent.click(screen.getByRole("button", { name: "Messung speichern" }));
    await screen.findByText(/Gespeichert:/);
    expect(posts[0]?.body).toMatchObject({ value: 8, quality: "etiolated" });
  });

  it("US-WAC-02 without etiolation signs of the species there is no disclosure, nothing invented (P-08)", async () => {
    fakeServer({ signs: null });
    show();
    await screen.findAllByText("noch keine Messung");
    expect(screen.queryByText("Wie erkennen?")).toBeNull();
  });

  it("US-WAC-01 an invalid input is rejected before sending and writes nothing", async () => {
    const { posts } = fakeServer();
    show();
    await userEvent.type(await screen.findByLabelText(/Messwert/), "12,3");
    await userEvent.click(screen.getByRole("button", { name: "Messung speichern" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Schritten von 0,5");
    expect(posts).toHaveLength(0);
  });

  it("US-WAC-01 · DS-49 if the server rejects, the German text of its code is there and the input stays", async () => {
    fakeServer({
      save: () =>
        response(404, {
          error: { code: "specimen.not_found", text: "Die Pflanze gibt es nicht." },
        }),
    });
    show();
    const field = await screen.findByLabelText(/Messwert/);
    await userEvent.type(field, "10");
    await userEvent.click(screen.getByRole("button", { name: "Messung speichern" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      ERROR_TEXTS["specimen.not_found"],
    );
    expect((field as HTMLInputElement).value).toBe("10");
  });

  it("US-WAC-01 without sign-in while saving: hint to sign in instead of a call", async () => {
    const { posts } = fakeServer();
    let signedIn = true;
    show(async () => (signedIn ? "tok" : undefined));
    await userEvent.type(await screen.findByLabelText(/Messwert/), "10");
    signedIn = false;
    await userEvent.click(screen.getByRole("button", { name: "Messung speichern" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      ERROR_TEXTS["access.not_signed_in"],
    );
    expect(posts).toHaveLength(0);
  });

  it("US-WAC-01 a load error offers reload, afterwards the view appears", async () => {
    fakeServer({ loadError: true });
    show();
    expect((await screen.findByRole("alert")).textContent).toContain("Das hat nicht geklappt.");
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByRole("button", { name: /^Verlauf \(/ })).toBeTruthy();
  });

  it("US-WAC-01 without sign-in while loading: error text, no call to the API", async () => {
    fakeServer();
    show(async () => undefined);
    expect((await screen.findByRole("alert")).textContent).toContain("Bitte melde dich neu an.");
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("US-WAC-01 back to the collection calls the way back", async () => {
    fakeServer();
    const back = vi.fn();
    show(async () => "tok", back);
    await userEvent.click(screen.getByRole("button", { name: "Zurück zur Sammlung" }));
    expect(back).toHaveBeenCalledOnce();
  });

  it("US-QS-15 · the growth note is an overlay that takes no place: the form keeps its node and place with and without it, and the save button is never under it (issue 1644, F8)", async () => {
    fakeServer();
    show();
    const field = await screen.findByLabelText(/Messwert/);
    const form = screen.getByRole("form", { name: "Messung erfassen" });
    expect(document.querySelector('[data-slot="growth-note"]')).toBeNull();
    growth.moments = UNKNOWN_GROWTH;
    await userEvent.type(field, "12,5");
    await userEvent.click(screen.getByRole("button", { name: "Messung speichern" }));
    await screen.findByText(UNKNOWN_NOTE);
    const overlay = document.querySelector<HTMLElement>('[data-slot="growth-note"]');
    // Absolute, in the wrapper of the form: the form is the same node in the same place in the flow.
    expect(overlay?.className).toContain("absolute");
    expect(overlay?.parentElement).toBe(form.parentElement);
    expect(screen.getByRole("form", { name: "Messung erfassen" })).toBe(form);
    expect(overlay?.contains(screen.getByRole("button", { name: "Messung speichern" }))).toBe(
      false,
    );
  });

  it("US-QS-15 · the growth note is announced once per save, through the one polite region (issue 1644, F8)", async () => {
    fakeServer();
    growth.moments = UNKNOWN_GROWTH;
    render(
      <AnnouncerProvider>
        <MemoryRouter>
          <MeasurePage
            api="http://api"
            token={async () => "tok"}
            specimen={specimen}
            onBack={vi.fn()}
          />
        </MemoryRouter>
      </AnnouncerProvider>,
    );
    await userEvent.type(await screen.findByLabelText(/Messwert/), "12,5");
    await userEvent.click(screen.getByRole("button", { name: "Messung speichern" }));
    const region = document.querySelector<HTMLElement>('.sr-only[aria-live="polite"]');
    await vi.waitFor(() =>
      expect(region?.textContent).toContain("Dein Wachstum ist noch unbekannt"),
    );
    expect(region?.textContent?.match(/Dein Wachstum ist noch unbekannt/g)).toHaveLength(1);
  });

  it("US-QS-15 · the growth note closes with Schließen and when the keeper types in the form, and shows again at the next save (issue 1644, F8)", async () => {
    fakeServer();
    growth.moments = UNKNOWN_GROWTH;
    show();
    const field = await screen.findByLabelText(/Messwert/);
    const save = screen.getByRole("button", { name: "Messung speichern" });
    await userEvent.type(field, "12,5");
    await userEvent.click(save);
    await screen.findByText(UNKNOWN_NOTE);
    await userEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(screen.queryByText(UNKNOWN_NOTE)).toBeNull();
    await userEvent.type(field, "3");
    await userEvent.click(save);
    await screen.findByText(UNKNOWN_NOTE);
    await userEvent.type(field, "4");
    expect(screen.queryByText(UNKNOWN_NOTE)).toBeNull();
  });

  it("US-QS-15 · a save with Enter keeps the focus in Messwert, and the note sits below that field, not over it (issue 1644)", async () => {
    fakeServer();
    growth.moments = UNKNOWN_GROWTH;
    show();
    const field = await screen.findByLabelText(/Messwert/);
    const wrapper = screen.getByRole("form", { name: "Messung erfassen" })
      .parentElement as HTMLElement;
    // The form starts at 100 px, the value field ends at 180 px: the note goes to 80 px below the form's top.
    vi.spyOn(wrapper, "getBoundingClientRect").mockReturnValue(rectAt(100, 400));
    vi.spyOn(field, "getBoundingClientRect").mockReturnValue(rectAt(150, 180));
    await userEvent.type(field, "12,5");
    // jsdom does not submit on Enter through the footer button (it sits outside the form); a browser sends the click of
    // the default button for that Enter, and that click moves no focus, so the test sends it the same way.
    fireEvent.click(screen.getByRole("button", { name: "Messung speichern" }));
    await screen.findByText(UNKNOWN_NOTE);
    expect(document.activeElement).toBe(field);
    const card = document.querySelector<HTMLElement>('[data-slot="growth-note"]');
    expect(card?.style.top).toBe("80px");
  });

  it("US-QS-15 · the note paints under the sticky save button and scrolls within 40 % of the window, also at 200 % text (issue 1644)", async () => {
    fakeServer();
    growth.moments = UNKNOWN_GROWTH;
    show();
    const field = await screen.findByLabelText(/Messwert/);
    await userEvent.type(field, "12,5");
    const save = screen.getByRole("button", { name: "Messung speichern" });
    fireEvent.click(save);
    await screen.findByText(UNKNOWN_NOTE);
    const card = document.querySelector<HTMLElement>('[data-slot="growth-note"]');
    expect(save.parentElement?.className).toContain("sticky bottom-0 z-10");
    expect(card?.className).toContain("z-[5]");
    expect(card?.className).toContain("max-h-[40vh]");
    expect(card?.className).toContain("overflow-y-auto");
  });

  it("US-QS-15 · the focus moving into the form outside the note (Tab into Datum) closes it (issue 1644)", async () => {
    fakeServer();
    growth.moments = UNKNOWN_GROWTH;
    show();
    const field = await screen.findByLabelText(/Messwert/);
    await userEvent.type(field, "12,5");
    fireEvent.click(screen.getByRole("button", { name: "Messung speichern" }));
    await screen.findByText(UNKNOWN_NOTE);
    await userEvent.tab();
    expect(screen.queryByText(UNKNOWN_NOTE)).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText("Datum"));
  });

  it("US-QS-15 · Schließen gives the focus back to the field the note came from (issue 1644)", async () => {
    fakeServer();
    growth.moments = UNKNOWN_GROWTH;
    show();
    const field = await screen.findByLabelText(/Messwert/);
    await userEvent.type(field, "12,5");
    fireEvent.click(screen.getByRole("button", { name: "Messung speichern" }));
    await screen.findByText(UNKNOWN_NOTE);
    await userEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(screen.queryByText(UNKNOWN_NOTE)).toBeNull();
    expect(document.activeElement).toBe(field);
  });

  it("US-WAC-01 · DS-52 while loading, a skeleton with the one loading status mirrors the page", async () => {
    fakeServer();
    delayLoads();
    const { container } = show();
    expect(await screen.findAllByRole("status")).toHaveLength(1);
    expect(container.querySelectorAll('[aria-hidden="true"].animate-pulse').length).toBeGreaterThan(
      0,
    );
  });

  it("US-WAC-01 · DS-48 an invalid input focuses the first invalid field and links its message", async () => {
    fakeServer();
    show();
    const field = await screen.findByLabelText(/Messwert/);
    await userEvent.type(field, "12,3");
    await userEvent.click(screen.getByRole("button", { name: "Messung speichern" }));
    const alert = await screen.findByRole("alert");
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(field.getAttribute("aria-describedby")).toContain(alert.id);
    expect(document.activeElement).toBe(field);
  });

  it("US-WAC-01 · DS-26 the empty course offers an action that closes the course, the form with the value field stays in view", async () => {
    fakeServer();
    show();
    await openCourse();
    await userEvent.click(await screen.findByRole("button", { name: "Messwert eintragen" }));
    // The course layer closes; the focus returns to its opener, the value field is right above the course (P-09).
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByLabelText(/Messwert \(/)).toBeTruthy();
  });
});

const IMAGE = new File([new Uint8Array([1, 2, 3])], "pflanze.jpg", { type: "image/jpeg" });
const fillValue = async (v: string) => userEvent.type(await screen.findByLabelText(/Messwert/), v);
const save = () => userEvent.click(screen.getByRole("button", { name: "Messung speichern" }));
/** A photo request that stays open until the test answers it: the photo is still on its way (US-WAC-06). */
function heldPhoto() {
  let release: (answer: Promise<Response>) => void = () => undefined;
  const answer = new Promise<Response>((resolve) => {
    release = (later) => resolve(later);
  });
  return { answer, release };
}

describe("US-WAC-05 photo in the form and in the course", () => {
  it("a measurement with a photo shows the photo with alternative text in the course", async () => {
    fakeServer({ withPhoto: true });
    show();
    await fillValue("12,5");
    await save();
    await openEntries();
    expect(
      await screen.findByRole("img", { name: "Foto der Messung vom 01.10.2026" }),
    ).toBeTruthy();
  });

  it("the form sends the chosen photo after the measurement, for its date, as raw file with Idempotency-Key", async () => {
    const { posts, photoPosts } = fakeServer({ withPhoto: true });
    show();
    await fillValue("12,5");
    await userEvent.upload(screen.getByLabelText(/Foto/), IMAGE);
    await save();
    await screen.findByText(/Gespeichert:/);
    expect(posts).toHaveLength(1);
    expect(photoPosts).toHaveLength(1);
    expect(photoPosts[0]?.type).toBe("image/jpeg");
    expect(photoPosts[0]?.key).toBeTruthy();
    expect(photoPosts[0]?.url).toMatch(
      /\/specimens\/e1\/measurements\/photo\?.*date=\d{4}-\d{2}-\d{2}/,
    );
  });

  it("without a chosen photo nothing is uploaded", async () => {
    const { photoPosts } = fakeServer();
    show();
    await fillValue("12,5");
    await save();
    await screen.findByText(/Gespeichert:/);
    expect(photoPosts).toHaveLength(0);
  });

  it("US-QS-24 the optional note and photo sit behind Mehr Angaben, closed; the save button sits in a sticky footer", async () => {
    fakeServer();
    show();
    await screen.findAllByText("noch keine Messung");
    const more = screen.getByText("Mehr Angaben").closest("details") as HTMLDetailsElement;
    expect(more.open).toBe(false);
    expect(more.contains(screen.getByLabelText(/Foto/))).toBe(true);
    expect(more.contains(screen.getByLabelText("Notiz (optional)"))).toBe(true);
    expect(
      screen.getByRole("button", { name: "Messung speichern" }).parentElement?.className,
    ).toContain("sticky");
  });

  it("US-QS-24 a refused photo opens Mehr Angaben, so its message is never hidden (P-10)", async () => {
    fakeServer();
    show();
    await userEvent.type(await screen.findByLabelText(/Messwert/), "12,5");
    await userEvent
      .setup({ applyAccept: false })
      .upload(screen.getByLabelText(/Foto/), new File(["x"], "x.pdf", { type: "application/pdf" }));
    await userEvent.click(screen.getByRole("button", { name: "Messung speichern" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("JPEG, PNG oder WebP");
    expect(alert.closest("details")?.open).toBe(true);
  });

  it("a file that is not an image is rejected before sending and writes nothing", async () => {
    const { posts, photoPosts } = fakeServer();
    show();
    await fillValue("12,5");
    await userEvent
      .setup({ applyAccept: false })
      .upload(screen.getByLabelText(/Foto/), new File(["x"], "x.pdf", { type: "application/pdf" }));
    await save();
    expect((await screen.findByRole("alert")).textContent).toContain("JPEG, PNG oder WebP");
    expect(posts).toHaveLength(0);
    expect(photoPosts).toHaveLength(0);
  });

  it("US-WAC-06 if the photo is refused the measurement stays saved, says so, and the German text of the code is shown (P-10)", async () => {
    fakeServer({
      photoSave: () =>
        response(415, { error: { code: "media.type_unsupported", text: "raw server text" } }),
    });
    show();
    await fillValue("12,5");
    await userEvent.upload(screen.getByLabelText(/Foto/), IMAGE);
    await save();
    const alert = await refusalToast();
    expect(alert.textContent).toContain("Die Messung ist gespeichert, das Foto nicht.");
    expect(alert.textContent).toContain(ERROR_TEXTS["media.type_unsupported"]);
    expect(alert.textContent).not.toContain("raw server text");
    expect(screen.queryAllByText(/Gespeichert/)).toHaveLength(0);
  });

  it("US-WAC-06 while the photo is stored the page says so, the fact line shows the measurement, and nothing is confirmed yet (P-10)", async () => {
    const held = heldPhoto();
    const { photoPosts } = fakeServer({ photoSave: () => held.answer });
    show();
    await fillValue("12,5");
    await userEvent.upload(screen.getByLabelText(/Foto/), IMAGE);
    await save();
    await vi.waitFor(() => expect(photoPosts).toHaveLength(1));
    const status = await screen.findByText("Foto wird gespeichert …");
    expect(status.closest('[role="status"]')).not.toBeNull();
    expect(screen.queryAllByText(/Gespeichert/)).toHaveLength(0);
    // The measurement is stored, so the fact line shows it while the photo is still on its way.
    await vi.waitFor(() =>
      expect(screen.getByText("Letzte Messung").nextElementSibling?.textContent).toContain("12,5"),
    );
    expect(screen.getByRole("button", { name: "Messung speichern" }).hasAttribute("disabled")).toBe(
      true,
    );
    held.release(response(201, { photo: "p.webp" }));
  });

  it("US-WAC-06 after the photo is stored the confirmation appears once, with the measurement text, and the status is gone", async () => {
    const held = heldPhoto();
    fakeServer({ photoSave: () => held.answer });
    show();
    await fillValue("12,5");
    await userEvent.upload(screen.getByLabelText(/Foto/), IMAGE);
    await save();
    await screen.findByText("Foto wird gespeichert …");
    held.release(response(201, { photo: "p.webp" }));
    expect(await screen.findByText("Gespeichert: 12,5 cm am 01.10.2026.")).toBeTruthy();
    expect(screen.queryByText("Foto wird gespeichert …")).toBeNull();
    expect(screen.queryAllByText(/Gespeichert/)).toHaveLength(1);
  });

  it("US-WAC-06 a store that refuses the photo: no success text comes before the error, and the error says the measurement is kept (P-10)", async () => {
    fakeServer({
      photoSave: () =>
        response(502, { error: { code: "media.storage_unavailable", text: "raw server text" } }),
    });
    show();
    await fillValue("12,5");
    await userEvent.upload(screen.getByLabelText(/Foto/), IMAGE);
    await save();
    const alert = await refusalToast();
    // Nothing says "Gespeichert" before or beside the error: the success text would be a lie about the photo (P-10).
    expect(screen.queryAllByText(/Gespeichert/)).toHaveLength(0);
    expect(alert.textContent).toContain("Die Messung ist gespeichert, das Foto nicht.");
    expect(alert.textContent).toContain(ERROR_TEXTS["media.storage_unavailable"]);
    expect(alert.textContent).not.toContain("raw server text");
  });
});

describe("US-WAC-05 add or replace the photo of an existing measurement", () => {
  const exists = () =>
    response(409, { error: { code: "measurement.photo_exists", text: "raw server text" } });
  const pick = async (label: RegExp) =>
    userEvent.upload(await screen.findByLabelText(label), IMAGE);

  it("adds a photo to a measurement without one, for its date, without replace", async () => {
    setViewportWidth(1024);
    const { photoPosts } = fakeServer({ existing: [measurement] });
    show();
    await openEntries();
    await pick(/Foto hinzufügen/);
    await vi.waitFor(() => expect(photoPosts).toHaveLength(1));
    expect(photoPosts[0]?.url).toContain("date=2026-10-01");
    expect(photoPosts[0]?.url).not.toContain("replace");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("an existing photo is replaced only after confirmation (measurement.photo_exists)", async () => {
    setViewportWidth(1024);
    let calls = 0;
    const { photoPosts } = fakeServer({
      existing: [{ ...measurement, photo: "p.webp" }],
      photoSave: () =>
        ++calls === 1 ? exists() : response(201, { photo: "q.webp", replaced: true }),
    });
    show();
    await openEntries();
    await pick(/Foto ersetzen/);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain(ERROR_TEXTS["measurement.photo_exists"]);
    expect(photoPosts).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Foto ersetzen" }));
    await vi.waitFor(() => expect(photoPosts).toHaveLength(2));
    expect(photoPosts[1]?.url).toContain("replace=true");
  });

  it("cancelling the confirmation keeps the old photo and sends nothing more", async () => {
    setViewportWidth(1024);
    const { photoPosts } = fakeServer({
      existing: [{ ...measurement, photo: "p.webp" }],
      photoSave: exists,
    });
    show();
    await openEntries();
    await pick(/Foto ersetzen/);
    await screen.findByRole("dialog");
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(photoPosts).toHaveLength(1);
  });

  it("another refusal shows the German text of its code and keeps the measurement (P-10)", async () => {
    setViewportWidth(1024);
    fakeServer({
      existing: [measurement],
      photoSave: () =>
        response(415, { error: { code: "media.type_unsupported", text: "raw server text" } }),
    });
    show();
    await openEntries();
    await pick(/Foto hinzufügen/);
    expect((await refusalToast()).textContent).toContain(ERROR_TEXTS["media.type_unsupported"]);
  });

  it("only the latest measurement of a day offers the photo, because the server attaches it to that one (FR-WAC-07)", async () => {
    fakeServer({
      existing: [
        { ...measurement, id: "m2" },
        { ...measurement, id: "m1", value: 11 },
      ],
    });
    show();
    await openEntries();
    await screen.findAllByRole("heading", { level: 3 });
    expect(screen.getAllByLabelText(/Foto hinzufügen/)).toHaveLength(1);
  });

  it("US-QS-03 a lost answer to a photo, then the same file again: the keeper gets the normal success and no replace question", async () => {
    setViewportWidth(1024);
    // The server keeps one photo per measurement and answers a repeated key with the answer it stored (US-QS-03).
    // Its first answer is lost after the photo is stored, so the client sees a network error.
    const answered = new Set<string>();
    let hasPhoto = false;
    let answerLost = false;
    const { photoPosts, loads } = fakeServer({
      existing: [measurement],
      photoSave: async (key) => {
        if (key !== undefined && answered.has(key)) return response(201, { photo: "p.webp" });
        if (hasPhoto) return exists();
        hasPhoto = true;
        if (key !== undefined) answered.add(key);
        if (!answerLost) {
          answerLost = true;
          throw new TypeError("Failed to fetch");
        }
        return response(201, { photo: "p.webp" });
      },
    });
    show();
    await openEntries();
    await pick(/Foto hinzufügen/);
    await refusalToast();
    const reloadsBefore = loads();
    await pick(/Foto hinzufügen/);
    await vi.waitFor(() => expect(photoPosts).toHaveLength(2));
    // The answer is handled once it has opened the replace question or reloaded the list after the saved photo.
    await vi.waitFor(() =>
      expect(screen.queryByRole("dialog") !== null || loads() > reloadsBefore).toBe(true),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(photoPosts[1]?.key).toBe(photoPosts[0]?.key);
  });

  it("US-QS-03 another photo picked after a lost upload repeats its key: the server refuses a different file with it (key conflict)", async () => {
    setViewportWidth(1024);
    const other = new File([new Uint8Array([9, 9])], "other.jpg", { type: "image/jpeg" });
    let answerLost = false;
    const { photoPosts } = fakeServer({
      existing: [measurement],
      photoSave: async () => {
        if (!answerLost) {
          answerLost = true;
          throw new TypeError("Failed to fetch");
        }
        return response(201, { photo: "p.webp" });
      },
    });
    show();
    await openEntries();
    await pick(/Foto hinzufügen/);
    await refusalToast();
    await userEvent.upload(await screen.findByLabelText(/Foto hinzufügen/), other);
    await vi.waitFor(() => expect(photoPosts).toHaveLength(2));
    expect(photoPosts[1]?.key).toBe(photoPosts[0]?.key);
  });
});

describe("US-QS-14 · US-QS-15 the measure page is a sub-page with one page header", () => {
  it("US-QS-14 has one h1, and its back control sits in that page header", async () => {
    fakeServer();
    show();
    const title = await screen.findByRole("heading", { level: 1, name: /^Messen: / });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const header = title.closest("[data-page-header]") as HTMLElement | null;
    expect(header).not.toBeNull();
    expect(
      within(header as HTMLElement).getByRole("button", { name: "Zurück zur Sammlung" }),
    ).toBeTruthy();
  });
});
