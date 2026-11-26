// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LeafLogView, LeafRow } from "@pflanzendex/core";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeaturesProvider } from "@/shared/data";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { filledIn, hasOwnBorder, isFilled, isPlain, isTinted } from "@/shared/ui/button.roles";
import { LayerScope } from "@/shared/ui/layer-scope";
import { PlantLeaves } from "./plant-leaves";
import { expectOneLoadingStatus } from "@/shared/ui/skeleton.loading-contract";
import table from "./plant-leaves.de.json";
import { LeafLogSkeleton } from "./plant-leaves.skeleton";

const json = (status: number, body: unknown) => Response.json(body, { status });
const TOKEN = async () => "tok";
const API = "http://api";

const leaf = (n: number, extra: Partial<LeafRow> = {}): LeafRow => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  specimenId: "e1",
  date: `2026-10-${String(n).padStart(2, "0")}`,
  lengthMm: null,
  widthMm: null,
  note: null,
  createdAt: `2026-10-${String(n).padStart(2, "0")}T08:00:00.000000Z`,
  ...extra,
});
const view = (leaves: LeafRow[], extra: Partial<LeafLogView> = {}): LeafLogView => ({
  specimenId: "e1",
  keeperOff: false,
  count: leaves.length,
  comparison: null,
  leaves,
  ...extra,
});

type Posts = { path: string; method: string; body: unknown }[];
/** Answers by "METHOD path"; a request without a route answers 404. Every write is recorded. */
function server(routes: Record<string, () => Response>): Posts {
  const posts: Posts = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const u = new URL(String(url));
      const method = init?.method ?? "GET";
      if (method !== "GET")
        posts.push({
          path: u.pathname,
          method,
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
      const make = routes[`${method} ${u.pathname}`];
      return make ? make() : json(404, { error: { code: "specimen.not_found", text: "x" } });
    }),
  );
  return posts;
}

// `inLayer`: the log in a sheet or a dialog is one scrolling list as on a page (US-QS-15, SG-LIST-01, issue 2418).
const show = (on = true, inLayer = false) =>
  render(
    <MemoryRouter>
      <LayerScope.Provider value={inLayer}>
        <FeaturesProvider features={{ leaf_log: on }}>
          <PlantLeaves api={API} token={TOKEN} specimenId="e1" />
        </FeaturesProvider>
      </LayerScope.Provider>
    </MemoryRouter>,
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setViewportWidth(360);
});

describe("US-WAC-07 the new-leaf log of a plant", () => {
  it('US-WAC-07 one tap on "Neues Blatt" records a leaf of today without a size, and the list shows it', async () => {
    let leaves: LeafRow[] = [];
    const posts = server({
      "GET /specimens/e1/leaves": () => json(200, view(leaves)),
      "POST /specimens/e1/leaves": () => {
        leaves = [leaf(3)];
        return json(201, leaves[0]);
      },
    });
    const user = userEvent.setup();
    show();
    expect(await screen.findByText("Noch kein Blatt erfasst.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Neues Blatt" }));
    expect(await screen.findByText("1 Blatt")).toBeTruthy();
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ method: "POST", path: "/specimens/e1/leaves" });
    expect(posts[0]?.body).not.toHaveProperty("lengthMm");
    expect(posts[0]?.body).toHaveProperty("timeZone");
  });

  it("US-QS-32 · SG-STATE-01 · issue 2233 an empty log is one line: Neues Blatt and Mit Details above are its steps", async () => {
    server({ "GET /specimens/e1/leaves": () => json(200, view([])) });
    const user = userEvent.setup();
    show();
    expect(await screen.findByText("Noch kein Blatt erfasst.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Blatt erfassen" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Mit Details" }));
    expect(await screen.findByText("Neues Blatt festhalten")).toBeTruthy();
  });

  it("US-WAC-07 the count and the leaves are listed newest first in one scrolling list, with unknown sizes shown as unbekannt (P-08)", async () => {
    // A layer never pages (US-QS-15, SG-LIST-01, issue 2418): both leaves are on the list.
    setViewportWidth(1024);
    server({
      "GET /specimens/e1/leaves": () =>
        json(
          200,
          view([
            leaf(9, { lengthMm: 40, widthMm: 12, note: "Fensterung" }),
            leaf(2, { lengthMm: null, widthMm: null }),
          ]),
        ),
    });
    show(true, true);
    expect(await screen.findByText("2 Blätter")).toBeTruthy();
    const list = screen.getByRole("list", { name: "Neue Blätter" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain("09.10.2026");
    expect(rows[0]?.textContent).toContain("Länge 40 mm · Breite 12 mm");
    expect(rows[0]?.textContent).toContain("Fensterung");
    expect(rows[1]?.textContent).toContain("Länge unbekannt · Breite unbekannt");
    expect(screen.queryByText(/^Seite \d+ von \d+$/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Weiter" })).toBeNull();
  });

  it("US-QS-15 · SG-LIST-01 on a page the leaves are one scrolling list at a tablet width too: every leaf, no pages", async () => {
    setViewportWidth(1024);
    server({ "GET /specimens/e1/leaves": () => json(200, view([leaf(9), leaf(2)])) });
    show();
    expect(await screen.findByText("2 Blätter")).toBeTruthy();
    const list = screen.getByRole("list", { name: "Neue Blätter" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByText(/^Seite \d+ von \d+$/)).toBeNull();
  });

  it("US-WAC-07 the two buttons of the log share one row of two equal columns, so they do not wrap on a phone", async () => {
    server({ "GET /specimens/e1/leaves": () => json(200, view([])) });
    show();
    const quick = await screen.findByRole("button", { name: "Neues Blatt" });
    const details = screen.getByRole("button", { name: "Mit Details" });
    expect(quick.parentElement).toBe(details.parentElement);
    expect(quick.parentElement?.className).toContain("grid-cols-2");
  });

  it("US-QS-15 · US-QS-32 · SG-BTN-02 'Neues Blatt' is tinted, 'Mit Details' beside it is plain: the plant layer keeps its one filled action elsewhere", async () => {
    server({ "GET /specimens/e1/leaves": () => json(200, view([])) });
    const { container } = show();
    const quick = await screen.findByRole("button", { name: "Neues Blatt" });
    const details = screen.getByRole("button", { name: "Mit Details" });
    expect(isTinted(quick)).toBe(true);
    expect(isFilled(details)).toBe(false);
    expect(hasOwnBorder(details)).toBe(false);
    expect(filledIn(container)).toEqual([]);
  });

  it("US-QS-32 · SG-BTN-03 the removal of a leaf is a red plain button named 'Blatt entfernen'", async () => {
    server({
      "GET /specimens/e1/leaves": () =>
        json(200, view([leaf(9, { lengthMm: 40, widthMm: 12, note: null })])),
    });
    show();
    const row = within(await screen.findByRole("list", { name: "Neue Blätter" })).getByRole(
      "listitem",
    );
    const remove = within(row).getByRole("button", { name: "Blatt entfernen: 09.10.2026" });
    expect(remove.textContent).toBe("Blatt entfernen");
    // The accessible name starts with the visible label (WCAG 2.5.3, axe label-content-name-mismatch, issue 1853).
    expect(remove.getAttribute("aria-label")?.startsWith("Blatt entfernen")).toBe(true);
    expect(remove.className.split(/\s+/)).toContain("text-destructive");
    expect(remove.className.split(/\s+/).some((c) => /^bg-/.test(c))).toBe(false);
  });

  it("US-WAC-07 a leaf row keeps its date and sizes with Blatt entfernen on one line, and the note below them", async () => {
    server({
      "GET /specimens/e1/leaves": () =>
        json(200, view([leaf(9, { lengthMm: 40, widthMm: 12, note: "Fensterung" })])),
    });
    show();
    const row = within(await screen.findByRole("list", { name: "Neue Blätter" })).getByRole(
      "listitem",
    );
    const remove = within(row).getByRole("button", { name: "Blatt entfernen: 09.10.2026" });
    // The button sits in the top line with the date and the sizes; the note is a line of its own below it.
    const line = remove.parentElement;
    expect(line?.textContent).toContain("09.10.2026");
    expect(line?.textContent).toContain("Länge 40 mm · Breite 12 mm");
    expect(line?.textContent).not.toContain("Fensterung");
    expect(row.textContent?.indexOf("Fensterung")).toBeGreaterThan(
      row.textContent?.indexOf("Länge 40 mm") ?? Number.POSITIVE_INFINITY,
    );
  });

  it("US-WAC-07 the comparison of the newest leaf with the last earlier one is shown", async () => {
    server({
      "GET /specimens/e1/leaves": () =>
        json(
          200,
          view([leaf(9, { lengthMm: 40 }), leaf(2, { lengthMm: 30 })], {
            comparison: { measure: "length", direction: "larger" },
          }),
        ),
    });
    show();
    expect(await screen.findByText("Größer als das letzte Blatt mit Länge")).toBeTruthy();
  });

  it("US-WAC-07 without a pair of sizes no comparison is shown, not even a guess (P-08)", async () => {
    server({ "GET /specimens/e1/leaves": () => json(200, view([leaf(9), leaf(2)])) });
    show();
    expect(await screen.findByText("2 Blätter")).toBeTruthy();
    expect(screen.queryByText(/Größer als|Kleiner als|Gleich groß/)).toBeNull();
  });

  it("US-WAC-07 removing a leaf asks first and deletes only after the confirmation", async () => {
    let leaves = [leaf(9, { lengthMm: 40 })];
    const posts = server({
      "GET /specimens/e1/leaves": () => json(200, view(leaves)),
      "DELETE /specimens/e1/leaves/00000000-0000-4000-8000-000000000009": () => {
        leaves = [];
        return json(200, { id: "00000000-0000-4000-8000-000000000009" });
      },
    });
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Blatt entfernen: 09.10.2026" }));
    expect(screen.getByText("Wirklich entfernen? Das Blatt ist danach weg.")).toBeTruthy();
    expect(posts).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(posts).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Blatt entfernen: 09.10.2026" }));
    await user.click(screen.getByRole("button", { name: "Entfernen: Blatt vom 09.10.2026" }));
    expect(await screen.findByText("Noch kein Blatt erfasst.")).toBeTruthy();
    expect(posts).toEqual([
      {
        method: "DELETE",
        path: "/specimens/e1/leaves/00000000-0000-4000-8000-000000000009",
        body: undefined,
      },
    ]);
  });

  it("US-QS-32 · SG-BTN-03 the confirm 'Entfernen' of a leaf has an accessible name that contains its visible label (WCAG 2.5.3)", async () => {
    server({ "GET /specimens/e1/leaves": () => json(200, view([leaf(9, { lengthMm: 40 })])) });
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Blatt entfernen: 09.10.2026" }));
    const confirm = screen.getByRole("button", { name: "Entfernen: Blatt vom 09.10.2026" });
    expect(confirm.textContent).toBe("Entfernen");
    expect(confirm.getAttribute("aria-label")?.startsWith(confirm.textContent ?? "")).toBe(true);
    expect(isPlain(screen.getByRole("button", { name: "Abbrechen" }))).toBe(true);
  });

  it("US-WAC-07 with the keeper switch off the plant shows nothing and asks for nothing (P-12)", async () => {
    const posts = server({ "GET /specimens/e1/leaves": () => json(200, view([leaf(9)])) });
    const { container } = show(false);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.textContent).toBe("");
    expect(screen.queryByRole("button", { name: "Neues Blatt" })).toBeNull();
    expect(posts).toHaveLength(0);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('US-WAC-07 the "Neues Blatt" button is reachable and usable with the keyboard', async () => {
    const posts = server({
      "GET /specimens/e1/leaves": () => json(200, view([])),
      "POST /specimens/e1/leaves": () => json(201, leaf(3)),
    });
    const user = userEvent.setup();
    show();
    const button = await screen.findByRole("button", { name: "Neues Blatt" });
    expect(button.tabIndex).toBeGreaterThanOrEqual(0);
    button.focus();
    expect(document.activeElement).toBe(button);
    await user.keyboard("{Enter}");
    expect(posts).toHaveLength(1);
  });

  it("US-WAC-07 the details form sends the sizes in millimetres and the note", async () => {
    const posts = server({
      "GET /specimens/e1/leaves": () => json(200, view([])),
      "POST /specimens/e1/leaves": () =>
        json(201, leaf(3, { lengthMm: 42, widthMm: 11, note: "Fenster" })),
    });
    setViewportWidth(1024);
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Mit Details" }));
    await screen.findByRole("dialog");
    await user.type(screen.getByLabelText("Länge (optional)"), "42");
    await user.type(screen.getByLabelText("Breite (optional)"), "11");
    await user.type(screen.getByLabelText("Notiz (optional)"), "Fenster");
    await user.click(screen.getByRole("button", { name: "Blatt sichern" }));
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]?.body).toMatchObject({ lengthMm: 42, widthMm: 11, note: "Fenster" });
  });
});

describe("US-QS-03 · P-10 a key conflict of a new leaf can be dismissed", () => {
  const CONFLICT = () =>
    json(409, { error: { code: "idempotency.key_conflict", text: "raw server text" } });
  const postKeys = () =>
    vi
      .mocked(fetch)
      .mock.calls.filter(([, init]) => init?.method === "POST")
      .map(([, init]) => (init?.headers as Record<string, string>)["Idempotency-Key"]);

  it("US-QS-03 · P-10 the quick leaf: 'Hinweis schließen' clears the notice and frees the key for the next leaf", async () => {
    server({
      "GET /specimens/e1/leaves": () => json(200, view([])),
      "POST /specimens/e1/leaves": CONFLICT,
    });
    const user = userEvent.setup();
    show();
    const newLeaf = await screen.findByRole("button", { name: "Neues Blatt" });
    await user.click(newLeaf);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Deine erste Eingabe ist gesichert.");
    await user.click(within(alert).getByRole("button", { name: "Hinweis schließen" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.activeElement).toBe(newLeaf);
    await user.click(newLeaf);
    await screen.findByRole("alert");
    const keys = postKeys();
    expect(keys).toHaveLength(2);
    expect(keys[1]).not.toBe(keys[0]);
  });

  it("US-QS-03 · P-10 the details form: 'Hinweis schließen' clears the notice in the form and keeps the input", async () => {
    server({
      "GET /specimens/e1/leaves": () => json(200, view([])),
      "POST /specimens/e1/leaves": CONFLICT,
    });
    setViewportWidth(1024);
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Mit Details" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(screen.getByLabelText("Notiz (optional)"), "Fenster");
    await user.click(screen.getByRole("button", { name: "Blatt sichern" }));
    const alert = await within(dialog).findByRole("alert");
    await user.click(within(alert).getByRole("button", { name: "Hinweis schließen" }));
    expect(within(dialog).queryByRole("alert")).toBeNull();
    expect((screen.getByLabelText("Notiz (optional)") as HTMLInputElement).value).toBe("Fenster");
  });
});

describe("US-QS-14 issue 1697 · the leaf log show their shaped skeleton once", () => {
  it("US-QS-14 issue 1697 · a slow load shows one status with the loading text, and nothing before the delay", () =>
    expectOneLoadingStatus(<LeafLogSkeleton label={table["loading"]} />, table["loading"]));
});
