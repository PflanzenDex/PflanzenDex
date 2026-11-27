// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { plain } from "@/shared/testing/plain-text";
import { OBJECT_GROUP, ROW_GROUP } from "./group-classes";
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

describe("US-QS-32 · SG-LIST-01 a dense row (issue 1854)", () => {
  it("US-QS-32 · SG-LIST-01 a dense row has 8 px above and below instead of 12 px, and still a 44 px hit area", () => {
    render(
      wrap(
        <GroupedList>
          <GroupedRow title="Dicht" to="/a" dense />
          <GroupedRow title="Weit" to="/b" />
        </GroupedList>,
      ),
    );
    const dense = screen.getByRole("link", { name: "Dicht" });
    expect(dense.className).toContain("py-2");
    expect(dense.className).not.toContain("py-3");
    expect(dense.className).toContain("min-h-11");
    expect(screen.getByRole("link", { name: "Weit" }).className).toContain("py-3");
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

  it("US-QS-32 the meta of an object row wraps and is never cut, a settings row keeps its own break rule (d-168, issue 2599)", () => {
    const long = "Zone 3 · 39 Pflanzen · Schwierigkeit: unbekannt";
    render(
      wrap(
        <GroupedList>
          <GroupedRow variant="object" to="/a" title="Clip" meta={long} />
          <GroupedRow to="/b" title="Einstellungen" meta="Konto und Datenschutz" />
        </GroupedList>,
      ),
    );
    // The text is split into one span per part (issue 2606): the meta line is the parent of the parts.
    const line = screen.getByRole("link", { name: /^Clip/ }).querySelector("[data-row-meta]");
    expect(plain(line?.textContent)).toBe(long);
    const object = (line?.className ?? "").split(" ");
    expect(object).not.toContain("truncate");
    expect(object).toContain("[overflow-wrap:break-word]");
    expect(object).not.toContain("[overflow-wrap:anywhere]");
    const settings = screen.getByText("Konto und Datenschutz").className.split(" ");
    expect(settings).not.toContain("truncate");
    expect(settings).toContain("[overflow-wrap:anywhere]");
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
  it("US-QS-32 the id of a row sits on its focusable element, so a view can return the focus to the row", () => {
    render(
      wrap(
        <GroupedList>
          <GroupedRow id="konto-row-settings" to="/account/settings" title="Einstellungen" />
          <GroupedRow id="konto-row-news" onClick={() => undefined} title="Neu" />
        </GroupedList>,
      ),
    );
    expect(document.getElementById("konto-row-settings")?.tagName).toBe("A");
    expect(document.getElementById("konto-row-news")?.tagName).toBe("BUTTON");
  });
});

describe("US-QS-32 GroupedRow: a chevron on every opener, and no way to suppress it (issue 2355, SG-TOUCH-02)", () => {
  const chevron = (el: Element | null) => el?.querySelector("svg.lucide-chevron-right") ?? null;
  const inList = (row: React.ReactNode) => render(wrap(<GroupedList>{row}</GroupedList>));

  it("US-QS-32 · issue 2355 a link row shows the chevron, decorative", () => {
    inList(<GroupedRow to="/a" title="Einstellungen" />);
    const icon = chevron(screen.getByRole("link", { name: "Einstellungen" }));
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
  });

  it("US-QS-32 · issue 2355 a button row shows the chevron, with and without a layer to open", () => {
    inList(
      <>
        <GroupedRow onClick={() => undefined} haspopup="dialog" title="Zonen" />
        <GroupedRow onClick={() => undefined} title="Neu" />
      </>,
    );
    expect(chevron(screen.getByRole("button", { name: "Zonen" }))).not.toBeNull();
    expect(chevron(screen.getByRole("button", { name: "Neu" }))).not.toBeNull();
  });

  it("US-QS-32 · issue 2355 a destructive row shows none", () => {
    inList(<GroupedRow tone="destructive" onClick={() => undefined} title="Abmelden …" />);
    expect(chevron(screen.getByRole("button", { name: "Abmelden …" }))).toBeNull();
  });

  it("US-QS-32 · issue 2355 an object row with a trailing element shows none, one without shows it", () => {
    inList(
      <>
        <GroupedRow variant="object" to="/a" title="Clip" trailing={<span>Weicht ab</span>} />
        <GroupedRow variant="object" to="/b" title="Ficus" />
      </>,
    );
    expect(chevron(screen.getByRole("link", { name: "Clip Weicht ab" }))).toBeNull();
    expect(chevron(screen.getByRole("link", { name: "Ficus" }))).not.toBeNull();
  });

  it("US-QS-32 · issue 2355 a list row keeps its value and shows the chevron after it", () => {
    inList(<GroupedRow to="/a" title="Einstellungen" trailing="Lena" />);
    const link = screen.getByRole("link", { name: /Einstellungen/ });
    expect(link.textContent).toContain("Lena");
    expect(link.lastElementChild).toBe(chevron(link));
  });

  it("US-QS-32 · issue 2355 a plain row without a link or a button shows none", () => {
    inList(<GroupedRow title="Was die App kann" meta="unbekannt" />);
    expect(chevron(screen.getByRole("listitem"))).toBeNull();
  });

  it("US-QS-32 · issue 2355 a caller cannot suppress the chevron of an opener: the prop is gone", () => {
    const suppress = { chevron: false } as object;
    inList(<GroupedRow to="/a" title="Clip" {...suppress} />);
    expect(chevron(screen.getByRole("link", { name: "Clip" }))).not.toBeNull();
  });
});

describe("US-QS-32 the groups of a list carry the card look on their rows (FX-06)", () => {
  it("US-QS-32 the card moves onto the rows: the list is transparent, each row is card-coloured, the first rounded at the top and the last at the bottom", () => {
    for (const group of [OBJECT_GROUP, ROW_GROUP]) {
      const tokens = group.split(" ");
      expect(tokens).not.toContain("bg-card");
      expect(tokens).not.toContain("rounded-card");
      expect(group).toContain("[&>li]:bg-card");
      expect(group).toContain("[&>li]:overflow-hidden");
      expect(group).toContain("[&>li:first-child]:rounded-t-card");
      expect(group).toContain("[&>li:last-child]:rounded-b-card");
    }
  });

  it("US-QS-32 the forced-colors boundary runs left and right on every row, and at the top of the first and the bottom of the last", () => {
    expect(ROW_GROUP).toContain("[&>li]:forced-colors:border-x-[CanvasText]");
    expect(ROW_GROUP).toContain("[&>li:first-child]:forced-colors:border-t-[CanvasText]");
    expect(ROW_GROUP).toContain("[&>li:last-child]:forced-colors:border-b-[CanvasText]");
  });

  it("US-QS-32 one hairline rule serves both groups: object rows start after the thumbnail, the other rows at the text", () => {
    expect(OBJECT_GROUP).toContain("[&>li+li]:before:left-[72px]");
    expect(OBJECT_GROUP).toContain("[&>li+li]:before:right-2");
    expect(ROW_GROUP).toContain("[&>li+li]:before:inset-x-4");
    expect(ROW_GROUP).not.toContain("left-[72px]");
  });
});

describe("US-QS-15 · SG-LIST-06 a section of a long grouped list: sticky label, one action, its own list", () => {
  it("US-QS-15 a plain label has no wrapper and does not stick", () => {
    render(wrap(<GroupedList label="Konto">{null}</GroupedList>));
    const heading = screen.getByRole("heading", { name: "Konto" });
    expect(heading.parentElement?.tagName).toBe("SECTION");
    expect(document.querySelector("[data-group-heading]")).toBeNull();
  });

  it("US-QS-15 a sticky label sticks to the top of its region on the surface it stands on, and its switch can turn it off", () => {
    render(
      wrap(
        <>
          <GroupedList label="Seite" sticky="page" groupKey="a">
            {null}
          </GroupedList>
          <GroupedList label="Layer" sticky="layer">
            {null}
          </GroupedList>
        </>,
      ),
    );
    const [page, layer] = [...document.querySelectorAll("[data-group-heading]")];
    expect(page?.className).toContain("sticky top-0");
    expect(page?.className).toContain("bg-background");
    expect(page?.className).toContain("group-data-[sticky=off]/sections:static");
    expect(layer?.className).toContain("bg-card");
    expect(screen.getByRole("region", { name: "Seite" }).getAttribute("data-group-key")).toBe("a");
  });

  it("US-QS-15 an action stands beside the heading, outside it, so the heading stays the name of the section", () => {
    render(
      wrap(
        <GroupedList
          label="Standort unbekannt"
          action={<button type="button">Standort setzen</button>}
        >
          {null}
        </GroupedList>,
      ),
    );
    const action = screen.getByRole("button", { name: "Standort setzen" });
    const heading = screen.getByRole("heading", { name: "Standort unbekannt" });
    expect(heading.contains(action)).toBe(false);
    expect(heading.parentElement).toBe(action.parentElement?.parentElement);
    expect(heading.parentElement?.hasAttribute("data-group-heading")).toBe(true);
    // Without `sticky` the label with an action stays in the flow.
    expect(heading.parentElement?.className).not.toContain("sticky");
  });

  it("US-QS-15 the row of a heading with an action wraps: the heading keeps 8 rem, the action moves below it at the trailing edge (issue 2524)", () => {
    render(
      wrap(
        <GroupedList
          label="Standort unbekannt · 3 Pflanzen"
          action={<button type="button">Standort setzen</button>}
        >
          {null}
        </GroupedList>,
      ),
    );
    const classesOf = (el: Element | null | undefined) =>
      (el?.getAttribute("class") ?? "").split(" ");
    const heading = screen.getByRole("heading", { name: /^Standort unbekannt/ });
    const box = screen.getByRole("button", { name: "Standort setzen" }).parentElement;
    expect(classesOf(heading.parentElement)).toContain("flex-wrap");
    // The heading basis is in rem, so it grows with the text size; the action box is the one of an object row (issue 2322).
    expect(classesOf(heading)).toEqual(expect.arrayContaining(["min-w-0", "grow", "basis-32"]));
    expect(classesOf(box)).toEqual(expect.arrayContaining(["ml-auto", "max-w-full", "shrink-0"]));
  });

  it("US-QS-15 a heading without an action is the plain heading: no wrapping row, no basis", () => {
    render(wrap(<GroupedList label="Flur · 3 Pflanzen">{null}</GroupedList>));
    const heading = screen.getByRole("heading", { name: /^Flur/ });
    expect(heading.parentElement?.hasAttribute("data-group-heading")).toBe(false);
    expect(heading.className).not.toContain("basis-");
  });

  it("US-QS-15 a free section brings its own list: the children are not wrapped in a group", () => {
    render(
      wrap(
        <GroupedList label="Eigene Liste" free>
          <p>Leer</p>
        </GroupedList>,
      ),
    );
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByText("Leer")).toBeTruthy();
  });
});
