// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Accordion, Collapsible } from "./accordion";

afterEach(cleanup);

describe("Collapsible and Accordion (US-QS-07, DS-34)", () => {
  it("US-QS-07 a closed section has a button with aria-expanded=false that controls a labelled region", () => {
    render(<Collapsible title="Licht">Heller Standort</Collapsible>);
    const button = screen.getByRole("button", { name: "Licht" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    const region = document.getElementById(button.getAttribute("aria-controls") ?? "");
    expect(region?.getAttribute("role")).toBe("region");
    expect(region?.getAttribute("aria-labelledby")).toBe(button.id);
    expect(region?.className).toContain("invisible");
    expect(screen.getByRole("heading", { level: 3 })).toBeTruthy();
  });

  it("US-QS-07 Enter and Space toggle it and report the change", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Collapsible title="Licht" onOpenChange={onOpenChange}>
        Heller Standort
      </Collapsible>,
    );
    await user.tab();
    await user.keyboard("{Enter}");
    const button = screen.getByRole("button", { name: "Licht" });
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("region", { name: "Licht" }).className).toContain(
      "visible grid-rows-[1fr]",
    );
    await user.keyboard(" ");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(onOpenChange.mock.calls).toEqual([[true], [false]]);
  });

  it("US-QS-07 the height animates with the motion token and stops under reduced motion", () => {
    render(<Collapsible title="Licht">x</Collapsible>);
    const cls =
      screen.getByRole("button", { name: "Licht" }).parentElement?.nextElementSibling?.className ??
      "";
    expect(cls).toContain("duration-(--motion-base)");
    expect(cls).toContain("motion-reduce:transition-none");
  });

  it("US-QS-07 the heading level is configurable", () => {
    render(
      <Collapsible title="Licht" headingLevel={2}>
        x
      </Collapsible>,
    );
    expect(screen.getByRole("heading", { level: 2 })).toBeTruthy();
  });

  it("US-QS-07 an accordion keeps its sections independent and honours defaultOpen", async () => {
    const user = userEvent.setup();
    render(
      <Accordion
        defaultOpen={["b"]}
        items={[
          { value: "a", title: "Licht", content: "A" },
          { value: "b", title: "Wasser", content: "B" },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: "Wasser" }).getAttribute("aria-expanded")).toBe(
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Licht" }));
    expect(screen.getByRole("button", { name: "Licht" }).getAttribute("aria-expanded")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "Wasser" }).getAttribute("aria-expanded")).toBe(
      "true",
    );
  });
});
