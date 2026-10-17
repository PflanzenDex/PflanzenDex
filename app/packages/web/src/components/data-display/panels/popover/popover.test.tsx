// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { Popover } from "./popover";

afterEach(cleanup);

describe("Popover (US-QS-07, DS-34)", () => {
  it("US-QS-07 the trigger announces a closed popup and the panel is absent", () => {
    render(<Popover label="Zur Pflanze">Text</Popover>);
    const trigger = screen.getByRole("button", { name: "Zur Pflanze" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("US-QS-07 opening moves focus into the named panel that the trigger controls", async () => {
    const user = userEvent.setup();
    render(<Popover label="Zur Pflanze">Text</Popover>);
    await user.click(screen.getByRole("button", { name: "Zur Pflanze" }));
    const panel = screen.getByRole("dialog", { name: "Zur Pflanze" });
    expect(document.activeElement).toBe(panel);
    const trigger = screen.getByRole("button", { name: "Zur Pflanze" });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("aria-controls")).toBe(panel.id);
  });

  it("US-QS-07 Escape closes it and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<Popover label="Zur Pflanze">Text</Popover>);
    await user.click(screen.getByRole("button", { name: "Zur Pflanze" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Zur Pflanze" }));
  });

  it("US-QS-07 a press outside closes it, a press inside does not", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">draußen</button>
        <Popover label="Zur Pflanze">Text</Popover>
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Zur Pflanze" }));
    await user.click(screen.getByText("Text"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "draußen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("US-QS-07 tabbing out of the panel closes it, and an icon trigger is named by the label", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Popover label="Zur Pflanze" trigger={<span aria-hidden="true">i</span>}>
          <a href="#x">Link</a>
        </Popover>
        <button type="button">danach</button>
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Zur Pflanze" }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Link" }));
    await user.tab();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
