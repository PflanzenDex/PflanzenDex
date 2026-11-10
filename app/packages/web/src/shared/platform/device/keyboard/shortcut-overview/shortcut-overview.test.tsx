// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
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

/** The overview as the app shell renders it: the rows, the open state and the opener come from the provider. */
function Overview() {
  const s = useShortcuts();
  return (
    <ShortcutOverview
      open={s.overviewOpen}
      onOpenChange={s.setOverviewOpen}
      rows={s.rows}
      off={s.mode === undefined || s.mode === "disabled"}
      returnFocusTo={s.overviewOpener}
    />
  );
}

/** A view with its heading in the main region, as the app shell renders it; the help entry is optional. */
function Screen(props: { help?: boolean }) {
  return (
    <MemoryRouter>
      <ShortcutProvider mode="plain" targets={TARGETS}>
        <main id="inhalt" tabIndex={-1}>
          <h1>Heute</h1>
          {props.help ? <ShortcutHelpButton /> : null}
        </main>
        <Overview />
      </ShortcutProvider>
    </MemoryRouter>
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

describe("US-QS-08 · DS-40 the overview gives the focus back to what opened it", () => {
  it.each([
    ["dialog", 1024],
    ["sheet", 360],
  ])(
    "US-QS-08 · DS-40 opened from its button, Escape returns the focus to the button (as a %s)",
    async (_kind, width) => {
      setViewportWidth(width);
      render(<Screen help />);
      const help = screen.getByRole("button", { name: "Tastenkürzel anzeigen" });
      await userEvent.click(help);
      await screen.findByRole("dialog");
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(help));
    },
  );

  it.each([
    ["dialog", 1024],
    ["sheet", 360],
  ])(
    "US-QS-08 · DS-40 opened with ?, Escape moves the focus to the heading of the view, not to body (as a %s)",
    async (_kind, width) => {
      setViewportWidth(width);
      render(<Screen />);
      fireEvent.keyDown(document.body, { key: "?", code: "Slash", shiftKey: true });
      await screen.findByRole("dialog");
      await userEvent.keyboard("{Escape}");
      const heading = screen.getByRole("heading", { level: 1, name: "Heute" });
      await waitFor(() => expect(document.activeElement).toBe(heading));
      expect(document.activeElement).not.toBe(document.body);
    },
  );

  it.each([
    ["dialog", 1024],
    ["sheet", 360],
  ])(
    "US-QS-08 · DS-40 when the button that opened the overview has left the page, Escape moves the focus to the heading of the view (as a %s)",
    async (_kind, width) => {
      setViewportWidth(width);
      const { rerender } = render(<Screen help />);
      await userEvent.click(screen.getByRole("button", { name: "Tastenkürzel anzeigen" }));
      await screen.findByRole("dialog");
      rerender(<Screen />);
      await userEvent.keyboard("{Escape}");
      const heading = screen.getByRole("heading", { level: 1, name: "Heute" });
      await waitFor(() => expect(document.activeElement).toBe(heading));
    },
  );
});
