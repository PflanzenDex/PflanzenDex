// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OverlayNotice } from "./overlay-notice";

afterEach(cleanup);

describe("US-QS-07 · the overlay notice never takes part in the page's flow (DS-54)", () => {
  it("US-QS-07 · it is fixed above the bottom bar, lets pointer input through and shows its text", () => {
    render(
      <main>
        <OverlayNotice variant="warning" title="Du bist offline">
          Angezeigte Daten können veraltet sein.
        </OverlayNotice>
      </main>,
    );
    const title = screen.getByText("Du bist offline");
    const overlay = title.closest<HTMLElement>(".fixed");
    expect(overlay).not.toBeNull();
    expect(overlay?.className).toContain("pointer-events-none");
    expect(overlay?.className).toContain("var(--bar-clearance,env(safe-area-inset-bottom))");
    expect(screen.getByText("Angezeigte Daten können veraltet sein.")).toBeTruthy();
  });
});
