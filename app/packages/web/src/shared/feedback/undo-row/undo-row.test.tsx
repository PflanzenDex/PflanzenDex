// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UndoRow } from "./undo-row";

afterEach(() => {
  cleanup();
});

describe("US-QS-32 UndoRow shows the result in place with its undo", () => {
  it("US-QS-32 reads '<result> · Rückgängig' while the undo is open", () => {
    render(<UndoRow result="Erledigt" subject="Gießen bei Aloe" onUndo={() => undefined} />);
    expect(screen.getByText("Erledigt").textContent).toBe("Erledigt");
    expect(screen.getByRole("button", { name: "Rückgängig: Gießen bei Aloe" }).textContent).toBe(
      "Rückgängig",
    );
    expect(document.querySelector("p")?.textContent).toBe("Erledigt · Rückgängig");
  });

  it("US-QS-32 without an undo it reads the result only (a bulk write shows its undo on one row)", () => {
    render(<UndoRow result="Gegossen" subject="Ficus" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(document.querySelector("p")?.textContent).toBe("Gegossen");
  });

  it("US-QS-32 the undo is a real button with a 44 px hit area and the visible word in its name", () => {
    render(<UndoRow result="Umgestellt" subject="Vier Pflanzen" onUndo={() => undefined} />);
    const undo = screen.getByRole("button", { name: /^Rückgängig/ });
    expect(undo.tagName).toBe("BUTTON");
    expect(undo.getAttribute("type")).toBe("button");
    expect(undo.className).toContain("min-h-[44px]");
    expect(undo.className).toContain("min-w-[44px]");
  });

  it("US-QS-32 a tap on the undo calls it once", async () => {
    const onUndo = vi.fn();
    render(<UndoRow result="Gegossen" subject="Ficus" onUndo={onUndo} />);
    await userEvent.click(screen.getByRole("button", { name: "Rückgängig: Ficus" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("US-QS-32 while the undo runs it is aria-disabled, not disabled, and a second tap does nothing", async () => {
    const onUndo = vi.fn();
    render(<UndoRow result="Gegossen" subject="Ficus" onUndo={onUndo} busy />);
    const undo = screen.getByRole("button", { name: "Rückgängig: Ficus" });
    expect(undo.getAttribute("aria-disabled")).toBe("true");
    expect(undo.hasAttribute("disabled")).toBe(false);
    await userEvent.click(undo);
    expect(onUndo).not.toHaveBeenCalled();
  });

  it("US-QS-32 when the row turns into the undo row, the undo takes the focus if nothing else has it (no focus loss)", () => {
    render(<UndoRow result="Erledigt" subject="Gießen bei Aloe" onUndo={() => undefined} />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /^Rückgängig/ }));
  });

  it("US-QS-32 the undo row does not take a focus another control already holds", () => {
    // The same root element in both renders, so the input is not remounted (and does not lose its focus).
    const { rerender } = render(
      <div>
        <input aria-label="Suche" />
      </div>,
    );
    const input = screen.getByRole("textbox", { name: "Suche" });
    input.focus();
    rerender(
      <div>
        <input aria-label="Suche" />
        <UndoRow result="Erledigt" subject="Aloe" onUndo={() => undefined} />
      </div>,
    );
    expect(document.activeElement).toBe(input);
  });
});
