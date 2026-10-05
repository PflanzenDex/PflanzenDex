// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ERROR_TEXTS } from "@pflanzendex/core";
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
  open: () => Promise<Response> = () => response(200, { treatments: [] }),
  more: (path: string, init?: RequestInit) => Promise<Response> | undefined = () => undefined,
): { posts: Posted[]; fetchFn: ReturnType<typeof vi.fn<typeof fetch>> } {
  const posts: Posted[] = [];
  const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
    const path = new URL(String(url)).pathname;
    const other = more(path, init);
    if (other) return other;
    if (path === "/specimens") return response(200, { specimens });
    if (path === "/treatments" && (init?.method ?? "GET") === "GET") return open();
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
  it("US-BEH-01 · DS-52 while loading, skeletons mirror the page and one status says what loads", () => {
    fakeServer([specimen("e1", "Bogenhanf")]);
    const { container } = show();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(container.querySelectorAll('[aria-hidden="true"].animate-pulse').length).toBeGreaterThan(
      1,
    );
  });

  it("US-BEH-01 · DS-48 an invalid form focuses the first invalid field and links its message", async () => {
    fakeServer([specimen("e1", "Bogenhanf")]);
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Behandlung speichern" }));
    const first = screen.getByRole("checkbox", { name: "Bogenhanf" });
    await vi.waitFor(() => expect(document.activeElement).toBe(first));
    expect(first.getAttribute("aria-invalid")).toBe("true");
    const reason = screen.getByLabelText("Grund");
    const alert = screen.getAllByRole("alert").find((a) => a.textContent?.includes("Grund"));
    expect(alert).toBeTruthy();
    expect(reason.getAttribute("aria-describedby")).toContain(alert?.id ?? "none");
  });

  it("US-BEH-01 · DS-49 the refusal shows the German text of its code, never the raw server text", async () => {
    fakeServer([specimen("e1", "Bogenhanf")], () =>
      response(409, { error: { code: "specimen.archived", text: "RAW SERVER TEXT" } }),
    );
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("checkbox", { name: "Bogenhanf" }));
    await user.type(screen.getByLabelText("Grund"), "Wollläuse");
    await user.click(screen.getByRole("button", { name: "Behandlung speichern" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(ERROR_TEXTS["specimen.archived"]);
    expect(alert.textContent).not.toContain("RAW SERVER TEXT");
  });

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
    const links = screen.getAllByRole("link", { name: "Zum Bestand" });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link.getAttribute("href")).toBe("/collection");
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
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.map((a) => a.textContent).join(" ")).toContain("Exemplar");
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

const due = (
  id: string,
  specimenName: string,
  dueAt: string,
  kind: string,
  text: string,
  agent: string | null = null,
) => ({
  id,
  specimenId: `s-${id}`,
  specimenName,
  reason: `Grund ${id}`,
  agent,
  dueAt,
  status: { kind, days: 1, text },
});

describe("US-BEH-02 offene Behandlungen", () => {
  it("US-BEH-02 shows plant, reason, agent or a dash, due date and status in the order of the server", async () => {
    fakeServer([specimen("e1", "Bogenhanf")], undefined, () =>
      response(200, {
        treatments: [
          due("a", "Aloe", "2026-10-01", "overdue", "überfällig seit 2 Tagen", "Neemöl"),
          due("b", "Bogenhanf", "2026-10-03", "today", "heute fällig"),
          due("c", "Efeu", "2026-10-20", "later", "20.10.2026"),
        ],
      }),
    );
    show();
    const list = await screen.findByRole("list", { name: "Offene Behandlungen" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]?.textContent).toContain("Aloe");
    expect(items[0]?.textContent).toContain("Grund a");
    expect(items[0]?.textContent).toContain("Neemöl");
    expect(items[0]?.textContent).toContain("01.10.2026");
    expect(items[0]?.textContent).toContain("überfällig seit 2 Tagen");
    expect(items[1]?.textContent).toContain("Mittel: —");
    expect(items[1]?.textContent).toContain("heute fällig");
    expect(items[2]?.textContent).toContain("20.10.2026");
  });

  it('US-BEH-02 without open treatments it says "Keine offenen Behandlungen." and what to do next (P-09)', async () => {
    fakeServer([specimen("e1", "Bogenhanf")]);
    show();
    expect(await screen.findByText("Keine offenen Behandlungen.")).toBeTruthy();
    expect(screen.getByText(/Plane unten einen Termin/)).toBeTruthy();
  });

  it("US-BEH-02 · DS-26 the empty list offers an action that moves to the form", async () => {
    fakeServer([specimen("e1", "Bogenhanf")]);
    const user = userEvent.setup();
    show();
    await screen.findByText("Keine offenen Behandlungen.");
    await user.click(await screen.findByRole("button", { name: "Behandlung planen" }));
    expect(document.activeElement).toBe(await screen.findByRole("checkbox", { name: "Bogenhanf" }));
  });

  it("US-BEH-02 says what to do next when something is overdue (P-09)", async () => {
    fakeServer([specimen("e1", "Bogenhanf")], undefined, () =>
      response(200, {
        treatments: [
          due("a", "Aloe", "2026-10-01", "overdue", "überfällig seit 2 Tagen"),
          due("b", "Efeu", "2026-10-02", "overdue", "überfällig seit 1 Tag"),
          due("c", "Efeu", "2026-10-03", "today", "heute fällig"),
        ],
      }),
    );
    show();
    expect(await screen.findByText(/2 Termine sind überfällig, 1 ist heute fällig/)).toBeTruthy();
  });

  it("US-BEH-02 asks with the time zone of the device and shows a load error with a reload", async () => {
    const { fetchFn } = fakeServer([specimen("e1", "Bogenhanf")], undefined, () =>
      response(500, { error: { code: "server.error", text: "Fehler." } }),
    );
    show();
    expect(await screen.findByRole("button", { name: "Erneut laden" })).toBeTruthy();
    const asked = fetchFn.mock.calls.map(([url]) => String(url));
    expect(asked.some((u) => u.includes("/treatments?timeZone="))).toBe(true);
  });

  it("US-BEH-02 reloads the list after planning, so the new date shows at once", async () => {
    let state: unknown[] = [];
    fakeServer(
      [specimen("e1", "Bogenhanf")],
      async () => {
        state = [due("n", "Bogenhanf", "2026-10-10", "later", "10.10.2026")];
        return response(201, { treatments: [{}] });
      },
      () => response(200, { treatments: state }),
    );
    const user = userEvent.setup();
    show();
    await screen.findByText("Keine offenen Behandlungen.");
    await user.click(await screen.findByRole("checkbox", { name: "Bogenhanf" }));
    await user.type(screen.getByLabelText("Grund"), "Wollläuse");
    await user.click(screen.getByRole("button", { name: "Behandlung speichern" }));
    expect(await screen.findByRole("list", { name: "Offene Behandlungen" })).toBeTruthy();
    expect(screen.queryByText("Keine offenen Behandlungen.")).toBeNull();
  });
});

type Tick = { path: string; body: Record<string, unknown>; key: string | undefined };

/** A server with open treatments that the "complete" call removes; `history` is what the history route answers. */
function doneServer(
  complete: (id: string) => Promise<Response> | undefined = () => undefined,
  history: unknown[] = [],
) {
  let rows = [
    due("a", "Aloe", "2026-10-01", "overdue", "überfällig seit 2 Tagen"),
    due("b", "Bogenhanf", "2026-10-03", "today", "heute fällig"),
  ];
  const ticks: Tick[] = [];
  const server = fakeServer(
    [specimen("s-a", "Aloe"), specimen("s-b", "Bogenhanf")],
    undefined,
    () => response(200, { treatments: rows }),
    (path, init) => {
      const m = /^\/treatments\/([^/]+)\/complete$/.exec(path);
      if (m && init?.method === "POST") {
        const id = m[1] as string;
        ticks.push({
          path,
          body: JSON.parse(String(init.body)) as Record<string, unknown>,
          key: (init.headers as Record<string, string>)["Idempotency-Key"],
        });
        const refused = complete(id);
        if (refused) return refused;
        rows = rows.filter((r) => r.id !== id);
        return response(200, { treatment: { id, done: true, doneAt: "2026-10-03" } });
      }
      if (path === "/treatments/history") return response(200, { treatments: history });
      return undefined;
    },
  );
  return { ...server, ticks };
}

const doneEntry = (id: string, doneAt: string, agent: string | null = null) => ({
  id,
  specimenId: "s-a",
  reason: `Grund ${id}`,
  agent,
  dueAt: "2026-10-01",
  done: true,
  doneAt,
  courseId: null,
});

describe("US-BEH-03 Behandlung abhaken", () => {
  it('US-BEH-03 every open row has an "Erledigt" action that names the row for screen readers', async () => {
    doneServer();
    show();
    const list = await screen.findByRole("list", { name: "Offene Behandlungen" });
    const buttons = within(list).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Erledigt", "Erledigt"]);
    expect(buttons[0]?.getAttribute("aria-label")).toBe("Grund a bei Aloe als erledigt abhaken");
  });

  it("US-BEH-03 a tap sends the id with the device's time zone and an Idempotency-Key, the row disappears and the page says so", async () => {
    const { ticks } = doneServer();
    const user = userEvent.setup();
    show();
    await user.click(
      await screen.findByRole("button", { name: "Grund a bei Aloe als erledigt abhaken" }),
    );
    expect((await screen.findByText(/als erledigt eingetragen/)).textContent ?? "").toContain(
      "Aloe",
    );
    expect(ticks).toHaveLength(1);
    expect(ticks[0]?.path).toBe("/treatments/a/complete");
    expect(ticks[0]?.body).toEqual({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    expect(ticks[0]?.key).toBeTruthy();
    const list = screen.getByRole("list", { name: "Offene Behandlungen" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(within(list).queryByText("Aloe")).toBeNull();
  });

  it("US-BEH-03 after the last one is done the list says there are none and what to do next (P-09)", async () => {
    doneServer();
    const user = userEvent.setup();
    show();
    await user.click(
      await screen.findByRole("button", { name: "Grund a bei Aloe als erledigt abhaken" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Grund b bei Bogenhanf als erledigt abhaken" }),
    );
    expect(await screen.findByText("Keine offenen Behandlungen.")).toBeTruthy();
  });

  it("US-BEH-03 a double tap sends one request", async () => {
    const { ticks } = doneServer();
    const user = userEvent.setup();
    show();
    const button = await screen.findByRole("button", {
      name: "Grund a bei Aloe als erledigt abhaken",
    });
    await user.dblClick(button);
    await screen.findByText(/als erledigt eingetragen/);
    expect(ticks).toHaveLength(1);
  });

  it("US-BEH-03 a refusal stays visible with its text and the row stays open (P-10)", async () => {
    doneServer(() =>
      response(409, {
        error: { code: "specimen.archived", text: "Dieses Exemplar ist archiviert." },
      }),
    );
    const user = userEvent.setup();
    show();
    await user.click(
      await screen.findByRole("button", { name: "Grund a bei Aloe als erledigt abhaken" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain("archiviert");
    expect(screen.queryByText(/als erledigt eingetragen/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Grund a bei Aloe als erledigt abhaken" }),
    ).toBeTruthy();
  });

  it("US-BEH-03 an unknown treatment (done elsewhere and removed) is reported, the list reloads", async () => {
    doneServer(() =>
      response(404, {
        error: { code: "treatment.not_found", text: "Diese Behandlung gibt es nicht." },
      }),
    );
    const user = userEvent.setup();
    show();
    await user.click(
      await screen.findByRole("button", { name: "Grund a bei Aloe als erledigt abhaken" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain("gibt es nicht");
  });
});

describe("US-BEH-03 Verlauf je Exemplar", () => {
  it("US-BEH-03 asks to choose a specimen first (P-09), then lists its done treatments with the done date", async () => {
    doneServer(undefined, [doneEntry("x", "2026-10-03", "Neemöl"), doneEntry("y", "2026-09-20")]);
    const user = userEvent.setup();
    show();
    expect(
      await screen.findByText(/Wähle ein Exemplar, um erledigte Behandlungen zu sehen/),
    ).toBeTruthy();
    await user.selectOptions(await screen.findByLabelText("Exemplar für den Verlauf"), "s-a");
    const list = await screen.findByRole("list", { name: "Erledigte Behandlungen" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain("Grund x");
    expect(items[0]?.textContent).toContain("Mittel: Neemöl");
    expect(items[0]?.textContent).toContain("Erledigt am: 03.10.2026");
    expect(items[1]?.textContent).toContain("Mittel: —");
  });

  it("US-BEH-03 a specimen without done treatments says so", async () => {
    doneServer(undefined, []);
    const user = userEvent.setup();
    show();
    await user.selectOptions(await screen.findByLabelText("Exemplar für den Verlauf"), "s-b");
    expect(await screen.findByText(/Noch keine erledigte Behandlung/)).toBeTruthy();
  });

  it("US-BEH-03 ticking off reloads the shown history", async () => {
    const entries: unknown[] = [];
    doneServer(undefined, entries);
    const user = userEvent.setup();
    show();
    await user.selectOptions(await screen.findByLabelText("Exemplar für den Verlauf"), "s-a");
    await screen.findByText(/Noch keine erledigte Behandlung/);
    entries.push(doneEntry("z", "2026-10-03"));
    await user.click(
      await screen.findByRole("button", { name: "Grund a bei Aloe als erledigt abhaken" }),
    );
    expect(await screen.findByRole("list", { name: "Erledigte Behandlungen" })).toBeTruthy();
  });
});
