// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Tabs } from "./tabs";

afterEach(cleanup);

const tabs = [
  { value: "a", label: "Licht", content: "Inhalt Licht" },
  { value: "b", label: "Wasser", content: "Inhalt Wasser" },
  { value: "c", label: "Boden", content: "Inhalt Boden" },
];

describe("Tabs (US-QS-07, DS-34)", () => {
  it("US-QS-07 renders a named tablist, tabs wired to one panel by aria-selected and aria-controls", () => {
    render(<Tabs label="Pflegeprofil" tabs={tabs} />);
    expect(screen.getByRole("tablist", { name: "Pflegeprofil" })).toBeTruthy();
    const first = screen.getByRole("tab", { name: "Licht" });
    expect(first.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Wasser" }).getAttribute("aria-selected")).toBe("false");
    const panel = screen.getByRole("tabpanel", { name: "Licht" });
    expect(first.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.textContent).toBe("Inhalt Licht");
  });

  it("US-QS-07 roving tabindex: only the selected tab is in the tab order", async () => {
    const user = userEvent.setup();
    render(<Tabs label="Pflegeprofil" tabs={tabs} defaultValue="b" />);
    expect(screen.getAllByRole("tab").map((t) => t.getAttribute("tabindex"))).toEqual([
      "-1",
      "0",
      "-1",
    ]);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Wasser" }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("tabpanel"));
  });

  it("US-QS-07 arrow keys move and select (wrapping), Home and End jump", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Tabs label="Pflegeprofil" tabs={tabs} onValueChange={onValueChange} />);
    await user.tab();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Wasser" }));
    expect(screen.getByRole("tabpanel").textContent).toBe("Inhalt Wasser");
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Boden" }));
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Licht" }));
    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Boden" }));
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Licht" }));
    expect(onValueChange).toHaveBeenLastCalledWith("a");
  });

  it("US-QS-07 a click selects, and a controlled value wins over the inner state", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Tabs label="x" tabs={tabs} value="a" onValueChange={onValueChange} />);
    await user.click(screen.getByRole("tab", { name: "Boden" }));
    expect(onValueChange).toHaveBeenCalledWith("c");
    expect(screen.getByRole("tab", { name: "Licht" }).getAttribute("aria-selected")).toBe("true");
  });

  it("US-QS-07 tabs are 44 px targets with a focus ring", () => {
    render(<Tabs label="x" tabs={tabs} />);
    const cls = screen.getByRole("tab", { name: "Licht" }).className;
    expect(cls).toContain("min-h-[44px]");
    expect(cls).toContain("focus-visible:ring-2");
  });
});
