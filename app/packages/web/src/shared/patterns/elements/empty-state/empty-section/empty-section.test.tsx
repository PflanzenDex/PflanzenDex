// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmptySection } from "./empty-section";

afterEach(cleanup);

describe("EmptySection (US-QS-32, SG-STATE-01, Q12)", () => {
  it("US-QS-32 renders exactly one line of text and no heading, image or icon", () => {
    const { container } = render(<EmptySection text="Noch keine Messung." />);
    expect(container.querySelectorAll("p")).toHaveLength(1);
    expect(screen.getByText("Noch keine Messung.")).toBeTruthy();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(container.querySelector("img, svg")).toBeNull();
  });

  it("US-QS-32 the next step is a tinted button that runs its handler", async () => {
    const onClick = vi.fn();
    render(
      <EmptySection text="Noch keine Messung." action={{ label: "Messung erfassen", onClick }} />,
    );
    const button = screen.getByRole("button", { name: "Messung erfassen" });
    expect(button.className.split(/\s+/)).toContain("bg-accent");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("US-QS-32 an action can be a link to its target", () => {
    render(
      <EmptySection
        text="Noch keine Pflanze."
        action={{ label: "Pflanze anlegen", href: "/collection/new" }}
      />,
    );
    expect(screen.getByRole("link", { name: "Pflanze anlegen" }).getAttribute("href")).toBe(
      "/collection/new",
    );
  });

  it("US-QS-32 without an action the section has no button", () => {
    render(<EmptySection text="Keine Abweichung." />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
