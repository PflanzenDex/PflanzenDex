// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlantControls } from "./plant-controls";

afterEach(cleanup);

const OPTIONS = [
  { value: "all", label: "Alle" },
  { value: "phase", label: "Nach Pflegephase" },
] as const;

describe("US-QS-14 controls of the plants", () => {
  it("US-QS-14 the grouping is a named group of toggle buttons and the manage action is a button", async () => {
    const group = vi.fn();
    const manage = vi.fn();
    render(<PlantControls group="all" options={OPTIONS} onGroup={group} onManage={manage} />);
    const phase = screen.getByRole("button", { name: "Nach Pflegephase" });
    expect(screen.getByRole("group", { name: "Gruppierung der Pflanzen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Alle/ }).getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(phase);
    expect(group).toHaveBeenCalledWith("phase");
    await userEvent.click(screen.getByRole("button", { name: "Standorte verwalten" }));
    expect(manage).toHaveBeenCalledTimes(1);
  });
});
