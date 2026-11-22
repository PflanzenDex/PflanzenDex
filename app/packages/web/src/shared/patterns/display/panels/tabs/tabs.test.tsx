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

  it("US-QS-21 wrap breaks the tabs onto more lines instead of scrolling the list sideways", () => {
    render(<Tabs label="x" tabs={tabs} wrap />);
    const list = screen.getByRole("tablist").className;
    expect(list).toContain("flex-wrap");
    expect(list).not.toContain("overflow-x-auto");
  });

  it("US-QS-21 without wrap the tab list keeps one line and scrolls sideways (the default)", () => {
    render(<Tabs label="x" tabs={tabs} />);
    const list = screen.getByRole("tablist").className;
    expect(list).toContain("overflow-x-auto");
    expect(list).not.toContain("flex-wrap");
  });

  it("NFR-13 wrap lets every label break inside its tab: a tab is never narrower than its label", () => {
    render(<Tabs label="x" tabs={tabs} wrap />);
    for (const tab of screen.getAllByRole("tab")) {
      const classes = tab.className.split(" ");
      expect(classes).toContain("min-w-fit");
      expect(classes).toContain("whitespace-normal");
      expect(classes).not.toContain("whitespace-nowrap");
    }
  });

  it("NFR-13 without wrap a label stays on one line, and a tab is never narrower than its label (US-QS-15, issue 2417)", () => {
    render(<Tabs label="x" tabs={tabs} />);
    for (const tab of screen.getAllByRole("tab")) {
      const classes = tab.className.split(" ");
      expect(classes).toContain("whitespace-nowrap");
      expect(classes).toContain("min-w-max");
      expect(classes).not.toContain("whitespace-normal");
    }
  });

  it("US-QS-15 a strip that does not wrap is the marked tabs region of the one-screen gate (DS-63, issue 2417)", () => {
    render(<Tabs label="x" tabs={tabs} />);
    expect(screen.getByRole("tablist").getAttribute("data-scroll-x")).toBe("tabs");
  });

  it("US-QS-15 a wrapped strip scrolls nothing and carries no sideways marker (issue 2417)", () => {
    render(<Tabs label="x" tabs={tabs} wrap />);
    expect(screen.getByRole("tablist").hasAttribute("data-scroll-x")).toBe(false);
  });

  it("US-QS-21 the panel takes the classes of its caller", () => {
    render(<Tabs label="x" tabs={tabs} panelClassName="min-h-0 flex-1" />);
    expect(screen.getByRole("tabpanel").className).toContain("flex-1");
  });
});

describe("US-QS-07 the selected tab in dark mode (issue 1045)", () => {
  it("US-QS-32 the selected tab is a raised card with a boundary in the field colour, not a green fill", () => {
    render(<Tabs label="x" tabs={tabs} />);
    const selected = screen.getByRole("tab", { name: "Licht" }).className.split(" ");
    expect(selected).toEqual(
      expect.arrayContaining(["bg-card", "shadow-elevation-1", "border", "border-input"]),
    );
    expect(selected).not.toContain("bg-accent");
    expect(screen.getByRole("tab", { name: "Boden" }).className).not.toContain("bg-accent");
  });
});

describe("US-QS-32 the selected tab has two cues besides the fill (SG-CTRL-01)", () => {
  it("US-QS-32 the selected tab has a semibold label in the text colour, the others a normal label", () => {
    render(<Tabs label="x" tabs={tabs} />);
    const selected = screen.getByRole("tab", { name: "Licht" }).className.split(" ");
    expect(selected).toEqual(expect.arrayContaining(["font-semibold", "text-foreground"]));
    const other = screen.getByRole("tab", { name: "Boden" }).className.split(" ");
    expect(other).toEqual(expect.arrayContaining(["font-normal", "text-muted-foreground"]));
    expect(other).not.toContain("font-semibold");
  });

  it("US-QS-32 the other tabs carry a transparent boundary of the same width, so nothing jumps", () => {
    render(<Tabs label="x" tabs={tabs} />);
    const other = screen.getByRole("tab", { name: "Boden" }).className.split(" ");
    expect(other).toEqual(expect.arrayContaining(["border", "border-transparent"]));
    expect(other).not.toContain("border-input");
  });

  it("US-QS-32 the tabs stay equal width (flex-1) with the boundary", () => {
    render(<Tabs label="x" tabs={tabs} />);
    for (const tab of screen.getAllByRole("tab"))
      expect(tab.className.split(" ")).toContain("flex-1");
  });
});
