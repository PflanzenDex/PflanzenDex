// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { LayerHost } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { AchievementsOverviewSection } from "./overview";
import { hasOwnBorder, isTinted } from "@/shared/ui/button.roles";

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
  // The section sits in the frame of the account area (US-QS-15), so the layer opens in its pane.
  render(
    <MemoryRouter initialEntries={[at]}>
      <LayerHost>
        <AchievementsOverviewSection api="http://api" token={token} />
      </LayerHost>
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
    // Every group is a section of the one list (US-QS-15, SG-LIST-06): no choice hides the group "Wachstum".
    const [care, growth] = (await screen.findAllByRole("list", { name: "Erfolge" })) as [
      HTMLElement,
      HTMLElement,
    ];
    expect(within(care).getByText("Steckling bewurzelt")).toBeTruthy();
    expect(care.textContent).toContain("Erreicht am 04.05.2026 mit Aloe 1");
    expect(care.textContent).toContain(
      "Nächster Schritt: Hake die offene Behandlung bei Aloe 2 ab.",
    );
    expect(growth.textContent).toContain("Es gibt noch keine Messung.");
    expect(screen.queryByText(/Dein erster Schritt/)).toBeNull();
  });

  it("US-ACH-02 earned and open achievements stand in separate sections Erreicht and Noch offen", async () => {
    serve({
      calmMode: false,
      earnedCount: 1,
      newCount: 0,
      firstStep: null,
      groups: [
        {
          group: "care",
          earned: [item("cutting-rooted", { earnedOn: "2026-05-04" })],
          open: [item("treatment-completed", { nextStep: step("treatment-completed.next") })],
        },
        empty("growth"),
        empty("swapping"),
        empty("collecting"),
      ],
    });
    const earned = await screen.findByRole("region", { name: "Erreicht" });
    const open = screen.getByRole("region", { name: "Noch offen" });
    expect(within(earned).getByText("Steckling bewurzelt")).toBeTruthy();
    expect(within(earned).queryByText("Behandlung abgeschlossen")).toBeNull();
    expect(within(open).getByText("Behandlung abgeschlossen")).toBeTruthy();
    expect(within(open).queryByText("Steckling bewurzelt")).toBeNull();
    // Earned comes first (the order of the server), open follows.
    expect(earned.compareDocumentPosition(open) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The state is one level below the heading of its group, which is one below the layer's title (SG-HEAD-03).
    expect(screen.getByRole("heading", { level: 3, name: "Pflege · 1 von 2" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 4, name: "Erreicht" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 4, name: "Noch offen" })).toBeTruthy();
    // The icon of a section heading is a decoration; the text names the state.
    expect(earned.querySelector("h4 svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("US-ACH-02 the group choice counts earned of all, e.g. Pflege · 2 von 3", async () => {
    serve({
      calmMode: false,
      earnedCount: 2,
      newCount: 0,
      firstStep: null,
      groups: [
        {
          group: "care",
          earned: [
            item("cutting-rooted", { earnedOn: "2026-05-04" }),
            item("treatment-completed", { earnedOn: "2026-06-01" }),
          ],
          open: [item("through-dormancy", { nextStep: step("through-dormancy.next") })],
        },
        {
          group: "growth",
          earned: [],
          open: [
            item("first-measurement-photo", { nextStep: step("first-measurement-photo.next") }),
            item("healthy-for-a-year", { nextStep: step("healthy-for-a-year.next") }),
          ],
        },
        {
          group: "swapping",
          earned: [],
          open: [item("first-handover", { nextStep: step("first-handover.next") })],
        },
        empty("collecting"),
      ],
    });
    // The chip jumps to the group and is no filter (SG-LIST-06): it holds no pressed state.
    const chip = await screen.findByRole("button", { name: "Pflege · 2 von 3" });
    expect(chip.hasAttribute("aria-pressed")).toBe(false);
    expect(screen.getByRole("button", { name: "Wachstum · 0 von 2" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tauschen · 0 von 1" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /\(\d+\)/ })).toBeNull();
    // Every group has its section with the same count in its heading (SG-LIST-08).
    for (const name of ["Pflege · 2 von 3", "Wachstum · 0 von 2", "Tauschen · 0 von 1"])
      expect(screen.getByRole("heading", { level: 3, name })).toBeTruthy();
  });

  it("US-ACH-02 a new account's group choice reads 0 von 3 and shows no section Erreicht, only the open ones", async () => {
    const open = (ids: string[]) => ids.map((id) => item(id, { nextStep: step(`${id}.next`) }));
    serve({
      calmMode: false,
      earnedCount: 0,
      newCount: 0,
      firstStep: step("first-measurement-photo.next"),
      groups: [
        {
          group: "care",
          earned: [],
          open: open(["cutting-rooted", "treatment-completed", "through-dormancy"]),
        },
        {
          group: "growth",
          earned: [],
          open: open(["first-measurement-photo", "healthy-for-a-year"]),
        },
        { group: "swapping", earned: [], open: open(["first-handover"]) },
        empty("collecting"),
      ],
    });
    // The choice carries the fact (SG-LIST-07): no empty "Erreicht" section, no line that repeats the count.
    expect(await screen.findByRole("button", { name: "Pflege · 0 von 3" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: /Erreicht/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: /Erreicht/ })).toBeNull();
    expect(
      within(screen.getAllByRole("region", { name: "Noch offen" })[0] as HTMLElement).getByText(
        "Steckling bewurzelt",
      ),
    ).toBeTruthy();
  });

  it("US-ACH-02 a group with everything earned shows no section Noch offen, only Erreicht", async () => {
    serve({
      calmMode: false,
      earnedCount: 1,
      newCount: 0,
      firstStep: null,
      groups: [
        { group: "care", earned: [item("cutting-rooted", { earnedOn: "2026-05-04" })], open: [] },
        empty("growth"),
        empty("swapping"),
        empty("collecting"),
      ],
    });
    const earned = await screen.findByRole("region", { name: "Erreicht" });
    expect(within(earned).getByText("Steckling bewurzelt")).toBeTruthy();
    expect(screen.queryByRole("region", { name: /Noch offen/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: /Noch offen/ })).toBeNull();
    // The existing line for a group that is complete stays (US-ACH-02).
    expect(document.body.textContent).toContain("Du hast alle Erfolge dieser Liste erreicht.");
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
    await screen.findByRole("heading", { name: /^Pflege/ });
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

  it("US-ACH-03 marks a new achievement with text and 'Als gesehen markieren' writes the seen state with its id", async () => {
    serve(withNew(true));
    expect((await screen.findAllByText(/\(neu\)/)).length).toBe(1);
    expect(screen.getByText(/1 neuer Erfolg/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Als gesehen markieren" }));
    await waitFor(() => {
      const post = vi
        .mocked(fetch)
        .mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
      expect(JSON.parse(String((post?.[1] as RequestInit).body))).toMatchObject({
        achievements: ["cutting-rooted"],
      });
    });
  });

  it("US-ACH-03 an achievement that is not new carries no mark and no 'Als gesehen markieren'", async () => {
    serve(withNew(false));
    await screen.findByText("Steckling bewurzelt");
    expect(screen.queryByText(/\(neu\)/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Als gesehen markieren" })).toBeNull();
  });
});

describe("US-QS-32 · SG-BTN-01 the achievements overview: no outline button (FX-39 sweep 4)", () => {
  it("US-QS-32 · SG-BTN-01 'Als gesehen markieren' is the one tinted button of the notice, without a border", async () => {
    serve({
      calmMode: false,
      earnedCount: 1,
      newCount: 1,
      firstStep: null,
      groups: [
        { group: "care", earned: [item("cutting-rooted", { isNew: true })], open: [] },
        empty("growth"),
        empty("swapping"),
        empty("collecting"),
      ],
    });
    const mark = await screen.findByRole("button", { name: "Als gesehen markieren" });
    expect(isTinted(mark)).toBe(true);
    expect(hasOwnBorder(mark)).toBe(false);
  });
});
