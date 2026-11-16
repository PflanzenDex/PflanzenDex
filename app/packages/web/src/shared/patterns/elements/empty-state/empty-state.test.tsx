// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Bell } from "lucide-react";
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

  it("US-QS-32 · SG-BTN-01 the error state's next step is a tinted button, not an outline one", () => {
    render(
      <EmptyState
        variant="error"
        title="Laden fehlgeschlagen"
        action={{ label: "Erneut versuchen", onClick: () => undefined }}
      />,
    );
    const classes = screen.getByRole("button", { name: "Erneut versuchen" }).className.split(/\s+/);
    expect(classes).toContain("bg-accent");
    expect(classes.some((c) => /^border(-|$)/.test(c))).toBe(false);
  });

  it("US-QS-21 compact drops the icon tile and keeps the title and the next step (issue 1343)", () => {
    const { container } = render(
      <EmptyState compact title="Leer" action={{ label: "Weiter", href: "/x" }} />,
    );
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(screen.getByRole("heading", { name: "Leer" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Weiter" })).toBeTruthy();
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

  it("US-QS-32 · SG-ICON-01 the empty mark is a lucide Sprout by default, decorative and hidden", () => {
    const { container } = render(<EmptyState title="Leer" />);
    const svg = container.querySelector("svg.lucide-sprout");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(container.textContent).not.toContain("🌱");
  });

  it("US-QS-32 · SG-ICON-01 an empty state draws the icon its caller passes", () => {
    const { container } = render(<EmptyState title="Leer" icon={Bell} />);
    expect(container.querySelector("svg.lucide-bell")).not.toBeNull();
    expect(container.querySelector("svg.lucide-sprout")).toBeNull();
  });

  it("US-QS-32 · SG-STATE-03 the error draws its own red circle mark on a neutral tile, never the green accent tile", () => {
    const { container } = render(
      <EmptyState
        variant="error"
        title="Laden fehlgeschlagen"
        action={{ label: "Erneut versuchen", onClick: () => undefined }}
      />,
    );
    const mark = container.querySelector("svg.lucide-circle-alert");
    expect(mark).not.toBeNull();
    expect(mark?.getAttribute("aria-hidden")).toBe("true");
    expect(mark?.getAttribute("class")).toContain("text-destructive");
    const tile = mark?.parentElement;
    expect(tile?.className).toContain("bg-muted");
    expect(tile?.className).not.toContain("bg-accent");
    expect(container.querySelector("svg.lucide-sprout")).toBeNull();
  });

  it("US-QS-32 · SG-ICON-01 no exclamation mark and no emoji stand in for an icon", () => {
    const { container } = render(
      <EmptyState
        variant="error"
        title="Laden fehlgeschlagen"
        action={{ label: "Erneut versuchen", onClick: () => undefined }}
      />,
    );
    expect(container.textContent).not.toContain("!");
    expect(container.textContent).not.toContain("🌱");
    const empty = render(<EmptyState title="Leer" />);
    expect(empty.container.textContent).not.toContain("🌱");
  });
});
