// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UnsavedInputDialog } from "./unsaved-input-dialog";

afterEach(cleanup);

function renderDialog(onKeep = vi.fn(), onDiscard = vi.fn()) {
  render(<UnsavedInputDialog open onKeep={onKeep} onDiscard={onDiscard} />);
  return { onKeep, onDiscard };
}

describe("US-QS-32 · SG-SHEET-05 the question for unsaved input", () => {
  it("US-QS-32 · SG-SHEET-05 says what is at stake, with the wording of the plant forms", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog", { name: "Eingabe verwerfen?" });
    expect(dialog.textContent).toContain(
      "Was du eingetragen hast, ist noch nicht gesichert. Verwirfst du es, ist es weg.",
    );
  });

  it("US-QS-32 · SG-SHEET-05 offers two verbs, and the safe one, Weiter bearbeiten, comes first and takes the focus", async () => {
    renderDialog();
    // The close control of the dialog is an icon with its own name; the two verbs are the buttons with text.
    const buttons = screen.getAllByRole("button").filter((b) => b.textContent?.trim() !== "");
    expect(buttons.map((b) => b.textContent)).toEqual(["Weiter bearbeiten", "Eingabe verwerfen"]);
    await waitFor(() => expect(document.activeElement).toBe(buttons[0]));
  });

  it("US-QS-32 · SG-SHEET-05 Weiter bearbeiten keeps the input; Escape keeps it too", async () => {
    const { onKeep, onDiscard } = renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Weiter bearbeiten" }));
    expect(onKeep).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it("US-QS-32 · SG-SHEET-05 Eingabe verwerfen leaves the input", async () => {
    const { onKeep, onDiscard } = renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Eingabe verwerfen" }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onKeep).not.toHaveBeenCalled();
  });

  it("US-QS-32 · SG-BTN-03 the discard is a red plain button, and the dialog keeps one filled button (SG-BTN-02)", () => {
    renderDialog();
    const discard = screen.getByRole("button", { name: "Eingabe verwerfen" }).className;
    expect(discard.split(/\s+/)).toContain("text-destructive");
    expect(discard.split(/\s+/).some((c) => c === "bg-destructive" || c === "bg-primary")).toBe(
      false,
    );
    const filled = screen
      .getAllByRole("button")
      .filter((b) => b.className.split(/\s+/).includes("bg-primary"));
    expect(filled.map((b) => b.textContent)).toEqual(["Weiter bearbeiten"]);
  });
});
