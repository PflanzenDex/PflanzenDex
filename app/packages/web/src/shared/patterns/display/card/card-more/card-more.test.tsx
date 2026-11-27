// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { CardMore, CardSection, MoreButton } from "./card-more";

beforeAll(() => {
  // jsdom has no pointer capture; Vaul calls it on pointerdown inside the sheet.
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
});

afterEach(cleanup);

const example = (name = "Monstera deliciosa") => (
  <CardMore name={name}>
    <CardSection title="Beschreibung">
      <p>Ein Aronstabgewächs.</p>
    </CardSection>
    <CardSection title="Quellen">
      <a href="https://example.org/q">Wikipedia</a>
    </CardSection>
  </CardMore>
);

describe("US-QS-32 · US-QS-15 · d-066 the Mehr button of a two-level card", () => {
  it("US-QS-32 the button shows 'Mehr' and names the card for assistive technology: 'Mehr: {name}' (WCAG 2.5.3)", () => {
    setViewportWidth(360);
    render(example());
    const button = screen.getByRole("button", { name: "Mehr: Monstera deliciosa" });
    expect(button.textContent).toBe("Mehr");
    expect(
      button.textContent && button.getAttribute("aria-label")?.startsWith(button.textContent),
    ).toBe(true);
  });

  it("US-QS-32 · SG-TOUCH-01 the button is a target of at least 44 px", () => {
    setViewportWidth(360);
    render(example());
    const button = screen.getByRole("button", { name: "Mehr: Monstera deliciosa" });
    expect(button.className).toContain("min-h-[44px]");
  });

  it("US-QS-32 · US-QS-15 the details are not rendered before the sheet opens, so a row of cards stays light", () => {
    setViewportWidth(360);
    render(example());
    expect(screen.queryByText("Ein Aronstabgewächs.")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("US-QS-15 · US-QS-32 'Mehr' opens a sheet titled with the card name that holds the sections", async () => {
    setViewportWidth(360);
    render(example());
    await userEvent.click(screen.getByRole("button", { name: "Mehr: Monstera deliciosa" }));
    const sheet = await screen.findByRole("dialog", { name: "Monstera deliciosa" });
    expect(within(sheet).getByRole("heading", { name: "Beschreibung", level: 3 })).toBeTruthy();
    expect(within(sheet).getByText("Ein Aronstabgewächs.")).toBeTruthy();
    expect(within(sheet).getByRole("heading", { name: "Quellen", level: 3 })).toBeTruthy();
    expect(within(sheet).getByRole("link", { name: "Wikipedia" })).toBeTruthy();
  });

  it("US-QS-15 · US-QS-32 each section is a region named by its heading", async () => {
    setViewportWidth(360);
    render(example());
    await userEvent.click(screen.getByRole("button", { name: "Mehr: Monstera deliciosa" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByRole("region", { name: "Quellen" })).toBeTruthy();
  });

  it("US-QS-15 · SG-SHEET-02 the sheet closes with 'Schließen' and the focus returns to 'Mehr'", async () => {
    setViewportWidth(360);
    render(example());
    const button = screen.getByRole("button", { name: "Mehr: Monstera deliciosa" });
    await userEvent.click(button);
    const sheet = await screen.findByRole("dialog");
    await userEvent.click(within(sheet).getByRole("button", { name: "Schließen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("US-QS-15 · US-QS-08 Escape closes the sheet and the focus returns to 'Mehr'", async () => {
    setViewportWidth(360);
    render(example());
    const button = screen.getByRole("button", { name: "Mehr: Monstera deliciosa" });
    await userEvent.click(button);
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("US-QS-32 · SG-TYPE-05 a long one-word name breaks inside the sheet title instead of leaving the sheet", async () => {
    setViewportWidth(360);
    render(example("Schwiegermutterzunge"));
    await userEvent.click(screen.getByRole("button", { name: "Mehr: Schwiegermutterzunge" }));
    const title = await screen.findByRole("heading", { name: "Schwiegermutterzunge", level: 2 });
    expect(title.className).toContain("break-words");
  });
});

describe("US-QS-15 · SG-SHEET-03 · d-163 the Mehr button alone, for a card inside a sheet", () => {
  it("US-QS-15 · SG-SHEET-03 MoreButton reads 'Mehr', is named 'Mehr: {name}', is 44 px and opens no sheet of its own", async () => {
    setViewportWidth(360);
    const clicks: string[] = [];
    render(<MoreButton name="Monstera deliciosa" onClick={() => clicks.push("more")} />);
    const button = screen.getByRole("button", { name: "Mehr: Monstera deliciosa" });
    expect(button.textContent).toBe("Mehr");
    expect(button.className).toContain("min-h-[44px]");
    await userEvent.click(button);
    expect(clicks).toEqual(["more"]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
