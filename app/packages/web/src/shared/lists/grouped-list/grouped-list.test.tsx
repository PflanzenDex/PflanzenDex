// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GroupedList, GroupedRow } from "./grouped-list";

afterEach(cleanup);

const wrap = (ui: React.ReactNode) => <MemoryRouter>{ui}</MemoryRouter>;

describe("US-QS-32 GroupedList (SG-SHAPE-03, SG-HEAD-03)", () => {
  it("US-QS-32 the section label is a heading that names the section, and the section is labelled by it", () => {
    render(
      wrap(
        <GroupedList label="Konto">
          <GroupedRow title="Einstellungen" />
        </GroupedList>,
      ),
    );
    const heading = screen.getByRole("heading", { name: "Konto", level: 2 });
    expect(heading.className).toContain("text-base");
    expect(heading.className).toContain("font-semibold");
    expect(screen.getByRole("region", { name: "Konto" })).toBeTruthy();
  });

  it("US-QS-32 a level of the label can be given, so the page keeps one heading order", () => {
    render(
      wrap(
        <GroupedList label="Daten" level={3}>
          <GroupedRow title="Meine Daten" />
        </GroupedList>,
      ),
    );
    expect(screen.getByRole("heading", { name: "Daten", level: 3 })).toBeTruthy();
  });

  it("US-QS-32 rows are list items of one group, and a group without a label has no region", () => {
    render(
      wrap(
        <GroupedList>
          <GroupedRow title="Profil" />
          <GroupedRow title="Konto löschen" />
        </GroupedList>,
      ),
    );
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]?.parentElement?.tagName).toBe("UL");
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("US-QS-32 the group is flat: rounded, on the card colour, with no shadow and no nested frame (SG-SHAPE-05)", () => {
    render(
      wrap(
        <GroupedList label="App">
          <GroupedRow title="Was die App kann" />
        </GroupedList>,
      ),
    );
    const group = screen.getByRole("listitem").parentElement as HTMLElement;
    expect(group.className).toContain("rounded-card");
    expect(group.className).toContain("bg-card");
    expect(group.className).not.toMatch(/shadow/);
    expect(group.className).toContain("forced-colors:border-[CanvasText]");
  });

  it("US-QS-32 the footer is a quiet line under the group (14 px, muted)", () => {
    render(
      wrap(
        <GroupedList footer="Nur auf diesem Gerät.">
          <GroupedRow title="Erinnerungen" />
        </GroupedList>,
      ),
    );
    const footer = screen.getByText("Nur auf diesem Gerät.");
    expect(footer.className).toContain("text-sm");
    expect(footer.className).toContain("text-muted-foreground");
  });
});

describe("US-QS-32 GroupedRow (SG-LIST-04, SG-TYPE-02, SG-COLOR-02)", () => {
  it("US-QS-32 a navigation row is a link and shows a chevron", () => {
    render(
      wrap(
        <GroupedList>
          <GroupedRow to="/account/settings" title="Einstellungen" trailing="Lena" />
        </GroupedList>,
      ),
    );
    const link = screen.getByRole("link", { name: /Einstellungen/ });
    expect(link.textContent).toContain("Lena");
    expect(link.getAttribute("href")).toBe("/account/settings");
    expect(link.querySelector("svg")).not.toBeNull();
  });

  it("US-QS-32 an action row is a button with a chevron, and it runs its action", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      wrap(
        <GroupedList>
          <GroupedRow onClick={onClick} title="App installieren" />
        </GroupedList>,
      ),
    );
    const button = screen.getByRole("button", { name: "App installieren" });
    expect(button.querySelector("svg")).not.toBeNull();
    expect(button.className).not.toContain("rounded-pill");
    expect(button.className).toContain("rounded-none");
    await user.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("US-QS-32 a static row is plain text: no link, no button, no chevron", () => {
    render(
      wrap(
        <GroupedList>
          <GroupedRow title="Was die App kann" meta="unbekannt" />
        </GroupedList>,
      ),
    );
    const row = screen.getByRole("listitem");
    expect(within(row).queryByRole("link")).toBeNull();
    expect(within(row).queryByRole("button")).toBeNull();
    expect(row.querySelector("svg")).toBeNull();
  });

  it("US-QS-32 current sets aria-current=page and a semibold title, not colour alone (SG-COLOR-05)", () => {
    render(
      wrap(
        <GroupedList>
          <GroupedRow to="/a" title="Einstellungen" current />
          <GroupedRow to="/b" title="Erinnerungen" />
        </GroupedList>,
      ),
    );
    const current = screen.getByRole("link", { name: "Einstellungen" });
    expect(current.getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("Einstellungen").className).toContain("font-semibold");
    const other = screen.getByRole("link", { name: "Erinnerungen" });
    expect(other.getAttribute("aria-current")).toBeNull();
    expect(screen.getByText("Erinnerungen").className).not.toContain("font-semibold");
  });

  it("US-QS-32 tone destructive is a red action row without a chevron (SG-COLOR-04)", () => {
    render(
      wrap(
        <GroupedList>
          <GroupedRow tone="destructive" onClick={() => undefined} title="Abmelden …" />
        </GroupedList>,
      ),
    );
    const button = screen.getByRole("button", { name: "Abmelden …" });
    expect(button.querySelector("svg")).toBeNull();
    expect(screen.getByText("Abmelden …").className).toContain("text-destructive");
  });

  it("US-QS-32 the title is 16 px and wraps, the meta line is 14 px, and a row is at least 44 px high", () => {
    render(
      wrap(
        <GroupedList>
          <GroupedRow to="/a" title="Zone 1 · Stecklingslicht" meta="bis 1.500 Lux" />
        </GroupedList>,
      ),
    );
    const title = screen.getByText("Zone 1 · Stecklingslicht");
    expect(title.className).toContain("text-base");
    expect(title.className).toContain("[overflow-wrap:anywhere]");
    expect(title.className).not.toContain("truncate");
    expect(screen.getByText("bis 1.500 Lux").className).toContain("text-sm");
    expect(screen.getByRole("link").className).toContain("min-h-11");
  });

  it("US-QS-32 a row keeps a visible focus ring on its link", () => {
    render(
      wrap(
        <GroupedList>
          <GroupedRow to="/a" title="Einstellungen" />
        </GroupedList>,
      ),
    );
    expect(screen.getByRole("link").className).toContain("focus-visible:ring-2");
  });

  it("US-QS-32 a row without a chevron keeps its trailing value in the tabular text size", () => {
    render(
      wrap(
        <GroupedList>
          <GroupedRow title="Erfolge" trailing={<span>3</span>} />
        </GroupedList>,
      ),
    );
    expect(screen.getByText("3").parentElement?.className).toContain("tabular-nums");
  });
});
