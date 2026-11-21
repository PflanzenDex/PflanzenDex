// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cn } from "@/shared/lib/utils";
import { usePageFit } from "@/shared/patterns/responsive/pager/use-page-fit";
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

const FIT_ROW = 100;
let frameHeight = 500;

/** A fitted list in a frame, as a pager draws it: the page is the rows it shows, and the list fills the free height (issue 1413). */
function FittedRows({ group }: { group: string }) {
  const list = useRef<HTMLUListElement>(null);
  const fit = usePageFit(list, true);
  const rows = fit?.size ?? 6;
  return (
    <div data-fit-fill="">
      <ul
        ref={list}
        aria-label="Zeilen"
        className={cn("flex flex-col gap-2 min-h-0 flex-1 content-start", group)}
      >
        {Array.from({ length: rows }, (_, i) => (
          <li key={i}>Zeile {i + 1}</li>
        ))}
      </ul>
    </div>
  );
}

describe("US-QS-32 the groups of a pager keep the room a fitting list measures (issue 1413, FX-06)", () => {
  it("US-QS-32 a fit pager's list keeps flex-1 with the object group and the row group, so no flex-none wins over it", () => {
    for (const group of [OBJECT_GROUP, ROW_GROUP]) {
      const list = cn("flex flex-col gap-2", "min-h-0 flex-1 content-start", group).split(" ");
      expect(list).toContain("flex-1");
      expect(list).toContain("min-h-0");
      expect(list).not.toContain("flex-none");
    }
  });

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

  describe("the measured size of a fitted list", () => {
    beforeEach(() => {
      frameHeight = 500;
      // The list is as tall as its rows, each FIT_ROW px; the frame is `frameHeight` px and its content is the header and the rows.
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
        this: Element,
      ) {
        const height =
          this.tagName === "UL"
            ? this.children.length * FIT_ROW
            : this.tagName === "LI"
              ? FIT_ROW
              : 0;
        return {
          height,
          width: 320,
          top: 0,
          left: 0,
          right: 320,
          bottom: height,
          x: 0,
          y: 0,
        } as DOMRect;
      });
      vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(function (
        this: Element,
      ) {
        return this.hasAttribute("data-fit-fill") ? frameHeight : 0;
      });
      vi.spyOn(Element.prototype, "scrollHeight", "get").mockImplementation(function (
        this: Element,
      ) {
        if (!this.hasAttribute("data-fit-fill")) return 0;
        const rows = this.querySelector("ul")?.children.length ?? 0;
        return Math.max(frameHeight, 200 + rows * FIT_ROW);
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("US-QS-32 a fitted list in a row group grows its page size when the frame has room (issue 1413)", () => {
      frameHeight = 500;
      const { unmount } = render(<FittedRows group={ROW_GROUP} />);
      expect(screen.getAllByRole("listitem")).toHaveLength(3);
      unmount();
      frameHeight = 1000;
      render(<FittedRows group={ROW_GROUP} />);
      expect(screen.getAllByRole("listitem")).toHaveLength(6);
    });
  });
});
