// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog, DialogContent } from "@/shared/ui/dialog";
import { Popover } from "./popover";

afterEach(cleanup);
afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1024 });
});

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

describe("Popover (US-QS-07, DS-34)", () => {
  it("US-QS-07 the trigger announces a closed popup and the panel is absent", () => {
    render(<Popover label="Zur Pflanze">Text</Popover>);
    const trigger = screen.getByRole("button", { name: "Zur Pflanze" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("US-QS-07 opening moves focus into the named panel that the trigger controls", async () => {
    const user = userEvent.setup();
    render(<Popover label="Zur Pflanze">Text</Popover>);
    await user.click(screen.getByRole("button", { name: "Zur Pflanze" }));
    const panel = screen.getByRole("dialog", { name: "Zur Pflanze" });
    expect(document.activeElement).toBe(panel);
    const trigger = screen.getByRole("button", { name: "Zur Pflanze" });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("aria-controls")).toBe(panel.id);
  });

  it("US-QS-07 Escape closes it and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<Popover label="Zur Pflanze">Text</Popover>);
    await user.click(screen.getByRole("button", { name: "Zur Pflanze" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Zur Pflanze" }));
  });

  it("US-QS-07 a press outside closes it, a press inside does not", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">draußen</button>
        <Popover label="Zur Pflanze">Text</Popover>
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Zur Pflanze" }));
    await user.click(screen.getByText("Text"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "draußen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("US-QS-07 tabbing out of the panel closes it, and an icon trigger is named by the label", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Popover label="Zur Pflanze" trigger={<span aria-hidden="true">i</span>}>
          <a href="#x">Link</a>
        </Popover>
        <button type="button">danach</button>
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Zur Pflanze" }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Link" }));
    await user.tab();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("US-QS-32 Escape in an open popover inside a dialog closes the popover only and returns focus to its trigger", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Dialog defaultOpen onOpenChange={onOpenChange}>
        <DialogContent title="Pflanze">
          <Popover label="Zur Pflanze">Text</Popover>
        </DialogContent>
      </Dialog>,
    );
    const trigger = screen.getByRole("button", { name: "Zur Pflanze" });
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Zur Pflanze" })).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Zur Pflanze" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Pflanze" })).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(document.activeElement).toBe(trigger);
  });

  it("US-QS-32 a popover panel that sticks out at the left window edge moves in until 16 px separate it from the edge", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 360 });
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element,
    ) {
      return this.matches('[role="dialog"]') ? rectAt(-40, 300) : rectAt(0, 0);
    });
    const user = userEvent.setup();
    render(<Popover label="Zur Pflanze">Text</Popover>);
    await user.click(screen.getByRole("button", { name: "Zur Pflanze" }));
    expect(screen.getByRole("dialog", { name: "Zur Pflanze" }).style.transform).toBe(
      "translateX(56px)",
    );
  });
});
