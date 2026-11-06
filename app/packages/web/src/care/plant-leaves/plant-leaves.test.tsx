// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LeafLogView, LeafRow } from "@pflanzendex/core";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeaturesProvider } from "@/shared/data";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { PlantLeaves } from "./plant-leaves";

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

const show = (on = true) =>
  render(
    <MemoryRouter>
      <FeaturesProvider features={{ leaf_log: on }}>
        <PlantLeaves api={API} token={TOKEN} specimenId="e1" />
      </FeaturesProvider>
    </MemoryRouter>,
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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
    expect(await screen.findByText("Noch kein neues Blatt")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Neues Blatt" }));
    expect(await screen.findByText("1 Blatt")).toBeTruthy();
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ method: "POST", path: "/specimens/e1/leaves" });
    expect(posts[0]?.body).not.toHaveProperty("lengthMm");
    expect(posts[0]?.body).toHaveProperty("timeZone");
  });

  it("US-WAC-07 the count and the leaves are listed newest first, with unknown sizes shown as unbekannt (P-08)", async () => {
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
    show();
    expect(await screen.findByText("2 Blätter")).toBeTruthy();
    const list = screen.getByRole("list", { name: "Neue Blätter" });
    const items = within(list).getAllByRole("listitem");
    expect(items[0]?.textContent).toContain("09.10.2026");
    expect(items[0]?.textContent).toContain("Länge 40 mm · Breite 12 mm");
    expect(items[0]?.textContent).toContain("Fensterung");
    expect(items[1]?.textContent).toContain("Länge unbekannt · Breite unbekannt");
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
    await user.click(await screen.findByRole("button", { name: "Blatt vom 09.10.2026 entfernen" }));
    expect(screen.getByText("Wirklich entfernen? Das Blatt ist danach weg.")).toBeTruthy();
    expect(posts).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(posts).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Blatt vom 09.10.2026 entfernen" }));
    await user.click(screen.getByRole("button", { name: "Ja, Blatt vom 09.10.2026 entfernen" }));
    expect(await screen.findByText("Noch kein neues Blatt")).toBeTruthy();
    expect(posts).toEqual([
      {
        method: "DELETE",
        path: "/specimens/e1/leaves/00000000-0000-4000-8000-000000000009",
        body: undefined,
      },
    ]);
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
    await user.type(screen.getByLabelText("Länge in mm (optional)"), "42");
    await user.type(screen.getByLabelText("Breite in mm (optional)"), "11");
    await user.type(screen.getByLabelText("Notiz (optional)"), "Fenster");
    await user.click(screen.getByRole("button", { name: "Blatt speichern" }));
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]?.body).toMatchObject({ lengthMm: 42, widthMm: 11, note: "Fenster" });
  });
});
