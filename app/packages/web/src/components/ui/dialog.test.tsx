// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
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

  it("US-QS-07 · DS-23 the close button keeps a 44 px target and closes the dialog", async () => {
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    const close = screen.getByRole("button", { name: "Schließen" });
    expect(close.className).toContain("min-h-[44px]");
    await userEvent.click(close);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
