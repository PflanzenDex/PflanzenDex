// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { LayerPane } from "@/shared/patterns/responsive/layer-sheet/layer-host/layer-pane/layer-pane";
import { Dialog, DialogContent } from "@/shared/ui/dialog";
import { Sheet, SheetContent } from "@/shared/ui/sheet";
import { Popover } from "../popover/popover";
import { Menu } from "./menu";

beforeAll(() => {
  // jsdom has no matchMedia, Vaul reads it.
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
    onchange: null,
  })) as unknown as typeof window.matchMedia;
});

afterEach(cleanup);

const setup = () => {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  render(
    <Menu
      label="Weitere Aktionen"
      items={[
        { label: "Bearbeiten", onSelect: onEdit },
        { label: "Archivieren", onSelect: () => undefined, disabled: true },
        { label: "Löschen", onSelect: onDelete, destructive: true },
      ]}
    />,
  );
  return {
    onEdit,
    onDelete,
    trigger: () => screen.getByRole("button", { name: "Weitere Aktionen" }),
  };
};

describe("Menu (US-QS-07, DS-34)", () => {
  it("US-QS-07 the trigger is a named menu button and the menu is absent while closed", () => {
    const { trigger } = setup();
    expect(trigger().getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(trigger().className).toContain("min-h-[44px]");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("US-QS-07 opening by click or ArrowDown focuses the first item of the named menu", async () => {
    const user = userEvent.setup();
    const { trigger } = setup();
    await user.click(trigger());
    expect(screen.getByRole("menu", { name: "Weitere Aktionen" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Bearbeiten" }));
    await user.keyboard("{Escape}");
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Bearbeiten" }));
  });

  it("US-QS-07 arrow keys, Home and End move over enabled items only and wrap", async () => {
    const user = userEvent.setup();
    const { trigger } = setup();
    await user.click(trigger());
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Löschen" }));
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Bearbeiten" }));
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Löschen" }));
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Bearbeiten" }));
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Löschen" }));
  });

  it("US-QS-07 Enter runs the action, closes the menu and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    const { trigger, onDelete } = setup();
    await user.click(trigger());
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("US-QS-07 Escape closes without an action and returns focus; a press outside closes too", async () => {
    const user = userEvent.setup();
    const { trigger, onEdit } = setup();
    await user.click(trigger());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger());
    expect(onEdit).not.toHaveBeenCalled();
    await user.click(trigger());
    await user.click(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

const items = [
  { label: "Bearbeiten", onSelect: () => undefined },
  { label: "Löschen", onSelect: () => undefined, destructive: true },
];
const menuTrigger = () => screen.getByRole("button", { name: "Weitere Aktionen" });

/** Radix registers its press-outside listener after a timer; let it run before the press. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** The DOM rectangle of a panel, as jsdom has no layout. */
const rectAt = (left: number, width: number): DOMRect =>
  ({
    left,
    right: left + width,
    top: 0,
    bottom: 40,
    width,
    height: 40,
    x: left,
    y: 0,
    toJSON: () => ({}),
  }) as DOMRect;

/** jsdom has no layout: the panel (role menu or dialog) gets the rectangle of the test, every other element none. */
function placePanel(rect: () => DOMRect) {
  return vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
    this: Element,
  ) {
    return this.matches('[role="menu"], [role="dialog"]') ? rect() : rectAt(0, 0);
  });
}

function setWindowWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
}

describe("Menu inside a layer, sheet or dialog (US-QS-32, F-0356)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setWindowWidth(1024);
  });

  it("US-QS-32 Escape in an open menu inside a dialog closes the menu only and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Dialog defaultOpen onOpenChange={onOpenChange}>
        <DialogContent title="Pflanze">
          <Menu label="Weitere Aktionen" items={items} />
        </DialogContent>
      </Dialog>,
    );
    await settle();
    await user.click(menuTrigger());
    expect(screen.getByRole("menu")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Pflanze" })).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(document.activeElement).toBe(menuTrigger());
  });

  it("US-QS-32 Escape in an open menu inside a sheet closes the menu only and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Sheet defaultOpen onOpenChange={onOpenChange}>
        <SheetContent title="Pflanze">
          <Menu label="Weitere Aktionen" items={items} />
        </SheetContent>
      </Sheet>,
    );
    expect(await screen.findByRole("dialog", { name: "Pflanze" })).toBeTruthy();
    await settle();
    await user.click(menuTrigger());
    expect(screen.getByRole("menu")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Pflanze" })).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    await waitFor(() => expect(document.activeElement).toBe(menuTrigger()));
  });

  it("US-QS-32 a press on the backdrop outside an open menu inside a dialog closes the menu only", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Dialog defaultOpen onOpenChange={onOpenChange}>
        <DialogContent title="Pflanze">
          <Menu label="Weitere Aktionen" items={items} />
        </DialogContent>
      </Dialog>,
    );
    await settle();
    await user.click(menuTrigger());
    expect(screen.getByRole("menu")).toBeTruthy();
    await settle();
    const backdrop = document.querySelector<HTMLElement>(".bg-scrim");
    expect(backdrop).not.toBeNull();
    await user.click(backdrop as HTMLElement);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Pflanze" })).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("US-QS-32 a press on the backdrop outside an open menu inside a sheet closes the menu only", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Sheet defaultOpen onOpenChange={onOpenChange}>
        <SheetContent title="Pflanze">
          <Menu label="Weitere Aktionen" items={items} />
        </SheetContent>
      </Sheet>,
    );
    await screen.findByRole("dialog", { name: "Pflanze" });
    await settle();
    await user.click(menuTrigger());
    expect(screen.getByRole("menu")).toBeTruthy();
    await settle();
    const backdrop = document.querySelector<HTMLElement>(".bg-scrim");
    expect(backdrop).not.toBeNull();
    await user.click(backdrop as HTMLElement);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Pflanze" })).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("US-QS-32 a press on another control of the same dialog reaches it, and the open menu closes", async () => {
    const user = userEvent.setup();
    const onPointerDown = vi.fn();
    render(
      <Dialog defaultOpen>
        <DialogContent title="Pflanze">
          <Menu label="Weitere Aktionen" items={items} />
          <button type="button" onPointerDown={onPointerDown}>
            Gießen
          </button>
        </DialogContent>
      </Dialog>,
    );
    await settle();
    await user.click(menuTrigger());
    expect(screen.getByRole("menu")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Gießen" }));
    expect(onPointerDown).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Pflanze" })).toBeTruthy();
  });

  it("US-QS-32 a press outside a menu with no layer around it reaches its target and closes the menu", async () => {
    const user = userEvent.setup();
    const onPointerDown = vi.fn();
    render(
      <>
        <Menu label="Weitere Aktionen" items={items} />
        <button type="button" onPointerDown={onPointerDown}>
          Draußen
        </button>
      </>,
    );
    await user.click(menuTrigger());
    expect(screen.getByRole("menu")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Draußen" }));
    expect(onPointerDown).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("US-QS-32 a press on the page behind an open layer pane reaches its target; the pane stays open and the menu closes", async () => {
    const user = userEvent.setup();
    const onPointerDown = vi.fn();
    const onClose = vi.fn();
    render(
      <>
        <LayerPane id="pflanze" title="Pflanze" returning={false} onClose={onClose}>
          <Menu label="Weitere Aktionen" items={items} />
        </LayerPane>
        <button type="button" onPointerDown={onPointerDown}>
          Hinter der Seite
        </button>
      </>,
    );
    await user.click(menuTrigger());
    expect(screen.getByRole("menu")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Hinter der Seite" }));
    expect(onPointerDown).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("heading", { name: "Pflanze" })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("US-QS-32 Escape with a menu open inside a popover closes the menu only; a second Escape closes the popover", async () => {
    const user = userEvent.setup();
    render(
      <Popover label="Zur Pflanze">
        <Menu label="Weitere Aktionen" items={items} />
      </Popover>,
    );
    const popoverTrigger = screen.getByRole("button", { name: "Zur Pflanze" });
    await user.click(popoverTrigger);
    const menuButton = menuTrigger();
    await user.click(menuButton);
    expect(screen.getByRole("menu")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Zur Pflanze" })).toBeTruthy();
    expect(document.activeElement).toBe(menuButton);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Zur Pflanze" })).toBeNull();
    expect(document.activeElement).toBe(popoverTrigger);
  });

  it("US-QS-32 Escape in an open menu inside the layer pane does not close the pane", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <LayerPane id="pflanze" title="Pflanze" returning={false} onClose={onClose}>
        <Menu label="Weitere Aktionen" items={items} />
      </LayerPane>,
    );
    await user.click(menuTrigger());
    expect(screen.getByRole("menu")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("US-QS-32 Escape with the menu closed still closes the layer pane", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <LayerPane id="pflanze" title="Pflanze" returning={false} onClose={onClose}>
        <Menu label="Weitere Aktionen" items={items} />
      </LayerPane>,
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("US-QS-32 an open menu that sticks out at the left window edge moves in until 16 px separate it from the edge", async () => {
    setWindowWidth(360);
    placePanel(() => rectAt(-40, 300));
    const user = userEvent.setup();
    render(<Menu label="Weitere Aktionen" items={items} />);
    await user.click(menuTrigger());
    expect(screen.getByRole("menu").style.transform).toBe("translateX(56px)");
  });

  it("US-QS-32 an open menu that sticks out at the right window edge moves in until 16 px separate it from the edge", async () => {
    setWindowWidth(360);
    placePanel(() => rectAt(300, 200));
    const user = userEvent.setup();
    render(<Menu label="Weitere Aktionen" items={items} />);
    await user.click(menuTrigger());
    expect(screen.getByRole("menu").style.transform).toBe("translateX(-156px)");
  });

  it("US-QS-32 an open menu that lies inside the window is not moved", async () => {
    setWindowWidth(360);
    placePanel(() => rectAt(100, 150));
    const user = userEvent.setup();
    render(<Menu label="Weitere Aktionen" items={items} />);
    await user.click(menuTrigger());
    expect(screen.getByRole("menu").style.transform).toBe("");
  });

  it("US-QS-32 the window clamp is measured again when the window is resized", async () => {
    setWindowWidth(360);
    let rect = rectAt(100, 150);
    placePanel(() => rect);
    const user = userEvent.setup();
    render(<Menu label="Weitere Aktionen" items={items} />);
    await user.click(menuTrigger());
    expect(screen.getByRole("menu").style.transform).toBe("");
    setWindowWidth(200);
    rect = rectAt(100, 150);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(screen.getByRole("menu").style.transform).toBe("translateX(-66px)");
  });

  it("US-QS-32 the panel is at most 100vw minus 32 px wide and its rows wrap their text", async () => {
    const user = userEvent.setup();
    render(<Menu label="Weitere Aktionen" items={items} />);
    await user.click(menuTrigger());
    const panel = screen.getByRole("menu");
    expect(panel.className).toContain("max-w-[min(20rem,calc(100vw-32px))]");
    expect(panel.className).toContain("min-w-[min(12rem,calc(100vw-32px))]");
    for (const row of screen.getAllByRole("menuitem"))
      expect(row.className).toContain("whitespace-normal");
  });
});
