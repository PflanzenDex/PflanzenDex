// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../shared/data";
import { DraftsSection } from "./drafts-section";
import { expectOneLoadingStatus } from "@/shared/ui/skeleton.loading-contract";
import table from "../ai.de.json";
import { DraftsSkeleton } from "./drafts-section.skeleton";
import { hasOwnBorder, isFilled, isPlain } from "@/shared/ui/button.roles";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
const row = (over: Record<string, unknown> = {}) => ({
  id: "d1",
  clientName: "Claude",
  type: "wish",
  content: { name: "Aloe vera" },
  source: "https://example.test/q",
  status: "open",
  createdAt: "2026-10-10T08:00:00.000Z",
  ...over,
});

function fakeServer(rows: Record<string, unknown>[]) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const method = init?.method ?? "GET";
      const path = new URL(String(url)).pathname;
      if (method === "GET") return response(200, { drafts: rows });
      calls.push(`${method} ${path}`);
      return response(200, {});
    }),
  );
  return calls;
}
/** The address of the router: the layer the last control opened (`?sheet=<id>`, US-QS-15). */
function Address() {
  return <output data-testid="address">{useLocation().search}</output>;
}
const show = () =>
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <DraftsSection api="http://api" token={token} />
        <Address />
      </MemoryRouter>
    </QueryClientProvider>,
  );
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-KI-09 inbox of AI drafts", () => {
  it("US-KI-09 FX-81 says what will come here and offers 'Auftrag anlegen', which opens the new-task layer", async () => {
    fakeServer([]);
    const user = userEvent.setup();
    show();
    const line = await screen.findByRole("heading", { level: 3, name: "Noch keine Entwürfe" });
    const box = line.parentElement as HTMLElement;
    expect(within(box).getByText("Hier erscheinen die Ergebnisse deiner Aufträge.")).toBeTruthy();
    expect(
      within(box)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Auftrag anlegen"]);
    await user.click(within(box).getByRole("button", { name: "Auftrag anlegen" }));
    expect(screen.getByTestId("address").textContent).toBe("?sheet=new-task");
  });

  it("US-KI-09 shows type, name, connection, source and the label 'not reviewed' (KI-R5)", async () => {
    fakeServer([row()]);
    show();
    const list = await screen.findByRole("list", { name: "KI-Entwürfe" });
    expect(list.textContent).toContain("Wunsch: Aloe vera");
    expect(list.textContent).toContain("KI-Entwurf von Claude, noch nicht geprüft");
    expect(list.textContent).toContain("https://example.test/q");
  });

  it("US-KI-09 adopts and discards only open drafts, by the keeper's action", async () => {
    const calls = fakeServer([
      row(),
      row({ id: "d2", status: "adopted", content: { name: "Alt" } }),
    ]);
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Wunsch: Aloe vera übernehmen" }));
    await user.click(screen.getByRole("button", { name: "Wunsch: Aloe vera verwerfen" }));
    expect(calls).toEqual(["POST /ai/drafts/d1/adopt", "POST /ai/drafts/d1/discard"]);
    expect(screen.queryByRole("button", { name: "Wunsch: Alt übernehmen" })).toBeNull();
  });

  it("US-ENT-08 names a decision of Discover with the species and the answer", async () => {
    fakeServer([
      row({ type: "discover_decision", content: { species: "Ficus carica", decision: "yes" } }),
    ]);
    show();
    const list = await screen.findByRole("list", { name: "KI-Entwürfe" });
    expect(list.textContent).toContain("Entscheidung bei Entdecken: Ficus carica (Ja)");
  });
});

describe("US-QS-14 issue 1697 · the drafts show their shaped skeleton once", () => {
  it("US-QS-14 issue 1697 · a slow load shows one status with the loading text, and nothing before the delay", () =>
    expectOneLoadingStatus(
      <DraftsSkeleton label={table["drafts.loading"]} />,
      table["drafts.loading"],
    ));
});

describe("US-QS-32 · SG-BTN-01 the drafts: no outline button (FX-39 sweep 4)", () => {
  it("US-QS-32 · SG-BTN-01 'Verwerfen' is a plain button without a border, beside the filled 'Übernehmen'", async () => {
    fakeServer([row()]);
    show();
    const discard = await screen.findByRole("button", { name: "Wunsch: Aloe vera verwerfen" });
    expect(isPlain(discard)).toBe(true);
    expect(hasOwnBorder(discard)).toBe(false);
    expect(isFilled(screen.getByRole("button", { name: "Wunsch: Aloe vera übernehmen" }))).toBe(
      true,
    );
  });
});
