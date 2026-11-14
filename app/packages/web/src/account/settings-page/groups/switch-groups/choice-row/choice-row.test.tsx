// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChoiceRow } from "./choice-row";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const options = [
  { value: "plain", label: "Einzeltasten" },
  { value: "disabled", label: "Aus" },
] as const;

describe("US-QS-30 · ChoiceRow that needs the network", () => {
  it("US-QS-30 · offline a choice that writes at once keeps its value, is not saved and says why below the help", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const onPick = vi.fn();
    render(
      <ChoiceRow
        name="keyboardShortcuts"
        label="Tastenkürzel"
        help="Hilfe zur Wahl."
        options={options}
        value="plain"
        onPick={onPick}
        needsNetwork
      />,
    );
    const select = screen.getByRole<HTMLSelectElement>("combobox");
    await userEvent.selectOptions(select, "disabled");
    expect(onPick).not.toHaveBeenCalled();
    expect(select.value).toBe("plain");
    expect(select.getAttribute("aria-disabled")).toBe("true");
    const reason = document.getElementById(select.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent).toBe("Du bist offline. Das geht erst wieder mit Verbindung.");
  });

  it("US-QS-30 · online a choice that needs the network saves the pick", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    const onPick = vi.fn();
    render(
      <ChoiceRow
        name="keyboardShortcuts"
        label="Tastenkürzel"
        help="Hilfe zur Wahl."
        options={options}
        value="plain"
        onPick={onPick}
        needsNetwork
      />,
    );
    await userEvent.selectOptions(screen.getByRole("combobox"), "disabled");
    expect(onPick).toHaveBeenCalledWith("disabled");
  });
});
