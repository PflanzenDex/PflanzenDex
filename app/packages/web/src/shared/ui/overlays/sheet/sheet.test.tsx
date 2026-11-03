// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Sheet, SheetContent, SheetTrigger } from "./sheet";

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

function Example() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button>Öffnen</button>
      </SheetTrigger>
      <SheetContent title="Filter">
        <button>Anwenden</button>
      </SheetContent>
    </Sheet>
  );
}

describe("Sheet (US-QS-07, DS-23, DS-40)", () => {
  it("US-QS-07 · DS-23 opens as a named dialog with the required title", async () => {
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    expect(await screen.findByRole("dialog", { name: "Filter" })).toBeTruthy();
  });

  it("US-QS-07 · DS-23 the content respects the safe area and 90dvh", async () => {
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    const cls = (await screen.findByRole("dialog")).className;
    expect(cls).toContain("pb-[env(safe-area-inset-bottom)]");
    expect(cls).toContain("max-h-[90dvh]");
  });

  it("US-QS-07 · DS-40 Esc closes the sheet and focus returns to the trigger", async () => {
    render(<Example />);
    const trigger = screen.getByRole("button", { name: "Öffnen" });
    await userEvent.click(trigger);
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("US-QS-07 · DS-40 Tab keeps focus inside the sheet", async () => {
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    const dialog = await screen.findByRole("dialog");
    for (let i = 0; i < 5; i++) {
      await userEvent.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it("US-QS-07 · DS-08 the trigger is a named button that opens the sheet before the chunk is cached", async () => {
    render(<Example />);
    const trigger = screen.getByRole("button", { name: "Öffnen" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(await screen.findByRole("dialog", { name: "Filter" })).toBeTruthy();
  });

  it("US-QS-14 · DS-40 focus moves into the sheet on open and Tab cycles inside it", async () => {
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    for (let i = 0; i < 4; i++) {
      await userEvent.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    await userEvent.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});
