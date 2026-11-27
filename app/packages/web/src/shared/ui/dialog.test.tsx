// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { useInLayer } from "./layer-scope";
import { Dialog, DialogContent, DialogTrigger } from "./dialog";

afterEach(cleanup);

function Example() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button>Öffnen</button>
      </DialogTrigger>
      <DialogContent title="Pflanze löschen" closeLabel="Schließen">
        <button>Bestätigen</button>
      </DialogContent>
    </Dialog>
  );
}

describe("Dialog (US-QS-07, DS-23, DS-40)", () => {
  it("US-QS-07 · DS-23 opens as a named dialog with the required title", async () => {
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    expect(screen.getByRole("dialog", { name: "Pflanze löschen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Schließen" })).toBeTruthy();
  });

  it("US-QS-07 · DS-40 Esc closes the dialog and focus returns to the trigger", async () => {
    render(<Example />);
    const trigger = screen.getByRole("button", { name: "Öffnen" });
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("US-QS-07 · DS-40 Tab at the last focusable element keeps focus inside the dialog", async () => {
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    const dialog = screen.getByRole("dialog");
    for (let i = 0; i < 5; i++) {
      await userEvent.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it("US-QS-07 · DS-23 the close control is a 20 px icon, not a text glyph that shrinks on desktop (issue 1045)", async () => {
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    const close = screen.getByRole("button", { name: "Schließen" });
    expect(close.textContent).toBe("");
    const icon = close.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("class")).toContain("size-5");
  });

  it("US-QS-07 · DS-23 the close button keeps a 44 px target and closes the dialog", async () => {
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    const close = screen.getByRole("button", { name: "Schließen" });
    expect(close.className).toContain("min-h-[44px]");
    await userEvent.click(close);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("US-QS-32 · SG-COLOR-07 the backdrop takes the scrim class, never the foreground, so it stays dark in dark mode", async () => {
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    const backdrop = document.querySelector(".fixed.inset-0.z-50");
    expect(backdrop).not.toBeNull();
    expect(backdrop?.classList.contains("bg-scrim")).toBe(true);
    expect(backdrop?.className).not.toContain("bg-foreground");
  });

  it("US-QS-32 · SG-LIST-01 what a dialog holds is in a layer, so its lists scroll with the layer and never page", async () => {
    function Probe() {
      return <p>{useInLayer() ? "in a layer" : "on a page"}</p>;
    }
    render(
      <Dialog open>
        <DialogContent title="Pflanze löschen">
          <Probe />
        </DialogContent>
      </Dialog>,
    );
    expect(await screen.findByText("in a layer")).toBeTruthy();
  });

  it("US-QS-15 what a dialog holds is its scroll region; the title and the close button stay outside it", async () => {
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    const dialog = screen.getByRole("dialog", { name: "Pflanze löschen" });
    const region = dialog.querySelector<HTMLElement>("[data-scroll-region]");
    expect(region).not.toBeNull();
    expect(region?.className).toContain("overflow-y-auto");
    expect(region?.className).toContain("overscroll-contain");
    expect(region?.contains(screen.getByRole("button", { name: "Bestätigen" }))).toBe(true);
    expect(region?.contains(screen.getByRole("heading", { name: "Pflanze löschen" }))).toBe(false);
    expect(region?.contains(screen.getByRole("button", { name: "Schließen" }))).toBe(false);
    // The dialog itself no longer scrolls: its height is the limit, and the region takes what the title leaves.
    expect(dialog.className).not.toContain("overflow-y-auto");
  });
});
