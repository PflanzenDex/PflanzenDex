// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import {
  ShortcutProvider,
  useShortcuts,
} from "@/shared/platform/device/keyboard/shortcut-provider/shortcut-provider";
import { ShortcutHelpButton, ShortcutOverview } from "./shortcut-overview";

afterEach(cleanup);

const TARGETS = {
  search: "/discover",
  today: "/today",
  collection: "/collection",
  species: "/collection?view=species",
  wishlist: "/collection?view=wishlist",
};

/** The overview as the app shell renders it: the rows and the open state come from the provider. */
function Overview() {
  const s = useShortcuts();
  return (
    <ShortcutOverview
      open={s.overviewOpen}
      onOpenChange={s.setOverviewOpen}
      rows={s.rows}
      off={s.mode === undefined || s.mode === "disabled"}
    />
  );
}

describe("US-QS-11 · the help entry opens the overview of the shortcuts", () => {
  it("US-QS-11 the help button names the key of the overview and opens the overview that lists the keys", async () => {
    render(
      <MemoryRouter>
        <ShortcutProvider mode="plain" targets={TARGETS}>
          <ShortcutHelpButton />
          <Overview />
        </ShortcutProvider>
      </MemoryRouter>,
    );
    const button = screen.getByRole("button", { name: "Tastenkürzel anzeigen" });
    expect(button.getAttribute("aria-keyshortcuts")).toBe("?");
    await userEvent.click(button);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Heute öffnen")).toBeTruthy();
    expect(within(dialog).getByText("h")).toBeTruthy();
  });
});
