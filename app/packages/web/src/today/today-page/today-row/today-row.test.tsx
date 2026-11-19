// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TodayItem } from "@pflanzendex/core";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GroupedList } from "@/shared/lists/grouped-list/grouped-list";
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
          <TodayRow item={item({})} onOpen={vi.fn()} />
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
            onOpen={vi.fn()}
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
            onOpen={vi.fn()}
          />
        </GroupedList>,
      ),
    );
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

  it("US-QS-32 'Angaben fehlen' opens its layer in place: a button that announces a dialog, with a chevron and no link", async () => {
    const onOpen = vi.fn();
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
            onOpen={onOpen}
          />
        </GroupedList>,
      ),
    );
    const button = screen.getByRole("button", {
      name: "Angaben fehlen „Zeder“ hat noch keinen Standort.",
    });
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");
    expect(button.querySelector("svg")).not.toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    await userEvent.click(button);
    expect(onOpen).toHaveBeenCalledWith("hints");
  });

  it("US-QS-32 an overdue treatment shows the overdue count as its chip and the text without it", () => {
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
            onOpen={vi.fn()}
          />
        </GroupedList>,
      ),
    );
    expect(
      screen.getByRole("button", { name: /^10\s+Tage überfällig „Aloe“: Läuse\.$/ }),
    ).toBeTruthy();
  });

  it("US-QS-32 the date is the trailing value of the row, and no date is shown when none is given", () => {
    const { unmount } = render(
      wrap(
        <GroupedList>
          <TodayRow item={item({})} date="10.10.2026" onOpen={vi.fn()} />
        </GroupedList>,
      ),
    );
    expect(within(screen.getByRole("link")).getByText("Stand: 10.10.2026")).toBeTruthy();
    unmount();
    render(
      wrap(
        <GroupedList>
          <TodayRow item={item({})} onOpen={vi.fn()} />
        </GroupedList>,
      ),
    );
    expect(screen.queryByText(/Stand:/)).toBeNull();
  });

  it("US-QS-32 a row of a pager's list is bare: the list wraps it, so it is no list item of its own", () => {
    render(
      wrap(
        <ul>
          <li>
            <TodayRow item={item({})} onOpen={vi.fn()} bare />
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
          onOpen={vi.fn()}
          action={<button type="button">Behandlungen 5 · 2 überfällig</button>}
        />,
      ),
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Behandlungen 5 · 2 überfällig" })).toBeTruthy();
  });
});
