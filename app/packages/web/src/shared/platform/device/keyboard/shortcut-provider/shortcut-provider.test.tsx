// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { ShortcutOverview } from "../shortcut-overview/shortcut-overview";
import { ShortcutProvider, useShortcuts, type ShortcutTargets } from "./shortcut-provider";

const TARGETS: ShortcutTargets = {
  search: "/discover?view=catalog",
  today: "/today",
  collection: "/collection",
  species: "/collection?view=species",
  wishlist: "/collection?view=wishlist",
};

type Mode = "plain" | "modifier" | "disabled";

function Probe() {
  const at = useLocation();
  return <output data-testid="location">{at.pathname + at.search}</output>;
}

/** The help entry of the tests: it opens the overview the way "Was die App kann" does. */
function HelpButton() {
  const s = useShortcuts();
  return (
    <button type="button" onClick={() => s.openOverview()}>
      Hilfe
    </button>
  );
}

/** The overview as the app shell renders it: the rows, the open state and the opener come from the provider. */
function OverviewHost() {
  const s = useShortcuts();
  return (
    <ShortcutOverview
      open={s.overviewOpen}
      onOpenChange={s.setOverviewOpen}
      rows={s.rows}
      off={s.mode === "disabled" || s.mode === undefined}
      returnFocusTo={s.overviewOpener}
    />
  );
}

function Harness(props: { mode: Mode | undefined; path?: string }) {
  return (
    <MemoryRouter initialEntries={[props.path ?? "/today"]}>
      <ShortcutProvider mode={props.mode} targets={TARGETS}>
        <Probe />
        <Routes>
          <Route
            path="/today"
            element={
              <main>
                <HelpButton />
              </main>
            }
          />
          <Route
            path="/discover"
            element={
              <main>
                <input type="search" aria-label="Katalog durchsuchen" />
                <input type="text" aria-label="Notiz" />
                <textarea aria-label="Freitext" />
                <select aria-label="Wahl">
                  <option>eins</option>
                </select>
                <div aria-label="Bearbeiten" contentEditable suppressContentEditableWarning>
                  text
                </div>
              </main>
            }
          />
          <Route
            path="*"
            element={
              <main>
                <p>andere Seite</p>
              </main>
            }
          />
        </Routes>
        <OverviewHost />
      </ShortcutProvider>
    </MemoryRouter>
  );
}

const location = () => screen.getByTestId("location").textContent;
const press = (target: Element | Document | Window, init: KeyboardEventInit) =>
  fireEvent.keyDown(target, init);

afterEach(() => cleanup());

describe("US-QS-11 · the overview on ?", () => {
  it("US-QS-11 ? opens the overview that lists the global shortcuts with their keys", async () => {
    render(<Harness mode="plain" />);
    press(document.body, { key: "?", code: "Slash", shiftKey: true });
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Tastenkürzel")).toBeTruthy();
    for (const label of [
      "Tastenkürzel anzeigen",
      "Suche öffnen",
      "Heute öffnen",
      "Sammlung öffnen",
      "Pokédex öffnen",
      "Wunschliste öffnen",
    ])
      expect(within(dialog).getByText(label), label).toBeTruthy();
    for (const key of ["?", "/", "h", "s", "p", "w"])
      expect(within(dialog).getAllByText(key).length, key).toBeGreaterThan(0);
  });

  it("US-QS-11 the overview is also opened from the help entry, and Escape closes it and returns the focus", async () => {
    render(<Harness mode="plain" />);
    const help = screen.getByRole("button", { name: "Hilfe" });
    await userEvent.click(help);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(help));
  });

  it("US-QS-11 with the overview open, the shortcuts do not navigate behind it", async () => {
    render(<Harness mode="plain" />);
    press(document.body, { key: "?", code: "Slash", shiftKey: true });
    await screen.findByRole("dialog");
    press(document.body, { key: "s", code: "KeyS" });
    expect(location()).toBe("/today");
  });

  it("US-QS-11 the overview says that the shortcuts are off when the mode is off", async () => {
    render(<Harness mode="disabled" />);
    press(document.body, { key: "?", code: "Slash", shiftKey: true });
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Hilfe" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Tastenkürzel sind ausgeschaltet/)).toBeTruthy();
  });
});

describe("US-QS-11 · the global shortcuts navigate", () => {
  it.each([
    ["h", "KeyH", "/today"],
    ["s", "KeyS", "/collection"],
    ["p", "KeyP", "/collection?view=species"],
    ["w", "KeyW", "/collection?view=wishlist"],
  ])("US-QS-11 the key %s goes to %s", async (key, code, to) => {
    render(<Harness mode="plain" path="/other" />);
    press(document.body, { key, code });
    await waitFor(() => expect(location()).toBe(to));
  });

  it("US-QS-11 / opens the catalog and puts the focus into its search field when this view has none", async () => {
    render(<Harness mode="plain" path="/other" />);
    press(document.body, { key: "/", code: "Slash" });
    await waitFor(() => expect(location()).toBe("/discover?view=catalog"));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("searchbox", { name: "Katalog durchsuchen" }),
      ),
    );
  });

  it("US-QS-11 / focuses the search field of the view when the view has one", async () => {
    render(<Harness mode="plain" path="/discover" />);
    press(document.body, { key: "/", code: "Slash" });
    expect(location()).toBe("/discover");
    expect(document.activeElement).toBe(
      screen.getByRole("searchbox", { name: "Katalog durchsuchen" }),
    );
  });
});

describe("US-QS-11 · no shortcut in a text field (WCAG 2.1.4)", () => {
  it.each([
    ["a text field", "Notiz"],
    ["a search field", "Katalog durchsuchen"],
    ["a text area", "Freitext"],
    ["a select", "Wahl"],
    ["an editable area", "Bearbeiten"],
  ])("US-QS-11 h does not fire while the focus is in %s", async (_, name) => {
    render(<Harness mode="plain" path="/discover" />);
    const field = screen.getByLabelText(name);
    field.focus();
    press(field, { key: "h", code: "KeyH" });
    press(field, { key: "?", code: "Slash", shiftKey: true });
    expect(location()).toBe("/discover");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("US-QS-11 · the mode of the account", () => {
  it("US-QS-11 the mode off takes no key: no navigation and no overview", async () => {
    render(<Harness mode="disabled" />);
    press(document.body, { key: "h", code: "KeyH" });
    press(document.body, { key: "?", code: "Slash", shiftKey: true });
    expect(location()).toBe("/today");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("US-QS-11 while the mode is not known yet (undefined) no shortcut fires", () => {
    render(<Harness mode={undefined} />);
    press(document.body, { key: "h", code: "KeyH" });
    expect(location()).toBe("/today");
  });

  it("US-QS-11 the modifier mode takes Alt+Shift+H, and a plain h does nothing", async () => {
    render(<Harness mode="modifier" path="/other" />);
    press(document.body, { key: "h", code: "KeyH" });
    expect(location()).toBe("/other");
    press(document.body, { key: "H", code: "KeyH", altKey: true, shiftKey: true });
    await waitFor(() => expect(location()).toBe("/today"));
  });

  it("US-QS-11 a changed mode applies at once, without a reload", async () => {
    const { rerender } = render(<Harness mode="plain" path="/other" />);
    rerender(<Harness mode="disabled" path="/other" />);
    press(document.body, { key: "s", code: "KeyS" });
    expect(location()).toBe("/other");
  });
});

describe("US-QS-11 · the hint of a control shows its key", () => {
  it("US-QS-11 the hint is the key in the plain mode and Alt+Shift with the key in the modifier mode", () => {
    function Hints() {
      const s = useShortcuts();
      return (
        <>
          <span data-testid="plain">{JSON.stringify(s.hint("today"))}</span>
          <span data-testid="off">{JSON.stringify(s.hint("search"))}</span>
        </>
      );
    }
    const { unmount } = render(
      <MemoryRouter>
        <ShortcutProvider mode="plain" targets={TARGETS}>
          <Hints />
        </ShortcutProvider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("plain").textContent).toBe(
      JSON.stringify({ visible: "h", aria: "h" }),
    );
    expect(screen.getByTestId("off").textContent).toBe(JSON.stringify({ visible: "/", aria: "/" }));
    unmount();
    render(
      <MemoryRouter>
        <ShortcutProvider mode="modifier" targets={TARGETS}>
          <Hints />
        </ShortcutProvider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("plain").textContent).toBe(
      JSON.stringify({ visible: "Alt+Umschalt+H", aria: "Alt+Shift+H" }),
    );
  });

  it("US-QS-11 no hint is shown when the mode is off", () => {
    function Hint() {
      const s = useShortcuts();
      return <span data-testid="hint">{JSON.stringify(s.hint("today") ?? null)}</span>;
    }
    render(
      <MemoryRouter>
        <ShortcutProvider mode="disabled" targets={TARGETS}>
          <Hint />
        </ShortcutProvider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("hint").textContent).toBe("null");
  });
});
