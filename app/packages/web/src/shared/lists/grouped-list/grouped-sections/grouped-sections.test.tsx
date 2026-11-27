// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { SETTLE_MS } from "@/shared/patterns/responsive/entry-list/paging/scroll-entries/use-scroll-overflow";
import { GroupedRow } from "../grouped-list";
import { GroupSection, GroupSections, type SectionGroup } from "./grouped-sections";

/** The layout of the test: what the observers and the box measures report (px). */
let layout = { region: 400, heading: 32 };
const observers: (() => void)[] = [];

/** The device does not ask for reduced motion (the viewport mock answers every other query by the width only). */
function motionAllowed() {
  const base = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    ...base(query),
    matches: /reduced-motion/.test(query) ? false : base(query).matches,
  })) as typeof window.matchMedia;
}

beforeEach(() => {
  setViewportWidth(360);
  motionAllowed();
  layout = { region: 400, heading: 32 };
  observers.length = 0;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private readonly callback: () => void) {
        observers.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {
        observers.splice(observers.indexOf(this.callback), 1);
      }
    },
  );
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.hasAttribute("data-scroll-region") ? layout.region : 0;
  });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.hasAttribute("data-group-heading") ? layout.heading : 0;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset["motion"];
});

const group = (
  key: string,
  label: string,
  items: string[],
  more: Partial<SectionGroup<string>> = {},
) =>
  ({
    key,
    label,
    items,
    countText: `${items.length} Pflanzen`,
    ...more,
  }) satisfies SectionGroup<string>;

const LIST = {
  listLabel: "Pflanzen",
  pageSize: 10,
  getKey: (item: string) => item,
  renderItem: (item: string) => <GroupedRow bare title={item} />,
};

function Address() {
  const { pathname, search } = useLocation();
  return <p data-testid="address">{pathname + search}</p>;
}

function show(
  groups: SectionGroup<string>[],
  more: Partial<Parameters<typeof GroupSections<string>>[0]> = {},
) {
  return render(
    <MemoryRouter initialEntries={["/sammlung"]}>
      <GroupSections
        label="Pflanzen"
        jumpLabel="Zum Standort springen"
        groups={groups}
        list={LIST}
        {...more}
      />
      <Address />
    </MemoryRouter>,
  );
}

const sections = () =>
  screen.getAllByRole("region").filter((r) => r.hasAttribute("data-group-key")) as HTMLElement[];
/** The `index`th element of a list that the test knows is long enough. */
const nth = (list: readonly HTMLElement[], index: number): HTMLElement =>
  list[index] as HTMLElement;

const THREE = [
  group("a", "Flur", ["Ficus"]),
  group("b", "Küche", ["Aloe", "Basilikum"]),
  group("c", "Standort unbekannt", ["Efeu"]),
];

describe("US-QS-15 · SG-LIST-06 · SG-LIST-08 every group is a section of one scrolling list", () => {
  it("US-QS-15 every group is a section with a real heading and its count, in the order given; no group is hidden", () => {
    show(THREE);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Flur · 1 Pflanzen",
      "Küche · 2 Pflanzen",
      "Standort unbekannt · 1 Pflanzen",
    ]);
    expect(sections().map((s) => s.getAttribute("data-group-key"))).toEqual(["a", "b", "c"]);
    expect(within(nth(sections(), 1)).getAllByRole("listitem")).toHaveLength(2);
    // Each section is named by its own heading, so the sections can be reached by heading.
    expect(screen.getByRole("region", { name: "Küche · 2 Pflanzen" })).toBeTruthy();
    // Every entry is on the page at once: no chooser, no pages.
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("US-QS-15 · SG-LIST-08 a heading without a count text names the number, a given heading replaces both", () => {
    show([
      { key: "a", label: "Flur", items: ["Ficus"], count: 7 },
      { key: "b", label: "Küche", items: ["Aloe"], heading: "Küche · Zone 2 · 1 Pflanze" },
    ]);
    expect(screen.getByRole("heading", { name: "Flur · 7" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Küche · Zone 2 · 1 Pflanze" })).toBeTruthy();
  });

  it("US-QS-15 the heading level is the one the page needs: 2 by default, 3 below a section heading or inside a layer", () => {
    const view = show(THREE);
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(3);
    view.unmount();
    show(THREE, { level: 3, in: "layer" });
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(3);
  });

  it("US-QS-15 · SG-LIST-06 a fixed set shows an empty group as its heading and a quiet line, not styled as a control", () => {
    show([
      group("dormancy", "Ruhephase", ["Aloe"]),
      group("growth", "Wachstumsphase", [], { empty: "Zurzeit keine Pflanze." }),
    ]);
    expect(sections()).toHaveLength(2);
    const growth = screen.getByRole("region", { name: /^Wachstumsphase/ });
    const line = within(growth).getByText("Zurzeit keine Pflanze.");
    expect(line.tagName).toBe("P");
    expect(within(growth).queryByRole("button")).toBeNull();
    expect(within(growth).queryByRole("link")).toBeNull();
    expect(within(growth).queryByRole("list")).toBeNull();
    expect(line.className).toContain("text-muted-foreground");
    expect(line.className).not.toMatch(/\b(bg|border|underline)-?/);
  });

  it("US-QS-15 a group without entries and without a quiet line has its heading only (an open set leaves it out)", () => {
    show([group("a", "Flur", ["Ficus"]), group("b", "Leer", [])]);
    const empty = screen.getByRole("region", { name: /^Leer/ });
    expect(within(empty).queryByRole("list")).toBeNull();
    expect(empty.querySelectorAll("p")).toHaveLength(0);
  });

  it("US-QS-15 · SG-LIST-06 the group of an unknown value stands last, and its label carries one plain action that sets the value", async () => {
    const onSet = vi.fn();
    show([
      group("a", "Flur", ["Ficus"]),
      group("unplaced", "Standort unbekannt", ["Efeu"], {
        action: (
          <button type="button" onClick={onSet}>
            Standort setzen
          </button>
        ),
      }),
    ]);
    const all = sections();
    const unknown = all.at(-1) as HTMLElement;
    expect(unknown.getAttribute("data-group-key")).toBe("unplaced");
    const action = within(unknown).getByRole("button", { name: "Standort setzen" });
    // The action sits beside the heading, not inside it: the heading stays its name only.
    expect(action.closest("[data-group-heading]")).not.toBeNull();
    expect(unknown.querySelector("h2")?.contains(action)).toBe(false);
    expect(within(nth(all, 0)).queryByRole("button")).toBeNull();
    await userEvent.click(action);
    expect(onSet).toHaveBeenCalledOnce();
  });

  it("US-QS-15 an `intro` stands between the heading and the entries of its group", () => {
    show([group("a", "Flur", ["Ficus"], { intro: <p>Alle umstellen</p> })]);
    const section = nth(sections(), 0);
    const order = [...section.children].map((c) => c.textContent);
    expect(order[0]).toContain("Flur");
    expect(order[1]).toBe("Alle umstellen");
  });

  it("US-QS-15 a GroupSection outside of GroupSections says so instead of guessing how to show its entries", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<GroupSection group={group("a", "Flur", [])} />)).toThrow(
      /stands inside GroupSections/,
    );
    error.mockRestore();
  });
});

describe("US-QS-15 · SG-LIST-06 the chips jump, they do not filter", () => {
  it("US-QS-15 a page puts its sections in a named, focusable scroll region under the chips", () => {
    show(THREE);
    const region = screen.getByRole("region", { name: "Pflanzen" });
    expect(region.hasAttribute("data-scroll-region")).toBe(true);
    expect(region.getAttribute("tabindex")).toBe("0");
    // Focus scrolling keeps a focused row out from under the sticky heading (WCAG 2.4.11).
    expect(region.className).toContain("scroll-pt-12");
    const chips = screen.getByRole("group", { name: "Zum Standort springen" });
    expect(chips.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("US-QS-15 a tap scrolls that section to the top of the region, moves the focus to its heading and writes nothing into the address", async () => {
    show(THREE);
    const region = screen.getByRole("region", { name: "Pflanzen" });
    const scrollTo = vi.fn();
    region.scrollTo = scrollTo as unknown as typeof region.scrollTo;
    Object.defineProperty(region, "scrollTop", { value: 50 });
    vi.spyOn(region, "getBoundingClientRect").mockReturnValue({ top: 100 } as DOMRect);
    const target = nth(sections(), 1);
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({ top: 340 } as DOMRect);
    await userEvent.click(screen.getByRole("button", { name: "Küche · 2 Pflanzen" }));
    // 340 - 100 + 50: the section's place in the region's content.
    expect(scrollTo).toHaveBeenCalledWith({ top: 290, behavior: "smooth" });
    expect(document.activeElement).toBe(target.querySelector("h2"));
    expect(screen.getByTestId("address").textContent).toBe("/sammlung");
    // The other sections are still there: the jump hid nothing.
    expect(sections()).toHaveLength(3);
  });

  it("US-QS-12 · US-QS-33 with reduced motion the jump is at once, not smooth", async () => {
    document.documentElement.dataset["motion"] = "reduced";
    show(THREE);
    const region = screen.getByRole("region", { name: "Pflanzen" });
    const scrollTo = vi.fn();
    region.scrollTo = scrollTo as unknown as typeof region.scrollTo;
    await userEvent.click(screen.getByRole("button", { name: "Flur · 1 Pflanzen" }));
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto" }));
  });

  it("US-QS-15 a jump in a layer scrolls the layer's own region, which is the nearest marked one", async () => {
    render(
      <MemoryRouter>
        <div data-scroll-region="" data-testid="layer-body">
          <GroupSections
            label="Pflanzen"
            jumpLabel="Zur Gruppe springen"
            in="layer"
            level={3}
            groups={THREE}
            list={LIST}
          />
        </div>
      </MemoryRouter>,
    );
    const body = screen.getByTestId("layer-body");
    const scrollTo = vi.fn();
    body.scrollTo = scrollTo as unknown as typeof body.scrollTo;
    // No second region of its own inside the layer: the layer's body scrolls.
    expect(screen.queryByRole("region", { name: "Pflanzen" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Küche · 2 Pflanzen" }));
    expect(scrollTo).toHaveBeenCalledOnce();
  });

  it("US-QS-15 one group has nothing to jump to: no chip row", () => {
    show([group("a", "Flur", ["Ficus"])]);
    expect(screen.queryByRole("group", { name: "Zum Standort springen" })).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(sections()).toHaveLength(1);
  });

  it("US-QS-15 a chip of a group that is not there (a stale key) jumps nowhere and breaks nothing", async () => {
    show(THREE);
    const region = screen.getByRole("region", { name: "Pflanzen" });
    const scrollTo = vi.fn();
    region.scrollTo = scrollTo as unknown as typeof region.scrollTo;
    for (const section of sections()) section.removeAttribute("data-group-key");
    await userEvent.click(screen.getByRole("button", { name: "Flur · 1 Pflanzen" }));
    expect(scrollTo).not.toHaveBeenCalled();
  });
});

describe("US-QS-15 · SG-LIST-06 the headings are sticky, one at a time, on an opaque surface", () => {
  it("US-QS-15 a heading sticks to the top of the region on the page's surface, so rows do not show through", () => {
    show(THREE);
    for (const heading of document.querySelectorAll("[data-group-heading]")) {
      const classes = heading.className.split(/\s+/);
      expect(classes).toContain("sticky");
      expect(classes).toContain("top-0");
      expect(classes).toContain("bg-background");
    }
    // Sticky stays inside the section: each heading is a child of its own section, so the next heading pushes it out.
    for (const section of sections()) {
      expect(section.firstElementChild?.hasAttribute("data-group-heading")).toBe(true);
    }
  });

  it("US-QS-15 inside a layer the sticky surface is the layer's own", () => {
    show(THREE, { in: "layer", level: 3 });
    expect(
      [...document.querySelectorAll("[data-group-heading]")].every((h) =>
        h.className.split(/\s+/).includes("bg-card"),
      ),
    ).toBe(true);
  });

  it("US-QS-15 · WCAG 1.4.4 a heading that would cover more than a third of the region (a long name at 200 % text) stays in the flow", () => {
    layout = { region: 192, heading: 112 };
    show(THREE);
    const wrapper = document.querySelector("[data-sticky]");
    expect(wrapper?.getAttribute("data-sticky")).toBe("off");
    // The headings read the switch of their region: `static` replaces `sticky` while it is off.
    expect(document.querySelector("[data-group-heading]")?.className).toContain(
      "group-data-[sticky=off]/sections:static",
    );
    expect(wrapper?.className).toContain("group/sections");
  });

  it("US-QS-15 the switch follows the region: it comes back when the room grows, and goes when the text grows", () => {
    show(THREE);
    const wrapper = document.querySelector("[data-sticky]") as HTMLElement;
    expect(wrapper.getAttribute("data-sticky")).toBe("on");
    layout = { region: 120, heading: 64 };
    act(() => observers.forEach((callback) => callback()));
    expect(wrapper.getAttribute("data-sticky")).toBe("off");
    layout = { region: 500, heading: 32 };
    act(() => observers.forEach((callback) => callback()));
    expect(wrapper.getAttribute("data-sticky")).toBe("on");
  });

  it("US-QS-15 without a layout (no ResizeObserver, no measure) the headings stay sticky", () => {
    vi.unstubAllGlobals();
    layout = { region: 0, heading: 0 };
    show(THREE);
    expect(document.querySelector("[data-sticky]")?.getAttribute("data-sticky")).toBe("on");
  });
});

describe("US-QS-15 · SG-LIST-01 the end marker stands once, after the last section, with the count of every group", () => {
  /** The sections reach 1000 px in a region of 400 px: the list overflows its region. */
  const longLayout = () =>
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element,
    ) {
      return { top: 0, bottom: this.hasAttribute("data-scroll-region") ? 400 : 1000 } as DOMRect;
    });

  it("US-QS-15 only the last section ends the list, and it names every entry of every group", async () => {
    longLayout();
    show(THREE);
    expect(await screen.findByText("Das waren alle 4")).toBeTruthy();
    expect(document.querySelectorAll("[data-list-end]")).toHaveLength(1);
    expect(sections().at(-1)?.querySelector("[data-list-end]")).not.toBeNull();
  });

  it("US-QS-15 a list that fits its region ends without a marker", async () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      () => ({ top: 0, bottom: 100 }) as DOMRect,
    );
    show(THREE);
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS + 60));
    expect(document.querySelector("[data-list-end]")).toBeNull();
  });

  it("US-QS-15 a list whose sections do not count entries (`endMarker` false) has no marker at all", async () => {
    longLayout();
    show(THREE, { endMarker: false });
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS + 60));
    expect(document.querySelector("[data-list-end]")).toBeNull();
  });
});
