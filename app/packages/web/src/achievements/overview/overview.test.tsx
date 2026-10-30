// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AchievementsOverviewSection } from "./overview";

beforeAll(() => {
  // jsdom has no matchMedia; a wide screen shows the layer as a pane beside the list (US-QS-15), not as a modal.
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
    onchange: null,
  })) as unknown as typeof window.matchMedia;
});

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
const item = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  isNew: false,
  earnedOn: null,
  specimenId: null,
  specimenName: null,
  nextStep: null,
  missing: null,
  ...extra,
});
const step = (key: string, specimenName: string | null = null) => ({
  key,
  specimenId: null,
  specimenName,
});

/** The overview at an address: the layer "Erfolge" is open by default (US-QS-15), inline texts show at any address. */
function serve(body: unknown, at = "/?sheet=earned") {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () => response(200, body)),
  );
  render(
    <MemoryRouter initialEntries={[at]}>
      <AchievementsOverviewSection api="http://api" token={token} />
    </MemoryRouter>,
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const empty = (group: string) => ({ group, earned: [], open: [] });

describe("US-ACH-02 achievements overview", () => {
  it("US-ACH-02 earned ones show name, date and specimen, open ones the next step and what is missing", async () => {
    serve({
      calmMode: false,
      earnedCount: 1,
      newCount: 0,
      firstStep: null,
      groups: [
        {
          group: "care",
          earned: [item("cutting-rooted", { earnedOn: "2026-05-04", specimenName: "Aloe 1" })],
          open: [
            item("treatment-completed", {
              nextStep: step("treatment-completed.next", "Aloe 2"),
            }),
          ],
        },
        {
          group: "growth",
          earned: [],
          open: [
            item("first-measurement-photo", {
              nextStep: step("first-measurement-photo.next"),
              missing: "no_measurements",
            }),
          ],
        },
        empty("swapping"),
        empty("collecting"),
      ],
    });
    const list = await screen.findByRole("list", { name: "Erfolge" });
    expect(within(list).getByText("Steckling bewurzelt")).toBeTruthy();
    expect(list.textContent).toContain("Erreicht am 04.05.2026 mit Aloe 1");
    expect(list.textContent).toContain(
      "Nächster Schritt: Hake das letzte offene Datum der Kur bei Aloe 2 ab.",
    );
    await userEvent.click(screen.getByRole("button", { name: /^Wachstum/ }));
    expect((await screen.findByRole("list", { name: "Erfolge" })).textContent).toContain(
      "Es gibt noch keine Messung.",
    );
    expect(screen.queryByText(/Dein erster Schritt/)).toBeNull();
  });

  it("US-ACH-02 the group Sammeln links to the Pokédex and shows no achievements of its own", async () => {
    serve({ calmMode: false, earnedCount: 0, firstStep: null, groups: [empty("collecting")] });
    expect((await screen.findByRole("link", { name: "Pokédex" })).getAttribute("href")).toBe(
      "/collection?view=species",
    );
    expect(screen.queryByRole("button", { name: /^Sammeln/ })).toBeNull();
  });

  it("US-ACH-02 without data the overview names the first step instead of an empty list", async () => {
    serve(
      {
        calmMode: false,
        earnedCount: 0,
        firstStep: step("first-measurement-photo.next"),
        groups: [empty("care")],
      },
      "/",
    );
    expect(
      await screen.findByText(
        "Dein erster Schritt: Miss eine Pflanze und füge der Messung ein Foto hinzu.",
      ),
    ).toBeTruthy();
  });

  it("US-ACH-02 no percentage, no score, no comparison with others is shown", async () => {
    serve({ calmMode: false, earnedCount: 0, firstStep: null, groups: [empty("care")] });
    await screen.findByRole("button", { name: /^Pflege/ });
    expect(document.body.textContent).not.toMatch(/%|Punkte|Rang \d|seltener/);
  });

  it("US-ACH-08 in calm mode nothing of the overview is shown", async () => {
    serve({ calmMode: true });
    await vi.waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("US-ACH-03 new achievements in the overview", () => {
  const withNew = (isNew: boolean) => ({
    calmMode: false,
    earnedCount: 1,
    newCount: isNew ? 1 : 0,
    firstStep: null,
    groups: [
      {
        group: "care",
        earned: [item("cutting-rooted", { earnedOn: "2026-05-04", isNew })],
        open: [],
      },
      empty("growth"),
      empty("swapping"),
      empty("collecting"),
    ],
  });

  it("US-ACH-03 marks a new achievement with text and Okay writes the seen state with its id", async () => {
    serve(withNew(true));
    expect((await screen.findAllByText(/\(neu\)/)).length).toBe(1);
    expect(screen.getByText(/1 neuer Erfolg/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Okay" }));
    await waitFor(() => {
      const post = vi
        .mocked(fetch)
        .mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
      expect(JSON.parse(String((post?.[1] as RequestInit).body))).toMatchObject({
        achievements: ["cutting-rooted"],
      });
    });
  });

  it("US-ACH-03 an achievement that is not new carries no mark and no Okay", async () => {
    serve(withNew(false));
    await screen.findByText("Steckling bewurzelt");
    expect(screen.queryByText(/\(neu\)/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Okay" })).toBeNull();
  });
});
