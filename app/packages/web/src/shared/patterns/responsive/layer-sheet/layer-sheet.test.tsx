// @vitest-environment jsdom
import { StrictMode, useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  BrowserRouter,
  MemoryRouter,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { endSheetExit, holdSheetExit, releaseSheetExits } from "@/shared/testing/sheet-exit";
import { AnnouncerProvider } from "@/shared/platform/announcer/announcer";
import { RouteFocus } from "@/shared/platform/routing/route-focus/route-focus";
import { LayerHost, LayerOpener, LayerSheet, useLayer, useUnsavedInput } from "./layer-sheet";
import { useExitValue } from "./use-layer";
import { GatedRouter, hold, releaseHold, resetHold } from "./layer-sheet.test-helpers";

beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
});

afterEach(cleanup);
afterEach(resetHold);
afterEach(releaseSheetExits);

function Back() {
  const navigate = useNavigate();
  return <button onClick={() => void navigate(-1)}>Browser zurück</button>;
}

function Example({ at = "/" }: { at?: string }) {
  return (
    <MemoryRouter initialEntries={["/start", at]} initialIndex={at === "/" ? 0 : 1}>
      <LayerHost>
        <LayerOpener id="licht">Licht</LayerOpener>
        <LayerSheet id="licht" title="Lichtzonen" primaryAction={<button>Sichern</button>}>
          <p>Inhalt</p>
        </LayerSheet>
      </LayerHost>
      <Back />
    </MemoryRouter>
  );
}

/** The page as the app marks it: RouteFocus sets `data-input` on every click and key press (US-QS-15, issue 1714). */
function TitleSheet() {
  return (
    <AnnouncerProvider>
      <MemoryRouter initialEntries={["/"]}>
        <main id="inhalt" tabIndex={-1}>
          <RouteFocus titleOf={() => "Start"} />
          <h1>Start</h1>
          <LayerOpener id="licht">Licht</LayerOpener>
          <LayerSheet id="licht" title="Lichtzonen">
            <p>Inhalt</p>
          </LayerSheet>
        </main>
      </MemoryRouter>
    </AnnouncerProvider>
  );
}

/** The focus ring classes that do not wait for keyboard input: a pointer user must get none (US-QS-15, issue 1714). */
function ungatedRing(className: string): string[] {
  return className
    .split(/\s+/)
    .filter((name) => name.includes("ring") && !name.startsWith("keyboard-input:"));
}

/** A layer that is mounted only while the address names it, as the care profile of a plant is (US-QS-15, issue 1661). */
function MountedOnlyLayer() {
  const [params] = useSearchParams();
  if (params.get("sheet") !== "karte") return null;
  return (
    <LayerSheet id="karte" title="Karte">
      <p>Inhalt</p>
    </LayerSheet>
  );
}

function PageButton() {
  const [, setParams] = useSearchParams();
  return (
    <button type="button" onClick={() => setParams({ page: "2" })}>
      Seite 2
    </button>
  );
}

describe("LayerSheet (US-QS-15)", () => {
  it("US-QS-15 with RouteFocus mounted, Escape returns the focus to the opener and a page change does not move it to the heading", async () => {
    setViewportWidth(360);
    render(
      <AnnouncerProvider>
        <MemoryRouter initialEntries={["/"]}>
          <main id="inhalt" tabIndex={-1}>
            <RouteFocus titleOf={() => "Start"} />
            <h1>Start</h1>
            <LayerOpener id="licht">Licht</LayerOpener>
            <PageButton />
            <LayerSheet id="licht" title="Lichtzonen">
              <p>Inhalt</p>
            </LayerSheet>
          </main>
        </MemoryRouter>
      </AnnouncerProvider>,
    );
    const opener = screen.getByRole("button", { name: "Licht" });
    await userEvent.click(opener);
    await screen.findByRole("dialog", { name: "Lichtzonen" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await new Promise((r) => setTimeout(r, 400));
    expect(document.activeElement).toBe(opener);
    const control = screen.getByRole("button", { name: "Seite 2" });
    await userEvent.click(control);
    await new Promise((r) => setTimeout(r, 400));
    expect(document.activeElement).toBe(control);
  });

  it("US-QS-22 a closed layer mounts no content, so it loads nothing and holds no list", () => {
    setViewportWidth(360);
    render(<Example />);
    expect(screen.queryByText("Inhalt")).toBeNull();
  });

  it("US-QS-15 · F7 a sheet leaves as it came: its body stays while it slides out, then it is removed", async () => {
    setViewportWidth(360);
    holdSheetExit();
    render(<Example at="/?sheet=licht" />);
    await screen.findByRole("dialog", { name: "Lichtzonen" });
    await userEvent.keyboard("{Escape}");
    // The sheet collapses to its title only when its body leaves at once (F7); the body goes with the exit.
    expect(screen.getByText("Inhalt")).toBeTruthy();
    endSheetExit();
    await waitFor(() => expect(screen.queryByText("Inhalt")).toBeNull());
    expect(document.querySelector("[data-layer-body]")).toBeNull();
  });

  it("US-QS-15 · F7 a sheet that closes by Back keeps its body for the exit too", async () => {
    setViewportWidth(360);
    holdSheetExit();
    render(<Example at="/?sheet=licht" />);
    await screen.findByRole("dialog", { name: "Lichtzonen" });
    fireEvent.click(screen.getByText("Browser zurück"));
    await waitFor(() => expect(screen.getByText("Inhalt")).toBeTruthy());
    endSheetExit();
    await waitFor(() => expect(screen.queryByText("Inhalt")).toBeNull());
  });

  it("US-QS-15 the last value of a layer stays while the address no longer names it, so its exit has content", () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string | null }) => useExitValue(value),
      { initialProps: { value: null as string | null } },
    );
    expect(result.current).toBeUndefined();
    rerender({ value: "plant-e1" });
    expect(result.current).toBe("plant-e1");
    rerender({ value: null });
    expect(result.current).toBe("plant-e1");
    rerender({ value: "plant-e2" });
    expect(result.current).toBe("plant-e2");
  });

  it("US-QS-15 an address with ?sheet= opens the layer after reload or copied link", async () => {
    setViewportWidth(360);
    render(<Example at="/?sheet=licht" />);
    expect(await screen.findByRole("dialog", { name: "Lichtzonen" })).toBeTruthy();
    expect(screen.getByText("Inhalt")).toBeTruthy();
  });

  it("US-QS-15 the opener opens it, Back closes it and focus returns to the opener", async () => {
    setViewportWidth(360);
    render(<Example />);
    const opener = screen.getByRole("button", { name: "Licht" });
    await userEvent.click(opener);
    await screen.findByRole("dialog", { name: "Lichtzonen" });
    // The modal hides the page from assistive technology, so the browser Back is reached with `hidden`.
    fireEvent.click(screen.getByText("Browser zurück"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  // The app runs under StrictMode, which mounts and unmounts each effect once more: the layer keeps the focus while open.
  const mountedOnlyEscape = async (width: number, role: "dialog" | "complementary") => {
    setViewportWidth(width);
    render(
      <StrictMode>
        <MemoryRouter initialEntries={["/start", "/"]} initialIndex={1}>
          <LayerOpener id="karte">Karte</LayerOpener>
          <MountedOnlyLayer />
          <Back />
        </MemoryRouter>
      </StrictMode>,
    );
    const opener = screen.getByRole("button", { name: "Karte" });
    await userEvent.click(opener);
    const layer = await screen.findByRole(role, { name: "Karte" });
    await waitFor(() => expect(layer.contains(document.activeElement)).toBe(true));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(layer.isConnected).toBe(false));
    await waitFor(() => expect(document.activeElement).toBe(opener));
  };

  it("US-QS-15 a layer mounted only while its address names it returns the focus to its opener, as a sheet (issue 1661)", async () => {
    await mountedOnlyEscape(360, "dialog");
  });

  it("US-QS-15 a layer mounted only while its address names it returns the focus to its opener, as a pane (issue 1661)", async () => {
    await mountedOnlyEscape(1100, "complementary");
  });

  it("US-QS-15 Escape closes the layer", async () => {
    setViewportWidth(768);
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "Licht" }));
    await screen.findByRole("dialog", { name: "Lichtzonen" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("US-QS-15 from 1024 px it is a pane with a heading that takes the focus, Escape closes it", async () => {
    setViewportWidth(1024);
    render(<Example />);
    const opener = screen.getByRole("button", { name: "Licht" });
    await userEvent.click(opener);
    const pane = screen.getByRole("complementary", { name: "Lichtzonen" });
    expect(pane).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Lichtzonen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("US-QS-15 the pane has a close button and shows the one primary action", async () => {
    setViewportWidth(1280);
    render(<Example at="/?sheet=licht" />);
    expect(screen.getByRole("button", { name: "Sichern" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("US-QS-15 below 768 px it is a sheet, from 768 px a dialog", async () => {
    setViewportWidth(360);
    render(<Example at="/?sheet=licht" />);
    const sheet = await screen.findByRole("dialog", { name: "Lichtzonen" });
    expect(sheet.className).toContain("inset-x-0");
    act(() => setViewportWidth(800));
    expect(screen.getByRole("dialog", { name: "Lichtzonen" }).className).toContain(
      "-translate-x-1/2",
    );
  });

  it("US-QS-15 a layer holds no list that pages by a free height: sheet, dialog and pane keep no class for it, and a list in any of them is scroll content", async () => {
    setViewportWidth(360);
    render(<Example at="/?sheet=licht" />);
    const sheet = await screen.findByRole("dialog", { name: "Lichtzonen" });
    expect(sheet.className).not.toContain("page-fit");
    expect(sheet.querySelector("[data-page-fit]")).toBeNull();
    act(() => setViewportWidth(800));
    expect(screen.getByRole("dialog", { name: "Lichtzonen" }).className).not.toContain("page-fit");
    act(() => setViewportWidth(1280));
    const pane = screen.getByRole("complementary", { name: "Lichtzonen" });
    expect(pane.className).not.toContain("page-fit");
    // The pane is a layer too: what it holds is in the layer scope, so a list there does not page.
    expect(pane.querySelector("[data-layer-body] > [data-scroll-region]")).not.toBeNull();
  });

  it("US-QS-15 from 1024 px the pane takes the frame's second column, beside the content and top-aligned with it", () => {
    setViewportWidth(1440);
    const warn = vi.spyOn(console, "warn");
    render(<Example at="/?sheet=licht" />);
    const pane = screen.getByRole("complementary", { name: "Lichtzonen" });
    expect(pane.hasAttribute("data-layer-pane")).toBe(true);
    // A layer inside a frame never triggers the dev warning, so a regression fails here (US-QS-15).
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    const slot = pane.parentElement;
    const frame = slot?.parentElement;
    expect(frame).toBeTruthy();
    // The frame's first child is the content column (the opener sits in it), the slot is the second one.
    expect(frame?.firstElementChild?.contains(screen.getByRole("button", { name: "Licht" }))).toBe(
      true,
    );
    expect(slot?.previousElementSibling).toBe(frame?.firstElementChild);
  });

  it("US-QS-15 · US-QS-18 the content column is at most 720 px and centred, so the pane beside it takes the rest of the frame", () => {
    setViewportWidth(1440);
    render(<Example at="/?sheet=licht" />);
    const pane = screen.getByRole("complementary", { name: "Lichtzonen" });
    const content = pane.parentElement?.previousElementSibling as HTMLElement;
    expect(content.contains(screen.getByRole("button", { name: "Licht" }))).toBe(true);
    // The cap is the content's own (DS-59): a pane never shrinks the frame below the content (US-QS-15, #1027).
    expect(content.className).toContain("max-w-180");
    expect(content.className).toContain("mx-auto");
    // The column takes the frame's width: a centred box without it shrinks to its widest content (issue 1019).
    expect(content.className).toContain("w-full");
  });

  it("US-QS-15 a layer in a component deep inside the frame still opens in the frame's pane, not in its own place", () => {
    setViewportWidth(1440);
    const warn = vi.spyOn(console, "warn");
    function Deep() {
      return (
        <section>
          <div>
            <p>Tiefe Liste</p>
            <LayerSheet id="licht" title="Lichtzonen">
              <p>Inhalt</p>
            </LayerSheet>
          </div>
        </section>
      );
    }
    render(
      <MemoryRouter initialEntries={["/?sheet=licht"]}>
        <LayerHost>
          <Deep />
        </LayerHost>
      </MemoryRouter>,
    );
    const pane = screen.getByRole("complementary", { name: "Lichtzonen" });
    const frame = pane.parentElement?.parentElement;
    expect(frame?.firstElementChild?.contains(screen.getByText("Tiefe Liste"))).toBe(true);
    expect(frame?.lastElementChild).toBe(pane.parentElement);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("US-QS-15: a layer opens with focus on its title, not on a destructive control", async () => {
    // The first control of the layer is destructive, as "Freundschaft beenden" is in "Meine Freunde" (issue 1028).
    for (const width of [360, 800, 1440]) {
      setViewportWidth(width);
      const { unmount } = render(
        <MemoryRouter initialEntries={["/?sheet=friends"]}>
          <LayerHost>
            <LayerSheet id="friends" title="Meine Freunde">
              <button type="button">Freundschaft beenden</button>
            </LayerSheet>
          </LayerHost>
        </MemoryRouter>,
      );
      const title = await screen.findByRole("heading", { name: "Meine Freunde" });
      await waitFor(() => expect(document.activeElement).toBe(title));
      expect(document.activeElement).not.toBe(
        screen.getByRole("button", { name: "Freundschaft beenden" }),
      );
      unmount();
    }
  });

  it("US-QS-15 · DS-37 issue 1714 a sheet title that takes the focus by script shows the focus ring after keyboard input", async () => {
    setViewportWidth(360);
    render(<TitleSheet />);
    screen.getByRole("button", { name: "Licht" }).focus();
    await userEvent.keyboard("{Enter}");
    const title = await screen.findByRole("heading", { name: "Lichtzonen" });
    await waitFor(() => expect(document.activeElement).toBe(title));
    expect(document.documentElement.getAttribute("data-input")).toBe("keyboard");
    expect(title.className).toContain("keyboard-input:focus-visible:ring-2");
    expect(title.className).toContain("keyboard-input:focus-visible:ring-ring");
    expect(title.className).toContain("focus-visible:outline-none");
  });

  it("US-QS-15 · DS-37 issue 1714 a sheet title that takes the focus after a click draws no ring: every ring class waits for keyboard input", async () => {
    setViewportWidth(360);
    render(<TitleSheet />);
    await userEvent.click(screen.getByRole("button", { name: "Licht" }));
    const title = await screen.findByRole("heading", { name: "Lichtzonen" });
    await waitFor(() => expect(document.activeElement).toBe(title));
    expect(document.documentElement.getAttribute("data-input")).toBe("pointer");
    expect(ungatedRing(title.className)).toEqual([]);
  });

  it("US-QS-15: a layer that starts with a text field keeps the focus in it, also in the desktop pane", async () => {
    // Owner decision of 31.10. (issue 1104): the wish form starts in its species search on every width.
    for (const width of [360, 800, 1440]) {
      setViewportWidth(width);
      const { unmount } = render(
        <MemoryRouter initialEntries={["/?sheet=new-wish"]}>
          <LayerHost>
            <LayerSheet id="new-wish" title="Neuer Wunsch">
              <label>
                Art suchen
                <input type="search" />
              </label>
              <button type="button">Wunsch sichern</button>
            </LayerSheet>
          </LayerHost>
        </MemoryRouter>,
      );
      const field = await screen.findByLabelText("Art suchen");
      await waitFor(() => expect(document.activeElement).toBe(field));
      unmount();
    }
  });

  it("US-QS-15 a LayerSheet outside a LayerHost warns in dev when it opens beside the content", () => {
    setViewportWidth(1440);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      render(
        <MemoryRouter initialEntries={["/?sheet=licht"]}>
          <LayerSheet id="licht" title="Lichtzonen">
            <p>Inhalt</p>
          </LayerSheet>
        </MemoryRouter>,
      );
      expect(screen.getByRole("complementary", { name: "Lichtzonen" })).toBeTruthy();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('"licht" renders outside a LayerHost'),
      );
    } finally {
      warn.mockRestore();
    }
  });
});

/** The address and history of the last render of a `Probe`, so a test reads where Back and a close have led (US-QS-32). */
let seen: { pathname: string; search: string; state: unknown } = {
  pathname: "",
  search: "",
  state: null,
};
/** The keys of the history entries the probe has seen, in order: a new entry is a new key (US-QS-32). */
let keys: string[] = [];
function Probe() {
  const location = useLocation();
  seen = { pathname: location.pathname, search: location.search, state: location.state };
  if (keys.at(-1) !== location.key) keys = [...keys, location.key];
  return null;
}

/** A form with typed input, as the forms of the layers are (US-QS-32); `save` closes the layer as a saved write does. */
function TypingForm({ save }: { save: boolean }) {
  const [text, setText] = useState("");
  const { closeLayer } = useLayer("notiz");
  useUnsavedInput(text !== "");
  return (
    <>
      <label>
        Text
        <input value={text} onChange={(event) => setText(event.target.value)} />
      </label>
      {save ? (
        <button
          type="button"
          onClick={() => {
            // A saved write closes the layer first and empties the form after it, as the layers of the equipment do.
            closeLayer();
            setText("");
          }}
        >
          Sichern
        </button>
      ) : null}
    </>
  );
}

/** Two Backs in one event: both steps are batched into one render, which lands on the list (US-QS-15). */
function DoubleBack() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => {
        void navigate(-1);
        void navigate(-1);
      }}
    >
      Zweimal zurück
    </button>
  );
}

function Forward() {
  const navigate = useNavigate();
  return <button onClick={() => void navigate(1)}>Browser vor</button>;
}

function TypingLayer({ save = false }: { save?: boolean }) {
  return (
    <>
      <Probe />
      <LayerHost>
        <LayerOpener id="notiz">Notiz</LayerOpener>
        <LayerSheet id="notiz" title="Notiz">
          <TypingForm save={save} />
        </LayerSheet>
      </LayerHost>
      <Back />
      <DoubleBack />
      <Forward />
    </>
  );
}

/** The app at `entries`, the last one (`index`) is where it starts; the opener of the layer is on the last entry. */
function renderTyping(entries: string[], index: number, save = false) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <TypingLayer save={save} />
    </MemoryRouter>,
  );
}

const QUESTION = { name: "Eingabe verwerfen?" };

/** Opens the layer from its opener and types into its field; from 1024 px the layer is a pane, not a dialog. */
async function openAndType(text: string, role: "dialog" | "complementary" = "dialog") {
  await userEvent.click(screen.getByRole("button", { name: "Notiz" }));
  const layer = await screen.findByRole(role, { name: "Notiz" });
  await userEvent.type(within(layer).getByLabelText("Text"), text);
  return layer;
}

describe("US-QS-32 a layer asks before it discards typed input (SG-FORM-06, SG-SHEET-05)", () => {
  it("US-QS-32 Escape with typed input asks; Weiter bearbeiten keeps the input and the layer open", async () => {
    setViewportWidth(360);
    renderTyping(["/start"], 0);
    await openAndType("Basilikum");
    await userEvent.keyboard("{Escape}");
    const question = await screen.findByRole("dialog", QUESTION);
    await userEvent.click(within(question).getByRole("button", { name: "Weiter bearbeiten" }));
    await waitFor(() => expect(screen.queryByRole("dialog", QUESTION)).toBeNull());
    expect(screen.getByRole("dialog", { name: "Notiz" })).toBeTruthy();
    expect((screen.getByLabelText("Text") as HTMLInputElement).value).toBe("Basilikum");
    expect(seen.search).toContain("sheet=notiz");
  });

  it("US-QS-32 Weiter bearbeiten puts the focus back on the field the person typed in, inside the layer", async () => {
    setViewportWidth(360);
    renderTyping(["/start"], 0);
    await openAndType("Basilikum");
    const field = screen.getByLabelText("Text");
    await userEvent.keyboard("{Escape}");
    const question = await screen.findByRole("dialog", QUESTION);
    await userEvent.click(within(question).getByRole("button", { name: "Weiter bearbeiten" }));
    await waitFor(() => expect(document.activeElement).toBe(field));
    expect(screen.getByRole("dialog", { name: "Notiz" }).contains(field)).toBe(true);
  });

  it("US-QS-32 Escape on the question keeps the layer and its input, as Weiter bearbeiten does", async () => {
    setViewportWidth(360);
    renderTyping(["/start"], 0);
    await openAndType("Basilikum");
    await userEvent.keyboard("{Escape}");
    await screen.findByRole("dialog", QUESTION);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", QUESTION)).toBeNull());
    expect((screen.getByLabelText("Text") as HTMLInputElement).value).toBe("Basilikum");
    expect(screen.getByRole("dialog", { name: "Notiz" })).toBeTruthy();
  });

  it("US-QS-32 Verwerfen after Escape closes the layer and its address loses ?sheet", async () => {
    setViewportWidth(360);
    renderTyping(["/start"], 0);
    await openAndType("Basilikum");
    await userEvent.keyboard("{Escape}");
    const question = await screen.findByRole("dialog", QUESTION);
    await userEvent.click(within(question).getByRole("button", { name: "Eingabe verwerfen" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Notiz" })).toBeNull());
    expect(seen.pathname).toBe("/start");
    expect(seen.search).toBe("");
  });

  it("US-QS-32 from 1024 px the pane asks as well: Escape and its close control, Weiter bearbeiten keeps the pane", async () => {
    setViewportWidth(1280);
    renderTyping(["/start"], 0);
    const pane = await openAndType("Basilikum", "complementary");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(
      within(await screen.findByRole("dialog", QUESTION)).getByRole("button", {
        name: "Weiter bearbeiten",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog", QUESTION)).toBeNull());
    await userEvent.click(within(pane).getByRole("button", { name: "Schließen" }));
    const question = await screen.findByRole("dialog", QUESTION);
    // While the question is open, the layer behind it is hidden from assistive technology, but it is still there.
    expect(screen.getByRole("complementary", { name: "Notiz", hidden: true })).toBeTruthy();
    await userEvent.click(within(question).getByRole("button", { name: "Eingabe verwerfen" }));
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Notiz" })).toBeNull());
  });

  it("US-QS-32 the close control of a dialog from md asks while input is unsaved", async () => {
    setViewportWidth(800);
    renderTyping(["/start"], 0);
    await openAndType("Basilikum");
    const dialog = screen.getByRole("dialog", { name: "Notiz" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Schließen" }));
    expect(await screen.findByRole("dialog", QUESTION)).toBeTruthy();
    // The question hides the layer from assistive technology; the layer itself stays mounted with its input.
    expect(dialog.isConnected).toBe(true);
    expect(dialog.getAttribute("aria-hidden")).toBe("true");
  });

  it("US-QS-32 Back with typed input asks and keeps the layer; Verwerfen lands on the list and a following Back goes where it went before", async () => {
    setViewportWidth(360);
    renderTyping(["/before", "/start"], 1);
    await openAndType("Basilikum");
    fireEvent.click(screen.getByText("Browser zurück"));
    const question = await screen.findByRole("dialog", QUESTION);
    expect(seen.search).toContain("sheet=notiz");
    await userEvent.click(within(question).getByRole("button", { name: "Eingabe verwerfen" }));
    await waitFor(() => expect(seen.search).toBe(""));
    expect(seen.pathname).toBe("/start");
    expect(screen.queryByRole("dialog", { name: "Notiz" })).toBeNull();
    fireEvent.click(screen.getByText("Browser zurück"));
    await waitFor(() => expect(seen.pathname).toBe("/before"));
  });

  it("US-QS-32 Back with typed input and Weiter bearbeiten keeps the layer; the next Back asks again", async () => {
    setViewportWidth(360);
    renderTyping(["/start"], 0);
    await openAndType("Basilikum");
    fireEvent.click(screen.getByText("Browser zurück"));
    const question = await screen.findByRole("dialog", QUESTION);
    await userEvent.click(within(question).getByRole("button", { name: "Weiter bearbeiten" }));
    await waitFor(() => expect(screen.queryByRole("dialog", QUESTION)).toBeNull());
    expect((screen.getByLabelText("Text") as HTMLInputElement).value).toBe("Basilikum");
    fireEvent.click(screen.getByText("Browser zurück"));
    expect(await screen.findByRole("dialog", QUESTION)).toBeTruthy();
    expect(seen.search).toContain("sheet=notiz");
  });

  it("US-QS-32 the first typed input pushes one guard entry at the same address, keeping the app flag and the focus flag", async () => {
    setViewportWidth(360);
    keys = [];
    renderTyping(["/start"], 0);
    await openAndType("B");
    const entries = keys.length;
    expect(seen.search).toContain("sheet=notiz");
    expect(seen.state).toMatchObject({ layerGuard: true, layerFromApp: true, keepFocus: true });
    // Further typing adds no entry: the guard is pushed once, not with every key.
    await userEvent.type(screen.getByLabelText("Text"), "asilikum");
    expect(keys.length).toBe(entries);
  });

  it("US-QS-32 a clean layer closes at once on Escape and on Back, with no question", async () => {
    setViewportWidth(360);
    renderTyping(["/start"], 0);
    await userEvent.click(screen.getByRole("button", { name: "Notiz" }));
    await screen.findByRole("dialog", { name: "Notiz" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Notiz" })).toBeNull());
    expect(screen.queryByRole("dialog", QUESTION)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Notiz" }));
    await screen.findByRole("dialog", { name: "Notiz" });
    fireEvent.click(screen.getByText("Browser zurück"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Notiz" })).toBeNull());
    expect(screen.queryByRole("dialog", QUESTION)).toBeNull();
    expect(seen.pathname).toBe("/start");
  });

  it("US-QS-32 a saved write closes the layer through closeLayer without the question, and no guard entry remains", async () => {
    setViewportWidth(360);
    renderTyping(["/before", "/start"], 1, true);
    await openAndType("Thymian");
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Notiz" })).toBeNull());
    expect(screen.queryByRole("dialog", QUESTION)).toBeNull();
    expect(seen.search).toBe("");
    expect(seen.pathname).toBe("/start");
    expect(seen.state).not.toMatchObject({ layerGuard: true });
    fireEvent.click(screen.getByText("Browser zurück"));
    await waitFor(() => expect(seen.pathname).toBe("/before"));
  });

  it("US-QS-32 a sheet that is swiped down with typed input asks and slides back to its place", async () => {
    setViewportWidth(360);
    renderTyping(["/start"], 0);
    const layer = await openAndType("Basilikum");
    // The swipe moved the sheet down (Vaul writes its transform inline while the finger drags).
    layer.style.transform = "translate3d(0, 120px, 0)";
    await userEvent.keyboard("{Escape}");
    expect(await screen.findByRole("dialog", QUESTION)).toBeTruthy();
    await waitFor(() => expect(layer.style.transform).toBe("translate3d(0px, 0px, 0px)"));
  });

  it("US-QS-32 · SG-SHEET-02 the close button of a sheet with typed input asks; Weiter bearbeiten keeps the sheet and its input", async () => {
    setViewportWidth(360);
    renderTyping(["/start"], 0);
    const layer = await openAndType("Basilikum");
    await userEvent.click(within(layer).getByRole("button", { name: "Schließen" }));
    const question = await screen.findByRole("dialog", QUESTION);
    await userEvent.click(within(question).getByRole("button", { name: "Weiter bearbeiten" }));
    await waitFor(() => expect(screen.queryByRole("dialog", QUESTION)).toBeNull());
    expect(screen.getByRole("dialog", { name: "Notiz" })).toBeTruthy();
    expect((screen.getByLabelText("Text") as HTMLInputElement).value).toBe("Basilikum");
    expect(seen.search).toContain("sheet=notiz");
  });

  it("US-QS-32 · SG-SHEET-02 the close button, then Verwerfen, closes the sheet and its address loses ?sheet", async () => {
    setViewportWidth(360);
    renderTyping(["/start"], 0);
    const layer = await openAndType("Basilikum");
    await userEvent.click(within(layer).getByRole("button", { name: "Schließen" }));
    const question = await screen.findByRole("dialog", QUESTION);
    await userEvent.click(within(question).getByRole("button", { name: "Eingabe verwerfen" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Notiz" })).toBeNull());
    expect(seen.pathname).toBe("/start");
    expect(seen.search).toBe("");
  });

  it("US-QS-32 · SG-SHEET-07 a sheet opens with the focus on its title, not on its close button, below md", async () => {
    setViewportWidth(360);
    render(
      <MemoryRouter initialEntries={["/?sheet=friends"]}>
        <LayerHost>
          <LayerSheet id="friends" title="Meine Freunde">
            <button type="button">Freundschaft beenden</button>
          </LayerSheet>
        </LayerHost>
      </MemoryRouter>,
    );
    const title = await screen.findByRole("heading", { name: "Meine Freunde" });
    await waitFor(() => expect(document.activeElement).toBe(title));
    expect(document.activeElement).not.toBe(screen.getByRole("button", { name: "Schließen" }));
  });

  it("US-QS-32 outside a layer useUnsavedInput is a no-op: leave runs its action at once", () => {
    let ran = false;
    function Bare() {
      const { leave } = useUnsavedInput(true);
      return <button type="button" onClick={() => leave(() => (ran = true))} />;
    }
    render(<Bare />);
    fireEvent.click(screen.getByRole("button"));
    expect(ran).toBe(true);
    expect(screen.queryByRole("dialog", QUESTION)).toBeNull();
  });
});

/** The app on the browser history of the page: `window.history.back()` moves through its entries as a real Back does. */
function renderOnBrowser(path: string) {
  window.history.replaceState(null, "", path);
  return render(
    <BrowserRouter>
      <TypingLayer />
    </BrowserRouter>,
  );
}

describe("US-QS-15 a second Back keeps the layer and its question; a layer opened by a reload closes to its list", () => {
  it("US-QS-15 two Backs in quick succession with typed input keep the layer open and ask; the address still names it", async () => {
    setViewportWidth(360);
    renderOnBrowser("/start");
    await openAndType("Basilikum");
    window.history.back();
    window.history.back();
    await screen.findByRole("dialog", QUESTION);
    await waitFor(() => expect(seen.state).toMatchObject({ layerGuard: true }));
    expect((screen.getByLabelText("Text") as HTMLInputElement).value).toBe("Basilikum");
    expect(seen.search).toContain("sheet=notiz");
  });

  it("US-QS-15 two Backs in one traversal (history.go(-2) on the browser history) keep the layer open and ask; the address still names it", async () => {
    setViewportWidth(360);
    renderOnBrowser("/start");
    await openAndType("Basilikum");
    // One step over both entries: the page sees the list at once, as when the two Backs arrive before React renders.
    window.history.go(-2);
    await screen.findByRole("dialog", QUESTION);
    await waitFor(() => expect(seen.state).toMatchObject({ layerGuard: true }));
    expect((screen.getByLabelText("Text") as HTMLInputElement).value).toBe("Basilikum");
    expect(seen.search).toContain("sheet=notiz");
  });

  it("US-QS-15 two Backs batched into one render keep the layer open and ask; the address still names it", async () => {
    setViewportWidth(360);
    renderTyping(["/start"], 0);
    await openAndType("Basilikum");
    fireEvent.click(screen.getByText("Zweimal zurück"));
    await screen.findByRole("dialog", QUESTION);
    await waitFor(() => expect(seen.state).toMatchObject({ layerGuard: true }));
    expect((screen.getByLabelText("Text") as HTMLInputElement).value).toBe("Basilikum");
    expect(seen.search).toContain("sheet=notiz");
  });

  it("US-QS-15 a second Back after the question shows lands on the layer and asks again; input and address stay", async () => {
    setViewportWidth(360);
    keys = [];
    renderOnBrowser("/start");
    await openAndType("Basilikum");
    window.history.back();
    await screen.findByRole("dialog", QUESTION);
    await waitFor(() => expect(seen.state).toMatchObject({ layerGuard: true }));
    const before = keys.length;
    window.history.back();
    await waitFor(() => expect(keys.length).toBeGreaterThan(before));
    await waitFor(() => expect(seen.state).toMatchObject({ layerGuard: true }));
    expect(screen.getByRole("dialog", QUESTION)).toBeTruthy();
    expect((screen.getByLabelText("Text") as HTMLInputElement).value).toBe("Basilikum");
    expect(seen.search).toContain("sheet=notiz");
  });

  it("US-QS-15 Verwerfen after two quick Backs walks back to the list and leaves the layer", async () => {
    setViewportWidth(360);
    renderOnBrowser("/start");
    await openAndType("Basilikum");
    window.history.back();
    window.history.back();
    const question = await screen.findByRole("dialog", QUESTION);
    await userEvent.click(within(question).getByRole("button", { name: "Eingabe verwerfen" }));
    await waitFor(() => expect(seen.search).toBe(""));
    expect(seen.pathname).toBe("/start");
    expect(screen.queryByRole("dialog", { name: "Notiz" })).toBeNull();
  });

  it("US-QS-15 Weiter bearbeiten after two quick Backs keeps the input; the focus is in the question while it is open and returns into the layer", async () => {
    setViewportWidth(360);
    renderOnBrowser("/start");
    await openAndType("Basilikum");
    const field = screen.getByLabelText("Text");
    window.history.back();
    window.history.back();
    const question = await screen.findByRole("dialog", QUESTION);
    expect(question.contains(document.activeElement)).toBe(true);
    await userEvent.click(within(question).getByRole("button", { name: "Weiter bearbeiten" }));
    await waitFor(() => expect(screen.queryByRole("dialog", QUESTION)).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(field));
    expect((field as HTMLInputElement).value).toBe("Basilikum");
    expect(screen.getByRole("dialog", { name: "Notiz" }).contains(field)).toBe(true);
    expect(seen.search).toContain("sheet=notiz");
  });

  it("US-QS-15 a layer opened by a reload closes with Back to its list, not to the page before it", async () => {
    setViewportWidth(360);
    renderTyping(["/start", "/?sheet=notiz"], 1);
    await screen.findByRole("dialog", { name: "Notiz" });
    fireEvent.click(screen.getByText("Browser zurück"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Notiz" })).toBeNull());
    expect(seen.pathname).toBe("/");
    expect(seen.search).toBe("");
  });

  it("US-QS-15 a layer opened by a reload with typed input asks on Back, and Verwerfen lands on its list", async () => {
    setViewportWidth(360);
    renderTyping(["/start", "/?sheet=notiz"], 1);
    const layer = await screen.findByRole("dialog", { name: "Notiz" });
    await userEvent.type(within(layer).getByLabelText("Text"), "Basilikum");
    fireEvent.click(screen.getByText("Browser zurück"));
    const question = await screen.findByRole("dialog", QUESTION);
    await userEvent.click(within(question).getByRole("button", { name: "Eingabe verwerfen" }));
    await waitFor(() => expect(seen.search).toBe(""));
    expect(seen.pathname).toBe("/");
  });

  it("US-QS-15 a layer opened by a reload: a saved close lands on the list, and Forward reaches the layer's own entry, not a guard entry", async () => {
    setViewportWidth(360);
    renderTyping(["/start", "/?sheet=notiz"], 1, true);
    const layer = await screen.findByRole("dialog", { name: "Notiz" });
    await userEvent.type(within(layer).getByLabelText("Text"), "Thymian");
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Notiz" })).toBeNull());
    expect(screen.queryByRole("dialog", QUESTION)).toBeNull();
    expect(seen.pathname).toBe("/");
    expect(seen.search).toBe("");
    fireEvent.click(screen.getByText("Browser vor"));
    await waitFor(() => expect(seen.search).toContain("sheet=notiz"));
    expect(seen.state).toMatchObject({ layerFromApp: true });
    expect(seen.state).not.toMatchObject({ layerGuard: true });
    expect(await screen.findByRole("dialog", { name: "Notiz" })).toBeTruthy();
  });
});

/**
 * A close over the guard entry leaves no guard entry ahead (issue 2158): the guard becomes a plain entry of the list, so
 * Forward reaches the layer's own entry, a second Forward closes the layer, and every Back on the way back shows a change.
 */
describe("US-QS-15 a close over the guard entry leaves no guard entry ahead (issue 2158)", () => {
  /** From the list: Forward opens the layer on its own entry, a second Forward closes it; no entry ahead is a guard. */
  async function forwardOpensThenCloses() {
    fireEvent.click(screen.getByText("Browser vor"));
    await waitFor(() => expect(seen.search).toContain("sheet=notiz"));
    expect(seen.state).toMatchObject({ layerFromApp: true });
    expect(seen.state).not.toMatchObject({ layerGuard: true });
    expect(await screen.findByRole("dialog", { name: "Notiz" })).toBeTruthy();
    fireEvent.click(screen.getByText("Browser vor"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Notiz" })).toBeNull());
    expect(seen.search).toBe("");
    expect(seen.state).not.toMatchObject({ layerGuard: true });
  }

  it("US-QS-15 Verwerfen after a Back leaves no guard entry ahead: Forward reaches the layer, a second Forward closes it (issue 2158)", async () => {
    setViewportWidth(360);
    renderTyping(["/start"], 0);
    await openAndType("Basilikum");
    fireEvent.click(screen.getByText("Browser zurück"));
    const question = await screen.findByRole("dialog", QUESTION);
    // The guard entry that the question was pushed with commits after the question shows (PF-031).
    await waitFor(() => expect(seen.state).toMatchObject({ layerGuard: true }));
    await userEvent.click(within(question).getByRole("button", { name: "Eingabe verwerfen" }));
    await waitFor(() => expect(seen.search).toBe(""));
    expect(seen.pathname).toBe("/start");
    await forwardOpensThenCloses();
    // Every Back on the way back changes what is shown: the layer, then the list.
    fireEvent.click(screen.getByText("Browser zurück"));
    expect(await screen.findByRole("dialog", { name: "Notiz" })).toBeTruthy();
    fireEvent.click(screen.getByText("Browser zurück"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Notiz" })).toBeNull());
    expect(seen.pathname).toBe("/start");
  });

  it("US-QS-15 Verwerfen after a Back in a layer opened by a reload leaves no guard entry ahead (issue 2158)", async () => {
    setViewportWidth(360);
    renderTyping(["/start", "/?sheet=notiz"], 1);
    const layer = await screen.findByRole("dialog", { name: "Notiz" });
    await userEvent.type(within(layer).getByLabelText("Text"), "Basilikum");
    await waitFor(() => expect(seen.state).toMatchObject({ layerGuard: true }));
    fireEvent.click(screen.getByText("Browser zurück"));
    const question = await screen.findByRole("dialog", QUESTION);
    await waitFor(() => expect(seen.state).toMatchObject({ layerGuard: true }));
    await userEvent.click(within(question).getByRole("button", { name: "Eingabe verwerfen" }));
    await waitFor(() => expect(seen.search).toBe(""));
    expect(seen.pathname).toBe("/");
    await forwardOpensThenCloses();
    fireEvent.click(screen.getByText("Browser zurück"));
    expect(await screen.findByRole("dialog", { name: "Notiz" })).toBeTruthy();
    fireEvent.click(screen.getByText("Browser zurück"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Notiz" })).toBeNull());
    expect(seen.pathname).toBe("/");
  });

  it("US-QS-15 Escape then Verwerfen leaves no guard entry ahead: a second Forward closes the layer (issue 2158)", async () => {
    setViewportWidth(360);
    renderTyping(["/start"], 0);
    await openAndType("Basilikum");
    await waitFor(() => expect(seen.state).toMatchObject({ layerGuard: true }));
    await userEvent.keyboard("{Escape}");
    const question = await screen.findByRole("dialog", QUESTION);
    await userEvent.click(within(question).getByRole("button", { name: "Eingabe verwerfen" }));
    await waitFor(() => expect(seen.search).toBe(""));
    expect(seen.pathname).toBe("/start");
    await forwardOpensThenCloses();
  });

  it("US-QS-15 a saved close with typed input leaves no guard entry ahead: Forward reaches the layer, a second Forward closes it (issue 2158)", async () => {
    setViewportWidth(360);
    renderTyping(["/before", "/start"], 1, true);
    await openAndType("Thymian");
    await waitFor(() => expect(seen.state).toMatchObject({ layerGuard: true }));
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Notiz" })).toBeNull());
    expect(seen.search).toBe("");
    expect(seen.pathname).toBe("/start");
    await forwardOpensThenCloses();
  });

  it("US-QS-15 on the browser history, Verwerfen after a Back leaves no guard entry ahead: Forward opens the layer, a second Forward closes it (issue 2158)", async () => {
    setViewportWidth(360);
    renderOnBrowser("/start");
    await openAndType("Basilikum");
    window.history.back();
    const question = await screen.findByRole("dialog", QUESTION);
    await waitFor(() => expect(seen.state).toMatchObject({ layerGuard: true }));
    await userEvent.click(within(question).getByRole("button", { name: "Eingabe verwerfen" }));
    await waitFor(() => expect(seen.search).toBe(""));
    expect(window.location.search).toBe("");
    // The browser's own history: the popstate of each step arrives later, so each Forward is awaited.
    window.history.forward();
    await waitFor(() => expect(seen.search).toContain("sheet=notiz"));
    expect(seen.state).not.toMatchObject({ layerGuard: true });
    window.history.forward();
    await waitFor(() => expect(seen.search).toBe(""));
    expect(seen.state).not.toMatchObject({ layerGuard: true });
    expect(screen.queryByRole("dialog", { name: "Notiz" })).toBeNull();
  });

  /** The guard entry of a change waits in the gated router, as on a slow device: the saved close runs while it is pending (PF-031). */
  function renderGatedTyping(entry: string, save: boolean) {
    return render(
      <GatedRouter entry={entry}>
        <TypingLayer save={save} />
      </GatedRouter>,
    );
  }

  it("US-QS-15 a saved close whose guard entry is still pending closes the layer; Forward reaches the layer, a second Forward closes it (issue 2165)", async () => {
    setViewportWidth(360);
    renderGatedTyping("/start", true);
    await userEvent.click(screen.getByRole("button", { name: "Notiz" }));
    const layer = await screen.findByRole("dialog", { name: "Notiz" });
    // The first input pushes the guard entry; the router holds it back, so the saved close runs while it is pending.
    hold.on = true;
    await userEvent.type(within(layer).getByLabelText("Text"), "Thymian");
    expect(hold.queued).not.toBeNull();
    expect(seen.state).not.toMatchObject({ layerGuard: true });
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Notiz" })).toBeNull());
    await releaseHold();
    expect(screen.queryByRole("dialog", QUESTION)).toBeNull();
    expect(seen.search).toBe("");
    expect(seen.pathname).toBe("/start");
    await forwardOpensThenCloses();
  });

  it("US-QS-15 a layer opened by a reload: a saved close whose guard entry is still pending lands on its list, and Forward reaches the layer's own entry (issue 2165)", async () => {
    setViewportWidth(360);
    renderGatedTyping("/?sheet=notiz", true);
    const layer = await screen.findByRole("dialog", { name: "Notiz" });
    hold.on = true;
    await userEvent.type(within(layer).getByLabelText("Text"), "Thymian");
    expect(hold.queued).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Notiz" })).toBeNull());
    await releaseHold();
    expect(seen.pathname).toBe("/");
    expect(seen.search).toBe("");
    fireEvent.click(screen.getByText("Browser vor"));
    await waitFor(() => expect(seen.search).toContain("sheet=notiz"));
    expect(seen.state).toMatchObject({ layerFromApp: true });
    expect(seen.state).not.toMatchObject({ layerGuard: true });
    expect(await screen.findByRole("dialog", { name: "Notiz" })).toBeTruthy();
  });
});

/** A filter-like replace inside the layer, without state, as the catalog's filters do (US-QS-15, issue 2145). */
function ReplaceInside() {
  const [, setParams] = useSearchParams();
  return (
    <button
      type="button"
      onClick={() =>
        setParams(
          (prev) => {
            prev.set("q", "rosa");
            return prev;
          },
          { replace: true },
        )
      }
    >
      Filter setzen
    </button>
  );
}

describe("US-QS-15 a layer keeps its input through a second Back; the hold stays on the entry below (issue 2145)", () => {
  it("US-QS-15 a replace without state inside an open layer adds no history entry, so a filter in the layer does not ask for an entry", async () => {
    setViewportWidth(360);
    window.history.replaceState(null, "", "/start");
    render(
      <BrowserRouter>
        <LayerHost>
          <LayerOpener id="liste">Liste</LayerOpener>
          <LayerSheet id="liste" title="Liste">
            <ReplaceInside />
          </LayerSheet>
        </LayerHost>
      </BrowserRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Liste" }));
    await screen.findByRole("dialog", { name: "Liste" });
    const entries = window.history.length;
    await userEvent.click(screen.getByRole("button", { name: "Filter setzen" }));
    await waitFor(() => expect(new URL(window.location.href).searchParams.get("q")).toBe("rosa"));
    expect(window.history.length).toBe(entries);
    expect(screen.getByRole("dialog", { name: "Liste" })).toBeTruthy();
  });

  it("US-QS-15 a Back that jumps past the entry below the layer is not pulled forward: no question, no layer", async () => {
    setViewportWidth(360);
    keys = [];
    window.history.replaceState(null, "", "/before");
    window.history.pushState(null, "", "/start");
    render(
      <BrowserRouter>
        <TypingLayer />
      </BrowserRouter>,
    );
    await openAndType("Basilikum");
    // Three entries back: the entry below the layer is the one at /start, the jump lands on /before.
    window.history.go(-3);
    await waitFor(() => expect(seen.pathname).toBe("/before"));
    expect(seen.search).toBe("");
    expect(screen.queryByRole("dialog", QUESTION)).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Notiz" })).toBeNull();
    expect(window.location.pathname).toBe("/before");
  });

  it("US-QS-15 a second Back while the question is open keeps the field as the focus target; Weiter bearbeiten returns to the field", async () => {
    setViewportWidth(360);
    keys = [];
    renderOnBrowser("/start");
    await openAndType("Basilikum");
    const field = screen.getByLabelText("Text");
    window.history.back();
    await screen.findByRole("dialog", QUESTION);
    await waitFor(() => expect(seen.state).toMatchObject({ layerGuard: true }));
    const before = keys.length;
    window.history.back();
    await waitFor(() => expect(keys.length).toBeGreaterThan(before));
    await waitFor(() => expect(seen.state).toMatchObject({ layerGuard: true }));
    const question = screen.getByRole("dialog", QUESTION);
    await userEvent.click(within(question).getByRole("button", { name: "Weiter bearbeiten" }));
    await waitFor(() => expect(screen.queryByRole("dialog", QUESTION)).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(field));
    expect((field as HTMLInputElement).value).toBe("Basilikum");
  });
});
