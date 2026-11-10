// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { FullView } from "./full-view";

/** Renders inside a router, because the back control of a page is a link to its address. */
const inRouter = (ui: ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

afterEach(cleanup);

describe("US-QS-14 · US-QS-15 FullView, the frame of a sub-page", () => {
  it("US-QS-14 names its region by the one h1 and shows its content below the header", () => {
    inRouter(
      <FullView title="Tauschbörse" back={{ label: "Zurück zu Freunde", to: "/friends" }}>
        <p>Meine Angebote</p>
      </FullView>,
    );
    const region = screen.getByRole("region", { name: "Tauschbörse" });
    expect(region.querySelectorAll("h1")).toHaveLength(1);
    expect(region.textContent).toContain("Meine Angebote");
    expect(screen.getByRole("link", { name: "Zurück zu Freunde" })).toBeTruthy();
  });

  it("US-QS-14 puts no card around the h1 (the title is not inside a bordered surface)", () => {
    inRouter(
      <FullView title="Prüfliste">
        <p>Offene Fälle</p>
      </FullView>,
    );
    const heading = screen.getByRole("heading", { level: 1, name: "Prüfliste" });
    expect(heading.closest(".bg-card")).toBeNull();
    expect(heading.closest(".border")).toBeNull();
  });

  it("US-QS-15 keeps the header on the first frame, while its content is still loading", () => {
    inRouter(
      <FullView
        title="Passende Angebote"
        back={{ label: "Zurück zur Tauschbörse", to: "/friends/exchange" }}
      >
        <p role="status">Angebote werden geladen …</p>
      </FullView>,
    );
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Zurück zur Tauschbörse" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Angebote werden geladen …");
  });
});
