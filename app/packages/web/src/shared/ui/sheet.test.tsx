// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { useInLayer } from "./layer-scope";
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

  it("US-QS-07 · DS-23 the content respects the safe area; without a height of its own (US-QS-15) it stops at 90dvh", async () => {
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    const cls = (await screen.findByRole("dialog")).className;
    expect(cls).toContain("pb-[env(safe-area-inset-bottom)]");
    expect(cls).toContain("max-h-[var(--sheet-max,90dvh)]");
    expect(cls).toContain("h-(--sheet-height)");
  });

  it("US-QS-15 · DS-37 the sheet title, which takes the focus by script, draws no browser outline", async () => {
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    const title = await screen.findByRole("heading", { name: "Filter" });
    expect(title.className).toContain("focus-visible:outline-none");
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

  it("US-QS-32 · SG-COLOR-07 the backdrop takes the scrim class, never the foreground, so it stays dark in dark mode", async () => {
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    await screen.findByRole("dialog");
    const backdrop = document.querySelector(".fixed.inset-0.z-50");
    expect(backdrop).not.toBeNull();
    expect(backdrop?.classList.contains("bg-scrim")).toBe(true);
    expect(backdrop?.className).not.toContain("bg-foreground");
  });
  it("US-QS-32 a close that the parent refuses (typed input unsaved) snaps the dragged sheet back to its place", async () => {
    function Controlled({ refusals }: { refusals: number }) {
      return (
        <Sheet open onOpenChange={() => undefined}>
          <SheetContent title="Notiz" closeRefusals={refusals}>
            <button>Eins</button>
          </SheetContent>
        </Sheet>
      );
    }
    const { rerender } = render(<Controlled refusals={0} />);
    const sheet = await screen.findByRole("dialog", { name: "Notiz" });
    // Vaul writes the drag into the inline transform of the sheet and of its overlay.
    sheet.style.transform = "translate3d(0, 120px, 0)";
    rerender(<Controlled refusals={1} />);
    await waitFor(() => expect(sheet.style.transform).toBe("translate3d(0px, 0px, 0px)"));
    expect(sheet.style.transition).toContain("transform");
  });
});

function Labelled({ closeLabel }: { closeLabel?: string }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button>Öffnen</button>
      </SheetTrigger>
      <SheetContent title="Filter" {...(closeLabel ? { closeLabel } : {})}>
        <button>Anwenden</button>
      </SheetContent>
    </Sheet>
  );
}

describe("US-QS-32 · SG-SHEET-02 a sheet has a visible close control beside its title", () => {
  it("US-QS-32 · SG-SHEET-02 the sheet shows a button named Schließen inside it", async () => {
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    const dialog = await screen.findByRole("dialog", { name: "Filter" });
    expect(within(dialog).getByRole("button", { name: "Schließen" })).toBeTruthy();
  });

  it("US-QS-32 · SG-SHEET-02 the close button takes the label the caller gives", async () => {
    render(<Labelled closeLabel="Filter schließen" />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    const dialog = await screen.findByRole("dialog", { name: "Filter" });
    expect(within(dialog).getByRole("button", { name: "Filter schließen" })).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Schließen" })).toBeNull();
  });

  it("US-QS-32 · SG-SHEET-02 the close button closes the sheet and returns the focus to the trigger", async () => {
    render(<Example />);
    const trigger = screen.getByRole("button", { name: "Öffnen" });
    await userEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Filter" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Schließen" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("US-QS-32 · SG-TOUCH-03 the close button is at least 44 px square", async () => {
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    const dialog = await screen.findByRole("dialog", { name: "Filter" });
    const close = within(dialog).getByRole("button", { name: "Schließen" });
    expect(close.className).toContain("min-h-[44px]");
    expect(close.className).toContain("min-w-[44px]");
    expect(close.className).toContain("focus-visible:ring-2");
  });

  it("US-QS-32 · SG-SHEET-07 on open the focus stays on the first control of the sheet, never on the close button", async () => {
    render(<Labelled />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    const dialog = await screen.findByRole("dialog", { name: "Filter" });
    const first = within(dialog).getByRole("button", { name: "Anwenden" });
    await waitFor(() => expect(document.activeElement).toBe(first));
    expect(document.activeElement).not.toBe(
      within(dialog).getByRole("button", { name: "Schließen" }),
    );
  });

  it("US-QS-32 · SG-SHEET-07 a sheet of links only (the menu Mehr) keeps the focus on the sheet, not on its close button", async () => {
    render(
      <Sheet>
        <SheetTrigger asChild>
          <button>Öffnen</button>
        </SheetTrigger>
        <SheetContent title="Mehr">
          <a href="#einstellungen">Einstellungen</a>
        </SheetContent>
      </Sheet>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    const dialog = await screen.findByRole("dialog", { name: "Mehr" });
    await waitFor(() => expect(document.activeElement).toBe(dialog));
    expect(document.activeElement).not.toBe(
      within(dialog).getByRole("button", { name: "Schließen" }),
    );
  });

  it("US-QS-32 · SG-COLOR-06 the grabber is drawn in the input boundary token, not in the muted surface", async () => {
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    const dialog = await screen.findByRole("dialog", { name: "Filter" });
    const grabber = dialog.querySelector("[aria-hidden='true'].rounded-full");
    expect(grabber).not.toBeNull();
    expect(grabber?.classList.contains("bg-input")).toBe(true);
    expect(grabber?.classList.contains("bg-muted")).toBe(false);
  });

  it("US-QS-32 · SG-LIST-01 what a sheet holds is in a layer, so its lists scroll with the layer and never page", async () => {
    function Probe() {
      return <p>{useInLayer() ? "in a layer" : "on a page"}</p>;
    }
    render(
      <Sheet open>
        <SheetContent title="Filter">
          <Probe />
        </SheetContent>
      </Sheet>,
    );
    expect(await screen.findByText("in a layer")).toBeTruthy();
  });
});
