// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Menu } from "./menu";

afterEach(cleanup);

const setup = () => {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  render(
    <Menu
      label="Weitere Aktionen"
      items={[
        { label: "Bearbeiten", onSelect: onEdit },
        { label: "Archivieren", onSelect: () => undefined, disabled: true },
        { label: "Löschen", onSelect: onDelete, destructive: true },
      ]}
    />,
  );
  return {
    onEdit,
    onDelete,
    trigger: () => screen.getByRole("button", { name: "Weitere Aktionen" }),
  };
};

describe("Menu (US-QS-07, DS-34)", () => {
  it("US-QS-07 the trigger is a named menu button and the menu is absent while closed", () => {
    const { trigger } = setup();
    expect(trigger().getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(trigger().className).toContain("min-h-[44px]");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("US-QS-07 opening by click or ArrowDown focuses the first item of the named menu", async () => {
    const user = userEvent.setup();
    const { trigger } = setup();
    await user.click(trigger());
    expect(screen.getByRole("menu", { name: "Weitere Aktionen" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Bearbeiten" }));
    await user.keyboard("{Escape}");
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Bearbeiten" }));
  });

  it("US-QS-07 arrow keys, Home and End move over enabled items only and wrap", async () => {
    const user = userEvent.setup();
    const { trigger } = setup();
    await user.click(trigger());
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Löschen" }));
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Bearbeiten" }));
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Löschen" }));
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Bearbeiten" }));
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Löschen" }));
  });

  it("US-QS-07 Enter runs the action, closes the menu and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    const { trigger, onDelete } = setup();
    await user.click(trigger());
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("US-QS-07 Escape closes without an action and returns focus; a press outside closes too", async () => {
    const user = userEvent.setup();
    const { trigger, onEdit } = setup();
    await user.click(trigger());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger());
    expect(onEdit).not.toHaveBeenCalled();
    await user.click(trigger());
    await user.click(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
