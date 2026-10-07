// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmptyState } from "./empty-state";

afterEach(cleanup);

describe("EmptyState (US-QS-07, DS-26, P-09)", () => {
  it("US-QS-07 · DS-26 shows title, description and the next step as a focusable 44 px button", async () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="Noch keine Pflanzen"
        description="Lege deine erste Pflanze an."
        action={{ label: "Pflanze anlegen", onClick }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Noch keine Pflanzen" })).toBeTruthy();
    expect(screen.getByText("Lege deine erste Pflanze an.")).toBeTruthy();
    const button = screen.getByRole("button", { name: "Pflanze anlegen" });
    expect(button.className).toContain("min-h-[44px]");
    await userEvent.tab();
    expect(document.activeElement).toBe(button);
    await userEvent.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("US-QS-07 · DS-26 the error variant is announced as an alert and still offers an action", () => {
    render(
      <EmptyState
        variant="error"
        title="Laden fehlgeschlagen"
        action={{ label: "Erneut versuchen", onClick: () => undefined }}
      />,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
  });

  it("US-QS-07 · DS-26 an action can be a link", () => {
    render(<EmptyState title="Leer" action={{ label: "Zum Pokédex", href: "/pokedex" }} />);
    expect(screen.getByRole("link", { name: "Zum Pokédex" }).getAttribute("href")).toBe("/pokedex");
  });

  it("US-QS-14 · Greenhouse look: card surface with an icon tile and the next step", () => {
    const { container } = render(<EmptyState title="Leer" action={{ label: "Los", href: "/x" }} />);
    expect((container.firstChild as HTMLElement).className).toContain("rounded-card");
    expect(container.querySelector('[aria-hidden="true"].rounded-tile.bg-accent')).not.toBeNull();
    expect(screen.getByRole("link", { name: "Los" })).toBeTruthy();
  });
});
