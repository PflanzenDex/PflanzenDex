// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Species } from "@pflanzendex/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  expectTitleInBar,
  renderInTopBar,
} from "@/shared/patterns/navigation/page-header/app-bar-slot/app-bar-slot.test-helpers";
import { CreateForm } from "./create-form";

afterEach(cleanup);

const species = { id: "a1", latinName: "Dracaena trifasciata", germanName: "Bogenhanf" } as Species;

describe("US-QS-32 · SG-HEAD-01 Pflanze anlegen puts its title into the top bar", () => {
  it("US-QS-32 below md the title is the one h1 in the bar, the way back is named, and the species is the subject line", async () => {
    const onCancel = vi.fn();
    renderInTopBar(
      <CreateForm
        species={species}
        siblings={[]}
        locations={[]}
        zones={{ items: [], failed: false }}
        onSend={async () => null}
        onCancel={onCancel}
      />,
    );
    expectTitleInBar("Pflanze anlegen", "Zurück zur Art");
    // The species line stays in the content, 16 px semibold (SG-HEAD-01).
    const subject = screen.getByText(/^Art:/, { selector: "p" });
    expect(subject.className).toContain("text-base");
    expect(subject.textContent).toBe("Art: Dracaena trifasciata (Bogenhanf)");
    expect(document.querySelector("[data-app-bar-slot]")?.contains(subject)).toBe(false);
    // The footer keeps its own "Zurück zur Art" until the form actions move into the bar (FX-36); the chevron is the bar's.
    const bar = document.querySelector<HTMLElement>("[data-app-bar-slot]") as HTMLElement;
    await userEvent.click(within(bar).getByRole("button", { name: "Zurück zur Art" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
