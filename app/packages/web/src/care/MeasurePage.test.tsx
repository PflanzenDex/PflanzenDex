// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
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
};
const specimen = { id: "e1", name: "Bogenhanf" };

function fakeServer(opts: { loadError?: boolean; save?: () => Promise<Response> } = {}) {
  const measurements: unknown[] = [];
  const posts: { body: Record<string, unknown>; key: string | undefined }[] = [];
  let loadAttempts = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (_url, init) => {
      if (init?.method === "POST") {
        posts.push({
          body: JSON.parse(String(init.body)) as Record<string, unknown>,
          key: (init.headers as Record<string, string>)["Idempotency-Key"],
        });
        if (opts.save) return opts.save();
        measurements.unshift(measurement);
        return response(201, measurement);
      }
      loadAttempts += 1;
      if (opts.loadError && loadAttempts === 1)
        return response(500, { error: { code: "server.error", text: "Das hat nicht geklappt." } });
      return response(200, {
        specimenId: "e1",
        growthMeasure: "height",
        measurements,
        last: measurements[0] ?? null,
        lastRating: measurements.length ? "healthy" : null,
      });
    }),
  );
  return { posts };
}

const show = (token: () => Promise<string | undefined> = async () => "tok", onBack = vi.fn()) =>
  render(<MeasurePage api="http://api" token={token} specimen={specimen} onBack={onBack} />);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-WAC-01 Seite Messen", () => {
  it('US-WAC-01 shows "Was messen?" after loading and the empty course with next step (P-09)', async () => {
    fakeServer();
    show();
    expect(screen.getByRole("status").textContent).toContain("werden geladen");
    expect(
      await screen.findByText("Noch keine Messung. Trage oben den ersten Messwert ein."),
    ).toBeTruthy();
    expect(screen.getByText(/Höhe\./)).toBeTruthy();
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

  it("US-WAC-01 an invalid input is rejected before sending and writes nothing", async () => {
    const { posts } = fakeServer();
    show();
    await userEvent.type(await screen.findByLabelText(/Messwert/), "12,3");
    await userEvent.click(screen.getByRole("button", { name: "Messung speichern" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Schritten von 0,5");
    expect(posts).toHaveLength(0);
  });

  it("US-WAC-01 if the server rejects, its text is there and the input stays", async () => {
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
    expect((await screen.findByRole("alert")).textContent).toContain("Das Exemplar gibt es nicht.");
    expect((field as HTMLInputElement).value).toBe("10");
  });

  it("US-WAC-01 without sign-in while saving: hint to sign in instead of a call", async () => {
    const { posts } = fakeServer();
    let signedIn = true;
    show(async () => (signedIn ? "tok" : undefined));
    await userEvent.type(await screen.findByLabelText(/Messwert/), "10");
    signedIn = false;
    await userEvent.click(screen.getByRole("button", { name: "Messung speichern" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Bitte melde dich neu an.");
    expect(posts).toHaveLength(0);
  });

  it("US-WAC-01 a load error offers reload, afterwards the view appears", async () => {
    fakeServer({ loadError: true });
    show();
    expect((await screen.findByRole("alert")).textContent).toContain("Das hat nicht geklappt.");
    await userEvent.click(screen.getByRole("button", { name: "Erneut laden" }));
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
});
