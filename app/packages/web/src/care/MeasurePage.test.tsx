// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ERROR_TEXTS } from "@pflanzendex/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/lib/viewport-mock";
import { MeasurePage } from "./MeasurePage";

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
    photoSave?: () => Promise<Response>;
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
          headers: { "content-type": "image/jpeg" },
        });
      if (init?.method === "POST" && String(url).includes("/measurements/photo")) {
        const h = init.headers as Record<string, string>;
        photoPosts.push({ url: String(url), type: h["Content-Type"], key: h["Idempotency-Key"] });
        return opts.photoSave ? opts.photoSave() : response(201, { photo: "p.jpg" });
      }
      if (init?.method === "POST") {
        posts.push({
          body: JSON.parse(String(init.body)) as Record<string, unknown>,
          key: (init.headers as Record<string, string>)["Idempotency-Key"],
        });
        if (opts.save) return opts.save();
        measurements.unshift(opts.withPhoto ? { ...measurement, photo: "p.jpg" } : measurement);
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
  return { posts, photoPosts };
}

const show = (token: () => Promise<string | undefined> = async () => "tok", onBack = vi.fn()) =>
  render(<MeasurePage api="http://api" token={token} specimen={specimen} onBack={onBack} />);

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:photo");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-WAC-01 Seite Messen", () => {
  it('US-WAC-01 shows "Was messen?" after loading and the empty course with next step (P-09)', async () => {
    fakeServer();
    show();
    expect(screen.getByRole("status").textContent).toContain("werden geladen");
    expect(await screen.findByText("Noch keine Messung")).toBeTruthy();
    expect(screen.getByText("Trage oben den ersten Messwert ein.")).toBeTruthy();
    expect(screen.getByText(/Höhe\./)).toBeTruthy();
  });

  it('US-WAC-03 shows rate and trend of the view; with one measurement "noch keine Rate"', async () => {
    fakeServer();
    show();
    await screen.findByText("Noch keine Messung");
    await userEvent.type(screen.getByLabelText(/Messwert/), "12,5");
    await userEvent.click(screen.getByRole("button", { name: "Messung speichern" }));
    expect(await screen.findByText("1 Messung — noch keine Rate")).toBeTruthy();
  });

  it("US-WAC-01 saves with Idempotency-Key, reports the measurement and reloads the course", async () => {
    const { posts } = fakeServer();
    show();
    await userEvent.type(await screen.findByLabelText(/Messwert/), "12,5");
    await userEvent.click(screen.getByRole("button", { name: "Messung speichern" }));
    expect(await screen.findByText("Gespeichert: 12,5 cm am 01.10.2026.")).toBeTruthy();
    expect(
      await screen.findByRole("heading", { level: 3, name: "12,5 cm · 01.10.2026" }),
    ).toBeTruthy();
    expect(posts[0]?.body).toMatchObject({ value: 12.5, quality: "healthy" });
    expect(posts[0]?.key).toBeTruthy();
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
    await screen.findByText("Noch keine Messung");
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
          error: { code: "specimen.not_found", text: "Das Exemplar gibt es nicht." },
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
    expect(await screen.findByText("Verlauf")).toBeTruthy();
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
    await userEvent.click(screen.getByRole("button", { name: "Zurück zum Bestand" }));
    expect(back).toHaveBeenCalledOnce();
  });

  it("US-WAC-01 · DS-52 while loading, a skeleton with the one loading status mirrors the page", () => {
    fakeServer();
    const { container } = show();
    expect(screen.getAllByRole("status")).toHaveLength(1);
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

  it("US-WAC-01 · DS-26 the empty course offers an action that focuses the value field", async () => {
    fakeServer();
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Messwert eintragen" }));
    expect(document.activeElement).toBe(screen.getByLabelText(/Messwert \(/));
  });
});

const IMAGE = new File([new Uint8Array([1, 2, 3])], "pflanze.jpg", { type: "image/jpeg" });
const fillValue = async (v: string) => userEvent.type(await screen.findByLabelText(/Messwert/), v);
const save = () => userEvent.click(screen.getByRole("button", { name: "Messung speichern" }));

describe("US-WAC-05 photo in the form and in the course", () => {
  it("a measurement with a photo shows the photo with alternative text in the course", async () => {
    fakeServer({ withPhoto: true });
    show();
    await fillValue("12,5");
    await save();
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

  it("if the photo is refused the measurement stays saved and the German text of the code is shown (P-10)", async () => {
    fakeServer({
      photoSave: () =>
        response(415, { error: { code: "media.type_unsupported", text: "raw server text" } }),
    });
    show();
    await fillValue("12,5");
    await userEvent.upload(screen.getByLabelText(/Foto/), IMAGE);
    await save();
    expect(await screen.findByText(/Gespeichert:/)).toBeTruthy();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(ERROR_TEXTS["media.type_unsupported"]);
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
      existing: [{ ...measurement, photo: "p.jpg" }],
      photoSave: () =>
        ++calls === 1 ? exists() : response(201, { photo: "q.jpg", replaced: true }),
    });
    show();
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
      existing: [{ ...measurement, photo: "p.jpg" }],
      photoSave: exists,
    });
    show();
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
    await pick(/Foto hinzufügen/);
    expect((await screen.findByRole("alert")).textContent).toContain(
      ERROR_TEXTS["media.type_unsupported"],
    );
  });

  it("only the latest measurement of a day offers the photo, because the server attaches it to that one (FR-WAC-07)", async () => {
    fakeServer({
      existing: [
        { ...measurement, id: "m2" },
        { ...measurement, id: "m1", value: 11 },
      ],
    });
    show();
    await screen.findAllByRole("heading", { level: 3 });
    expect(screen.getAllByLabelText(/Foto hinzufügen/)).toHaveLength(1);
  });
});
