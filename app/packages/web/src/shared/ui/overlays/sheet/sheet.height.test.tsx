// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnnouncerProvider } from "@/shared/platform/announcer/announcer";
import { Sheet, SheetContent } from "./sheet";
import {
  heightOf,
  layout,
  maxOf,
  setWindowHeight,
  stubActionBox,
  stubSheetLayout,
} from "./sheet.test-helpers";

// US-QS-15, sheet heights (owner decision 4 of 2026-11-21, issue 2412; owner answers 2026-11-21, issue 2415). jsdom has no
// layout: `stubSheetLayout` gives the sheet, its header and its body the sizes of `layout`. The window is 800 px high, so
// half is 400 px and full is 800 px.

let reduced = false;

beforeEach(() => {
  reduced = false;
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
    onchange: null,
  })) as unknown as typeof window.matchMedia;
  layout.header = 90;
  layout.content = 200;
  layout.actionBottom = 0;
  stubSheetLayout();
  stubActionBox();
  setWindowHeight(800);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.documentElement.style.fontSize = "";
});

function Example(props: { onOpenChange?: (open: boolean) => void; title?: string }) {
  return (
    <AnnouncerProvider>
      <Sheet open onOpenChange={props.onOpenChange ?? (() => undefined)}>
        <SheetContent title={props.title ?? "Filter"}>
          <button>Anwenden</button>
        </SheetContent>
      </Sheet>
    </AnnouncerProvider>
  );
}

const sheetOf = () => screen.findByRole("dialog", { name: "Filter" });
const live = () => document.querySelector('[aria-live="polite"]')?.textContent?.trim() ?? "";
const handleOf = () => screen.getByRole("separator", { name: "Höhe ändern" });

/** A drag on the handle: the finger goes down at `from` and moves to each of `to`, then lets go. */
function drag(from: number, ...to: number[]) {
  const handle = handleOf();
  const base = { pointerId: 1, pointerType: "touch", button: 0, isPrimary: true };
  fireEvent.pointerDown(handle, { ...base, clientY: from });
  for (const y of to) fireEvent.pointerMove(handle, { ...base, clientY: y });
  fireEvent.pointerUp(handle, { ...base, clientY: to[to.length - 1] ?? from });
}

describe("US-QS-15 · a sheet opens at its fitting height or at half height", () => {
  it("US-QS-15 a sheet whose content fits within half the visible window opens at the height of its content", async () => {
    render(<Example />);
    const sheet = await sheetOf();
    await waitFor(() => expect(sheet.getAttribute("data-sheet-height")).toBe("fit"));
    expect(heightOf(sheet)).toBe("auto");
    expect(maxOf(sheet)).toBe("400px");
    // One height: no toggle, and the handle is no control to focus.
    expect(screen.queryByRole("button", { name: "Vollbild" })).toBeNull();
    expect(screen.queryByRole("separator")).toBeNull();
  });

  it("US-QS-15 a sheet with a longer content opens at half height, 50 % of the visible window height", async () => {
    layout.content = 1200;
    render(<Example />);
    const sheet = await sheetOf();
    await waitFor(() => expect(sheet.getAttribute("data-sheet-height")).toBe("two"));
    expect(heightOf(sheet)).toBe("400px");
    expect(handleOf().getAttribute("aria-valuetext")).toBe("Halbe Höhe");
  });

  it("US-QS-15 half is 50 % of the visible window: a shorter window gives a lower half", async () => {
    layout.content = 1200;
    render(<Example />);
    const sheet = await sheetOf();
    await waitFor(() => expect(heightOf(sheet)).toBe("400px"));
    setWindowHeight(600);
    await waitFor(() => expect(heightOf(sheet)).toBe("300px"));
  });

  it("US-QS-15 at 200 % text, when title and actions do not fit within half height, the sheet opens at full height", async () => {
    document.documentElement.style.fontSize = "32px";
    layout.header = 300;
    layout.content = 1200;
    render(<Example />);
    const sheet = await sheetOf();
    await waitFor(() => expect(sheet.getAttribute("data-sheet-height")).toBe("full"));
    expect(heightOf(sheet)).toBe("800px");
    // Only one height is left: nothing to toggle.
    expect(screen.queryByRole("button", { name: "Halbe Höhe" })).toBeNull();
    expect(screen.queryByRole("separator")).toBeNull();
  });

  it("US-QS-15 at both heights the content is the scroll region and the title and the actions stay", async () => {
    layout.content = 1200;
    render(<Example />);
    const sheet = await sheetOf();
    const region = sheet.querySelector<HTMLElement>("[data-scroll-region]");
    expect(region).not.toBeNull();
    expect(region?.className).toContain("overflow-y-auto");
    expect(region?.className).toContain("overscroll-contain");
    const title = within(sheet).getByRole("heading", { name: "Filter" });
    expect(region?.contains(title)).toBe(false);
    expect(region?.contains(within(sheet).getByRole("button", { name: "Schließen" }))).toBe(false);
    expect(region?.contains(within(sheet).getByRole("button", { name: "Vollbild" }))).toBe(false);
    expect(region?.contains(within(sheet).getByRole("button", { name: "Anwenden" }))).toBe(true);
  });
});

describe("US-QS-15 · a primary action in the content that half height would cut off", () => {
  function WithAction() {
    return (
      <AnnouncerProvider>
        <Sheet open>
          <SheetContent title="Filter">
            <button className="bg-primary">Sichern</button>
          </SheetContent>
        </Sheet>
      </AnnouncerProvider>
    );
  }

  it("US-QS-15 a sheet whose primary action lies below the end of its scroll region opens at full height, with one height", async () => {
    layout.content = 1200;
    layout.actionBottom = 1300;
    render(<WithAction />);
    const sheet = await sheetOf();
    await waitFor(() => expect(sheet.getAttribute("data-sheet-height")).toBe("full"));
    expect(heightOf(sheet)).toBe("800px");
    expect(screen.queryByRole("button", { name: "Halbe Höhe" })).toBeNull();
  });

  it("US-QS-15 a sheet whose primary action is in sight at half height keeps its two heights", async () => {
    layout.content = 1200;
    layout.actionBottom = 300;
    render(<WithAction />);
    const sheet = await sheetOf();
    await waitFor(() => expect(sheet.getAttribute("data-sheet-height")).toBe("two"));
    expect(heightOf(sheet)).toBe("400px");
  });
});

describe("US-QS-15 · the toggle and the arrow keys change the height and say so", () => {
  it("US-QS-15 the toggle 'Vollbild' is a button of 44 px that grows the sheet to full height and names the way back", async () => {
    layout.content = 1200;
    render(<Example />);
    const sheet = await sheetOf();
    const toggle = await screen.findByRole("button", { name: "Vollbild" });
    expect(toggle.className).toContain("min-h-[44px]");
    expect(toggle.className).toContain("min-w-[44px]");
    await userEvent.click(toggle);
    expect(heightOf(sheet)).toBe("800px");
    expect(live()).toBe("Filter, Vollbild");
    expect(handleOf().getAttribute("aria-valuetext")).toBe("Vollbild");
    await userEvent.click(screen.getByRole("button", { name: "Halbe Höhe" }));
    expect(heightOf(sheet)).toBe("400px");
    expect(live()).toBe("Filter, Halbe Höhe");
  });

  it("US-QS-15 the focused handle grows the sheet with arrow up and returns it to half with arrow down", async () => {
    layout.content = 1200;
    render(<Example />);
    const sheet = await sheetOf();
    await waitFor(() => expect(heightOf(sheet)).toBe("400px"));
    handleOf().focus();
    await userEvent.keyboard("{ArrowUp}");
    expect(heightOf(sheet)).toBe("800px");
    expect(live()).toBe("Filter, Vollbild");
    await userEvent.keyboard("{ArrowDown}");
    expect(heightOf(sheet)).toBe("400px");
    expect(live()).toBe("Filter, Halbe Höhe");
  });

  it("US-QS-15 arrow down at half height never closes the sheet and says nothing", async () => {
    layout.content = 1200;
    const onOpenChange = vi.fn();
    render(<Example onOpenChange={onOpenChange} />);
    const sheet = await sheetOf();
    await waitFor(() => expect(heightOf(sheet)).toBe("400px"));
    handleOf().focus();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(heightOf(sheet)).toBe("400px");
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Filter" })).toBe(sheet);
    expect(live()).toBe("");
  });

  it("US-QS-15 the handle is a named control that the keyboard reaches, and a sheet does not focus it on open", async () => {
    layout.content = 1200;
    render(<Example />);
    const sheet = await sheetOf();
    const handle = await screen.findByRole("separator", { name: "Höhe ändern" });
    expect(handle.getAttribute("tabindex")).toBe("0");
    expect(handle.getAttribute("aria-orientation")).toBe("horizontal");
    await waitFor(() => expect(sheet.contains(document.activeElement)).toBe(true));
    expect(document.activeElement).not.toBe(handle);
    expect(document.activeElement).toBe(within(sheet).getByRole("button", { name: "Anwenden" }));
  });
});

describe("US-QS-15 · a drag on the handle changes the height, and only the handle", () => {
  it("US-QS-15 dragging the handle up and letting go snaps to the nearer height, full height here", async () => {
    layout.content = 1200;
    render(<Example />);
    const sheet = await sheetOf();
    await waitFor(() => expect(heightOf(sheet)).toBe("400px"));
    drag(500, 400, 150);
    expect(heightOf(sheet)).toBe("800px");
    expect(live()).toBe("Filter, Vollbild");
  });

  it("US-QS-15 the height follows the finger while it drags", async () => {
    layout.content = 1200;
    render(<Example />);
    const sheet = await sheetOf();
    await waitFor(() => expect(heightOf(sheet)).toBe("400px"));
    const handle = handleOf();
    const base = { pointerId: 1, pointerType: "touch", button: 0, isPrimary: true };
    fireEvent.pointerDown(handle, { ...base, clientY: 500 });
    fireEvent.pointerMove(handle, { ...base, clientY: 350 });
    expect(heightOf(sheet)).toBe("550px");
    fireEvent.pointerUp(handle, { ...base, clientY: 350 });
    // 550 px lies 150 px above half and 250 px below full: the release snaps back to half.
    expect(heightOf(sheet)).toBe("400px");
  });

  it("US-QS-15 a drag that ends nearer to half height returns the sheet to half height", async () => {
    layout.content = 1200;
    render(<Example />);
    const sheet = await sheetOf();
    await waitFor(() => expect(heightOf(sheet)).toBe("400px"));
    drag(500, 380);
    expect(heightOf(sheet)).toBe("400px");
    expect(live()).toBe("");
  });

  it("US-QS-15 dragging the handle of a sheet at full height down to the middle snaps back to half height", async () => {
    layout.content = 1200;
    render(<Example />);
    const sheet = await sheetOf();
    await userEvent.click(await screen.findByRole("button", { name: "Vollbild" }));
    expect(heightOf(sheet)).toBe("800px");
    drag(100, 300, 500);
    expect(heightOf(sheet)).toBe("400px");
    expect(live()).toBe("Filter, Halbe Höhe");
  });

  it("US-QS-15 dragging a sheet at half height down past half height closes it", async () => {
    layout.content = 1200;
    const onOpenChange = vi.fn();
    render(<Example onOpenChange={onOpenChange} />);
    const sheet = await sheetOf();
    await waitFor(() => expect(heightOf(sheet)).toBe("400px"));
    drag(500, 700, 900);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("US-QS-15 a short drag down from half height keeps the sheet open", async () => {
    layout.content = 1200;
    const onOpenChange = vi.fn();
    render(<Example onOpenChange={onOpenChange} />);
    const sheet = await sheetOf();
    await waitFor(() => expect(heightOf(sheet)).toBe("400px"));
    drag(500, 530);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(heightOf(sheet)).toBe("400px");
  });

  it("US-QS-15 a swipe on the content scrolls the content and does not change the height", async () => {
    layout.content = 1200;
    const onOpenChange = vi.fn();
    render(<Example onOpenChange={onOpenChange} />);
    const sheet = await sheetOf();
    await waitFor(() => expect(heightOf(sheet)).toBe("400px"));
    const content = within(sheet).getByRole("button", { name: "Anwenden" });
    const base = { pointerId: 2, pointerType: "touch", button: 0, isPrimary: true };
    fireEvent.pointerDown(content, { ...base, clientY: 600 });
    fireEvent.pointerMove(content, { ...base, clientY: 300 });
    fireEvent.pointerMove(content, { ...base, clientY: 100 });
    fireEvent.pointerUp(content, { ...base, clientY: 100 });
    expect(heightOf(sheet)).toBe("400px");
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(sheet.getAttribute("data-sheet-height")).toBe("two");
  });

  it("US-QS-15 a sheet at its fitting height closes when its handle is dragged far down", async () => {
    const onOpenChange = vi.fn();
    render(<Example onOpenChange={onOpenChange} />);
    const sheet = await sheetOf();
    await waitFor(() => expect(sheet.getAttribute("data-sheet-height")).toBe("fit"));
    const handle = sheet.querySelector<HTMLElement>("[data-sheet-handle]") as HTMLElement;
    const base = { pointerId: 3, pointerType: "touch", button: 0, isPrimary: true };
    fireEvent.pointerDown(handle, { ...base, clientY: 400 });
    fireEvent.pointerMove(handle, { ...base, clientY: 700 });
    fireEvent.pointerUp(handle, { ...base, clientY: 700 });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("US-QS-15 · Escape and Schließen still close a sheet at half height", () => {
  it("US-QS-15 Escape closes the sheet at half height", async () => {
    layout.content = 1200;
    const onOpenChange = vi.fn();
    render(<Example onOpenChange={onOpenChange} />);
    const sheet = await sheetOf();
    await waitFor(() => expect(heightOf(sheet)).toBe("400px"));
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("US-QS-15 'Schließen' closes the sheet at half height", async () => {
    layout.content = 1200;
    const onOpenChange = vi.fn();
    render(<Example onOpenChange={onOpenChange} />);
    const sheet = await sheetOf();
    await waitFor(() => expect(heightOf(sheet)).toBe("400px"));
    await userEvent.click(within(sheet).getByRole("button", { name: "Schließen" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("US-QS-15 · prefers-reduced-motion: a change of height snaps", () => {
  it("US-QS-15 with prefers-reduced-motion: reduce the sheet marks its height changes as snapping", async () => {
    reduced = true;
    layout.content = 1200;
    render(<Example />);
    const sheet = await sheetOf();
    await waitFor(() => expect(sheet.getAttribute("data-sheet-height")).toBe("two"));
    expect(sheet.getAttribute("data-sheet-motion")).toBe("snap");
  });

  it("US-QS-15 without it the sheet slides between its heights", async () => {
    layout.content = 1200;
    render(<Example />);
    const sheet = await sheetOf();
    await waitFor(() => expect(sheet.getAttribute("data-sheet-height")).toBe("two"));
    expect(sheet.getAttribute("data-sheet-motion")).toBe("slide");
  });
});

describe("US-QS-15 · a sheet that opens again starts at its own height", () => {
  it("US-QS-15 a sheet that was at full height opens at half height the next time", async () => {
    layout.content = 1200;
    function Again() {
      const [open, setOpen] = useState(true);
      return (
        <AnnouncerProvider>
          <button onClick={() => setOpen(!open)}>Wechseln</button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent title="Filter">
              <button>Anwenden</button>
            </SheetContent>
          </Sheet>
        </AnnouncerProvider>
      );
    }
    render(<Again />);
    const first = await sheetOf();
    await userEvent.click(await screen.findByRole("button", { name: "Vollbild" }));
    expect(heightOf(first)).toBe("800px");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await userEvent.click(screen.getByRole("button", { name: "Wechseln" }));
    const again = await sheetOf();
    await waitFor(() => expect(heightOf(again)).toBe("400px"));
  });
});
