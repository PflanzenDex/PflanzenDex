// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import table from "../hint.de.json";
import { ContextHint } from "./context-hint";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

/** The hint state of the account: `due` is the one occasion the server picks; every write answers at once. */
function server(due: string | null, status = 200) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const u = new URL(String(url));
      calls.push(`${init?.method ?? "GET"} ${u.pathname}${u.search}`);
      if (u.pathname === "/onboarding/hints")
        return status === 200
          ? response(200, { hint: due, guideEnded: false })
          : response(status, { error: { code: "server.error" } });
      return response(200, { occasion: u.pathname.split("/").at(-1) });
    }),
  );
  return calls;
}

/** The layer's places: the note of an occasion stands in its own place, as the plant layer puts it. */
function places(applicable: string[], token = async () => "tok") {
  return (
    <MemoryRouter>
      <ContextHint api="http://api" token={token} applicable={applicable}>
        {(note) => (
          <>
            <div data-place="messen">{note("first_plant_saved")}</div>
            <div data-place="growth">{note("first_measurement")}</div>
            <p>Der Rest der Ansicht</p>
          </>
        )}
      </ContextHint>
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-ONB-07 · US-QS-32 the calm hint of the plant layer asks once for its occasions", () => {
  it("US-ONB-07 · US-QS-32 one request carries both occasions that apply, and the due note stands in its own place", async () => {
    const calls = server("first_plant_saved");
    render(places(["first_plant_saved", "first_measurement"]));
    const note = await screen.findByRole("status", { name: "Hinweis" });
    expect(note.textContent).toBe("Miss sie, um ihr Wachstum zu sehen.");
    expect(note.parentElement?.getAttribute("data-place")).toBe("messen");
    const asked = calls.filter((c) => c.startsWith("GET /onboarding/hints"));
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain("applicable=first_plant_saved%2Cfirst_measurement");
  });

  it("US-ONB-07 · US-QS-32 only one note at a time: the growth note does not show while the Messen note is due", async () => {
    server("first_plant_saved");
    render(places(["first_plant_saved", "first_measurement"]));
    await screen.findByRole("status", { name: "Hinweis" });
    expect(screen.queryByText(table.firstMeasurement)).toBeNull();
    expect(screen.getByText("Der Rest der Ansicht")).toBeTruthy();
  });

  it("US-ONB-07 · US-QS-32 the growth note stands in its own place when first_measurement is due", async () => {
    server("first_measurement");
    render(places(["first_plant_saved", "first_measurement"]));
    const note = await screen.findByRole("status", { name: "Hinweis" });
    expect(note.textContent).toBe("Foto und Größe zeigen ihr Wachstum.");
    expect(note.parentElement?.getAttribute("data-place")).toBe("growth");
  });

  it("US-ONB-07 nothing is asked when no occasion applies, and the layer still shows its content", async () => {
    const calls = server("first_plant_saved");
    render(places([]));
    expect(screen.getByText("Der Rest der Ansicht")).toBeTruthy();
    await waitFor(() => expect(calls).toEqual([]));
    expect(screen.queryByRole("status", { name: "Hinweis" })).toBeNull();
  });

  it("US-ONB-07 nothing is due (dismissed, expired, calm mode or style many): no note, the content stays", async () => {
    const calls = server(null);
    render(places(["first_plant_saved"]));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(screen.queryByRole("status", { name: "Hinweis" })).toBeNull();
    expect(screen.getByText("Der Rest der Ansicht")).toBeTruthy();
  });

  it("US-ONB-07 · P-10 a failed request fails open: no note, and the layer keeps its content", async () => {
    server("first_plant_saved", 500);
    render(places(["first_plant_saved"]));
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(screen.getByText("Der Rest der Ansicht")).toBeTruthy();
  });

  it("US-ONB-07 dismissing the note stores it for the account and the note leaves its place", async () => {
    const calls = server("first_plant_saved");
    render(places(["first_plant_saved", "first_measurement"]));
    await userEvent.click(await screen.findByRole("button", { name: "Hinweis schließen" }));
    await waitFor(() => expect(screen.queryByRole("status", { name: "Hinweis" })).toBeNull());
    expect(calls).toContain("PUT /onboarding/hints/first_plant_saved");
    // the other occasion waits for a later visit; the same layer does not ask again
    expect(calls.filter((c) => c.startsWith("GET /onboarding/hints"))).toHaveLength(1);
  });

  it("US-ONB-07 · NFR-13 the note is announced as text and its close control is reachable by keyboard", async () => {
    server("first_measurement");
    render(places(["first_measurement"]));
    expect((await screen.findByRole("status")).textContent).toContain(table.firstMeasurement);
    await userEvent.tab();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Hinweis schließen");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });

  it("US-ONB-07 · SG-ONB-02 the note is never above the content it sits in: the child places keep their order", async () => {
    server("first_measurement");
    const content: ReactNode = places(["first_measurement"]);
    render(content);
    const growth = await screen.findByRole("status", { name: "Hinweis" });
    const rest = screen.getByText("Der Rest der Ansicht");
    expect(growth.compareDocumentPosition(rest) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
