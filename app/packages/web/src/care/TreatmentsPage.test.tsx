// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TreatmentsPage } from "./TreatmentsPage";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const specimen = (id: string, name: string, status = "plant") => ({ id, name, status });
const token = async () => "tok";

type Posted = { body: Record<string, unknown>; key: string | undefined };

function fakeServer(
  specimens: unknown[],
  save?: () => Promise<Response>,
): { posts: Posted[]; fetchFn: ReturnType<typeof vi.fn<typeof fetch>> } {
  const posts: Posted[] = [];
  const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path === "/specimens") return response(200, { specimens });
    if (path === "/treatments" && init?.method === "POST") {
      posts.push({
        body: JSON.parse(String(init.body)) as Record<string, unknown>,
        key: (init.headers as Record<string, string>)["Idempotency-Key"],
      });
      return save ? save() : response(201, { treatments: [{}, {}, {}] });
    }
    return response(404, {});
  });
  vi.stubGlobal("fetch", fetchFn);
  return { posts, fetchFn };
}
const show = () => render(<TreatmentsPage api="http://api" token={token} />);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-BEH-01 Seite Behandlung planen", () => {
  it("US-BEH-01 lists all active specimens, also cuttings, and says what to do without any (P-09, FR-BEH-04)", async () => {
    fakeServer([specimen("e1", "Bogenhanf"), specimen("e2", "Aloe", "cutting")]);
    show();
    expect(screen.getByRole("status").textContent).toContain("werden geladen");
    expect(await screen.findByRole("checkbox", { name: "Bogenhanf" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Aloe" })).toBeTruthy();
    cleanup();
    fakeServer([]);
    show();
    expect(await screen.findByText(/Lege zuerst ein Exemplar im Bestand an/)).toBeTruthy();
  });

  it("US-BEH-01 saves one treatment with several specimens, reason, agent and date, with an Idempotency-Key", async () => {
    const { posts } = fakeServer([specimen("e1", "Bogenhanf"), specimen("e2", "Aloe")]);
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("checkbox", { name: "Bogenhanf" }));
    await user.click(screen.getByRole("checkbox", { name: "Aloe" }));
    await user.type(screen.getByLabelText("Grund"), " Wollläuse ");
    await user.type(screen.getByLabelText("Mittel (optional)"), "Neemöl");
    await user.clear(screen.getByLabelText("Datum"));
    await user.type(screen.getByLabelText("Datum"), "2026-10-10");
    await user.click(screen.getByRole("button", { name: "Behandlung speichern" }));
    expect((await screen.findByRole("status")).textContent).toContain("geplant");
    expect(posts).toHaveLength(1);
    expect(posts[0]?.key).toBeTruthy();
    expect(posts[0]?.body).toEqual({
      specimenIds: ["e1", "e2"],
      reason: "Wollläuse",
      agent: "Neemöl",
      date: "2026-10-10",
    });
  });

  it("US-BEH-01 without reason, date or specimen nothing is sent and the form says why", async () => {
    const { posts } = fakeServer([specimen("e1", "Bogenhanf")]);
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Behandlung speichern" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Exemplar");
    await user.click(screen.getByRole("checkbox", { name: "Bogenhanf" }));
    await user.click(screen.getByRole("button", { name: "Behandlung speichern" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Grund");
    await user.type(screen.getByLabelText("Grund"), "Wollläuse");
    await user.clear(screen.getByLabelText("Datum"));
    await user.click(screen.getByRole("button", { name: "Behandlung speichern" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Datum");
    expect(posts).toHaveLength(0);
  });

  it('US-BEH-01 "Kur planen" offers 3 dates at 7 days and sends them as count and interval', async () => {
    const { posts } = fakeServer([specimen("e1", "Bogenhanf")]);
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("checkbox", { name: "Bogenhanf" }));
    await user.type(screen.getByLabelText("Grund"), "Wollläuse");
    await user.clear(screen.getByLabelText("Datum"));
    await user.type(screen.getByLabelText("Datum"), "2026-10-10");
    await user.click(screen.getByRole("checkbox", { name: "Kur planen (mehrere Termine)" }));
    expect((screen.getByLabelText("Anzahl der Termine") as HTMLInputElement).value).toBe("3");
    expect((screen.getByLabelText("Abstand in Tagen") as HTMLInputElement).value).toBe("7");
    await user.click(screen.getByRole("button", { name: "Kur planen" }));
    expect((await screen.findByRole("status")).textContent).toContain("3 Termine");
    expect(posts[0]?.body).toMatchObject({ count: 3, intervalDays: 7 });
  });

  it("US-BEH-01 a refusal of the server stays visible with its text and keeps the input (P-10)", async () => {
    fakeServer([specimen("e1", "Bogenhanf")], () =>
      response(409, {
        error: { code: "specimen.archived", text: "Dieses Exemplar ist archiviert." },
      }),
    );
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("checkbox", { name: "Bogenhanf" }));
    await user.type(screen.getByLabelText("Grund"), "Wollläuse");
    await user.click(screen.getByRole("button", { name: "Behandlung speichern" }));
    expect((await screen.findByRole("alert")).textContent).toContain("archiviert");
    expect((screen.getByLabelText("Grund") as HTMLInputElement).value).toBe("Wollläuse");
  });
});
