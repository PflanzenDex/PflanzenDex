// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TodayItem } from "@pflanzendex/core";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { GroupedList } from "@/shared/lists/grouped-list/grouped-list";
import { LayerSheet } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { AnnouncerProvider } from "@/shared/platform/announcer/announcer";
import { RouteFocus } from "@/shared/platform/routing/route-focus/route-focus";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { TodayRow } from "./today-row";

afterEach(cleanup);

const wrap = (ui: React.ReactNode) => <MemoryRouter>{ui}</MemoryRouter>;

const item = (over: Partial<TodayItem>): TodayItem => ({
  id: "phase:1",
  kind: "phase_deviation",
  specimenId: "1",
  specimenName: "Monstera",
  text: "„Monstera“ steht nicht am Soll-Standort der Pflegephase.",
  nextAction: "Stelle die Pflanze um.",
  target: "care_phases",
  ...over,
});

describe("US-QS-32 a task row of Heute is one row with its whole target (SG-TOUCH-02, F-0110)", () => {
  it("US-QS-32 a row that opens a view is one link named by its visible text, with its address and a chevron", () => {
    render(
      wrap(
        <GroupedList>
          <TodayRow item={item({})} />
        </GroupedList>,
      ),
    );
    const link = screen.getByRole("link", {
      name: "Abweichung „Monstera“ steht nicht am Soll-Standort der Pflegephase.",
    });
    expect(link.getAttribute("href")).toBe("/collection?view=plants&group=phase");
    expect(link.querySelector("svg")).not.toBeNull();
    expect(link.querySelector("button")).toBeNull();
  });

  it("US-QS-32 'Prüfung fällig' and 'Nachschub' open the Sammlung as links, and the row has no outlined button", () => {
    render(
      wrap(
        <GroupedList>
          <TodayRow
            item={item({
              id: "equipment-check:1",
              kind: "equipment_check_due",
              specimenId: null,
              specimenName: null,
              text: "Regallampe 40 W wurde noch nie geprüft.",
              target: "equipment",
            })}
          />
          <TodayRow
            item={item({
              id: "buffer:z4",
              kind: "buffer_low",
              specimenId: null,
              specimenName: null,
              text: "Zone 4 braucht Nachschub (1 offener Kandidat).",
              target: "wishlist",
            })}
          />
        </GroupedList>,
      ),
    );
    // keepTogether joins "40 W" and "Zone 4" with no-break spaces, which the names keep (\s matches them).
    const check = screen.getByRole("link", {
      name: /^Prüfung fällig\s+Regallampe\s+40\s+W wurde noch nie geprüft\.$/,
    });
    expect(check.getAttribute("href")).toBe("/collection");
    const stock = screen.getByRole("link", {
      name: /^Nachschub\s+Zone\s+4 braucht Nachschub \(1 offener Kandidat\)\.$/,
    });
    expect(stock.getAttribute("href")).toBe("/collection");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("US-QS-32 'Angaben fehlen' opens its layer in place: a button that announces a dialog, with a chevron and no link", () => {
    render(
      wrap(
        <GroupedList>
          <TodayRow
            item={item({
              id: "hint:2:standort",
              kind: "specimen_incomplete",
              text: "„Zeder“ hat noch keinen Standort.",
              target: "hints",
            })}
          />
        </GroupedList>,
      ),
    );
    const button = screen.getByRole("button", {
      name: "Angaben fehlen „Zeder“ hat noch keinen Standort.",
    });
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.querySelector("svg")).not.toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("US-QS-32 · US-QS-15 a row that opens its layer shows it as expanded, and the focus returns to the row when the layer closes", async () => {
    setViewportWidth(360);
    render(
      <AnnouncerProvider>
        <MemoryRouter initialEntries={["/today"]}>
          <main id="inhalt" tabIndex={-1}>
            <RouteFocus titleOf={() => "Heute"} />
            <h1>Heute</h1>
            <GroupedList>
              <TodayRow
                item={item({
                  id: "hint:2:standort",
                  kind: "specimen_incomplete",
                  text: "„Zeder“ hat noch keinen Standort.",
                  target: "hints",
                })}
              />
            </GroupedList>
            <LayerSheet id="hints" title="Fehlt noch">
              <p>Hinweise</p>
            </LayerSheet>
          </main>
        </MemoryRouter>
      </AnnouncerProvider>,
    );
    const row = screen.getByRole("button", {
      name: "Angaben fehlen „Zeder“ hat noch keinen Standort.",
    });
    await userEvent.click(row);
    expect(await screen.findByRole("dialog", { name: "Fehlt noch" })).toBeTruthy();
    expect(row.getAttribute("aria-expanded")).toBe("true");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // The layer leaves with its animation; the focus goes back to the element that opened it (US-QS-15).
    await new Promise((r) => setTimeout(r, 400));
    expect(document.activeElement).toBe(row);
    expect(row.getAttribute("aria-expanded")).toBe("false");
  });

  it("US-QS-18 a most urgent treatment without its entry is the amber row, and its chip names the overdue count", () => {
    render(
      wrap(
        <GroupedList>
          <TodayRow
            item={item({
              id: "treatment:1",
              kind: "treatment_overdue",
              text: "„Aloe“: Läuse – überfällig seit 10 Tagen.",
              target: "treatments",
            })}
          />
        </GroupedList>,
      ),
    );
    // The chip joins "10" and "Tage" with a no-break space; the name keeps it, and \s matches it.
    const row = screen.getByRole("button", { name: /^10\s+Tage überfällig „Aloe“: Läuse\.$/ });
    expect(row.className).toContain("bg-warning");
    expect(row.className).not.toContain("hover:bg-muted");
  });

  it("US-QS-32 the date is the trailing value of the row, and no date is shown when none is given", () => {
    const { unmount } = render(
      wrap(
        <GroupedList>
          <TodayRow item={item({})} date="10.10.2026" />
        </GroupedList>,
      ),
    );
    expect(within(screen.getByRole("link")).getByText("Stand: 10.10.2026")).toBeTruthy();
    unmount();
    render(
      wrap(
        <GroupedList>
          <TodayRow item={item({})} />
        </GroupedList>,
      ),
    );
    expect(screen.queryByText(/Stand:/)).toBeNull();
  });

  it("US-QS-32 a row of a scrolling list is bare: the list wraps it, so it is no list item of its own", () => {
    render(
      wrap(
        <ul>
          <li>
            <TodayRow item={item({})} bare />
          </li>
        </ul>,
      ),
    );
    const outer = screen.getByRole("listitem");
    expect(outer.querySelector("li")).toBeNull();
    expect(within(outer).getByRole("link")).toBeTruthy();
  });

  it("US-QS-32 the most urgent treatment keeps its one 'Behandlungen' entry as its action, not an outlined row button", () => {
    render(
      wrap(
        <TodayRow
          item={item({
            id: "treatment:1",
            kind: "treatment_overdue",
            text: "„Aloe“: Läuse – überfällig seit 10 Tagen.",
            target: "treatments",
          })}
          treatmentEntry={<button type="button">Behandlungen 5 · 2 überfällig</button>}
        />,
      ),
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Behandlungen 5 · 2 überfällig" })).toBeTruthy();
  });

  it("US-QS-32 the treatment card's sentence is primary content at 16 px, its 'Stand' line is secondary at 14 px (SG-TYPE-02)", () => {
    render(
      wrap(
        <TodayRow
          item={item({
            id: "treatment:1",
            kind: "treatment_overdue",
            text: "„Aloe“: Läuse – überfällig seit 10 Tagen.",
            target: "treatments",
          })}
          date="10.10.2026"
          treatmentEntry={<button type="button">Behandlungen</button>}
        />,
      ),
    );
    expect(screen.getByText(/Aloe/).className).toContain("text-base");
    const stand = screen.getByText("Stand: 10.10.2026");
    expect(stand.className).toContain("text-sm");
    expect(stand.className).not.toContain("text-xs");
  });
});

describe("US-QS-32 · SG-LIST-01 the rows of the further tasks are dense, the row of Jetzt dran is not (issue 1854)", () => {
  it("US-QS-32 · SG-LIST-01 a row of a list of its own has 8 px above and below, so two rows fit the first screen at 360 x 640", () => {
    render(
      wrap(
        <ul>
          <li>
            <TodayRow item={item({})} bare />
          </li>
        </ul>,
      ),
    );
    const link = screen.getByRole("link");
    expect(link.className).toContain("py-2");
    expect(link.className).not.toContain("py-3");
  });

  it("US-QS-32 · SG-LIST-01 a row inside a group of its own (Jetzt dran) keeps its 12 px", () => {
    render(
      wrap(
        <GroupedList>
          <TodayRow item={item({})} />
        </GroupedList>,
      ),
    );
    expect(screen.getByRole("link").className).toContain("py-3");
  });
});
