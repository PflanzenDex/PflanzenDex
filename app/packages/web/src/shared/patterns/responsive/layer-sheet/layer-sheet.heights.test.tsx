// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnnouncerProvider } from "@/shared/platform/announcer/announcer";
import { heightOf, layout, setWindowHeight, stubSheetLayout } from "@/shared/ui/sheet.test-helpers";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { LayerHost, LayerOpener, LayerSheet, useUnsavedInput } from "./layer-sheet";

// US-QS-15, the heights of a layer as a sheet and its scroll region as a sheet, a dialog and a pane (owner decision 4 of
// 2026-11-21, issue 2412; owner answers 2026-11-21, issue 2415). jsdom has no layout: `stubSheetLayout` gives the sheet one.
// The window is 800 px high: half is 400 px, full is 800 px.

beforeEach(() => {
  layout.header = 90;
  layout.content = 1200;
  layout.pinned = 0;
  stubSheetLayout();
  setWindowHeight(800);
  setViewportWidth(360);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.documentElement.style.fontSize = "";
});

let search = "";
function Probe() {
  search = useLocation().search;
  return null;
}

function Back() {
  const navigate = useNavigate();
  return <button onClick={() => void navigate(-1)}>Browser zurück</button>;
}

function Unsaved() {
  useUnsavedInput(true);
  return <p>Eine Eingabe ist noch nicht gesichert.</p>;
}

function Example(props: { children?: React.ReactNode }) {
  const [text, setText] = useState("");
  return (
    <AnnouncerProvider>
      <MemoryRouter initialEntries={["/start", "/start"]}>
        <Probe />
        <LayerHost>
          <LayerOpener id="notiz">Notiz</LayerOpener>
          <LayerSheet id="notiz" title="Notiz" primaryAction={<button>Sichern</button>}>
            {props.children ?? (
              <ul>
                <li>
                  <input aria-label="Text" value={text} onChange={(e) => setText(e.target.value)} />
                </li>
                <li>Hinweis</li>
              </ul>
            )}
          </LayerSheet>
        </LayerHost>
        <Back />
      </MemoryRouter>
    </AnnouncerProvider>
  );
}

async function open() {
  await userEvent.click(screen.getByRole("button", { name: "Notiz" }));
  return screen.findByRole("dialog", { name: "Notiz" });
}

describe("US-QS-15 · a layer as a sheet has half height and full height", () => {
  it("US-QS-15 a layer with a long content opens at half height, with the toggle, and its address names it", async () => {
    render(<Example />);
    const sheet = await open();
    await waitFor(() => expect(heightOf(sheet)).toBe("400px"));
    expect(search).toBe("?sheet=notiz");
    expect(within(sheet).getByRole("button", { name: "Vollbild" })).toBeTruthy();
    expect(within(sheet).getByRole("separator", { name: "Höhe ändern" })).toBeTruthy();
  });

  it("US-QS-15 at half height the title and the primary action stay and the content is the scroll region between them", async () => {
    layout.pinned = 60;
    render(<Example />);
    const sheet = await open();
    const region = sheet.querySelector<HTMLElement>("[data-layer-body] > [data-scroll-region]");
    expect(region).not.toBeNull();
    expect(region?.className).toContain("overflow-y-auto");
    expect(region?.className).toContain("overscroll-contain");
    expect(region?.contains(within(sheet).getByRole("heading", { name: "Notiz" }))).toBe(false);
    expect(region?.contains(within(sheet).getByRole("button", { name: "Sichern" }))).toBe(false);
    expect(region?.contains(within(sheet).getByRole("button", { name: "Schließen" }))).toBe(false);
  });

  it("US-QS-15 · issue 1104 a layer that starts with a text field keeps the focus there, not on the handle or the toggle before it", async () => {
    render(<Example />);
    const sheet = await open();
    await waitFor(() => expect(heightOf(sheet)).toBe("400px"));
    await waitFor(() => expect(document.activeElement).toBe(within(sheet).getByLabelText("Text")));
    expect(document.activeElement).not.toBe(
      within(sheet).getByRole("separator", { name: "Höhe ändern" }),
    );
  });

  it("US-QS-15 · issue 1028 a layer whose first control is a button keeps the focus on its title, not on the handle", async () => {
    render(
      <Example>
        <button>Freundschaft beenden</button>
      </Example>,
    );
    const sheet = await open();
    await waitFor(() =>
      expect(document.activeElement).toBe(within(sheet).getByRole("heading", { name: "Notiz" })),
    );
  });

  it("US-QS-15 at 200 % text, when title and the primary action do not fit within half height, the layer opens at full height", async () => {
    document.documentElement.style.fontSize = "32px";
    layout.header = 150;
    layout.pinned = 70;
    render(<Example />);
    const sheet = await open();
    await waitFor(() => expect(sheet.getAttribute("data-sheet-height")).toBe("full"));
    expect(heightOf(sheet)).toBe("800px");
    expect(within(sheet).queryByRole("button", { name: "Halbe Höhe" })).toBeNull();
  });
});

describe("US-QS-15 · issue 2424 a layer that asks for half height opens at half height below 768 px, whatever the length of its content", () => {
  function Half(props: { halfHeight?: boolean }) {
    return (
      <MemoryRouter initialEntries={["/start"]}>
        <LayerHost>
          <LayerOpener id="notiz">Notiz</LayerOpener>
          <LayerSheet id="notiz" title="Notiz" {...(props.halfHeight ? { halfHeight: true } : {})}>
            <p>Ein kurzer Inhalt</p>
          </LayerSheet>
        </LayerHost>
      </MemoryRouter>
    );
  }

  it("US-QS-15 · issue 2424 a short content opens at half height with the toggle", async () => {
    layout.content = 60;
    render(<Half halfHeight />);
    const sheet = await open();
    await waitFor(() => expect(heightOf(sheet)).toBe("400px"));
    expect(sheet.getAttribute("data-sheet-height")).toBe("two");
    expect(within(sheet).getByRole("button", { name: "Vollbild" })).toBeTruthy();
  });

  it("US-QS-15 a short content of a layer without the request keeps the height of its content", async () => {
    layout.content = 60;
    render(<Half />);
    const sheet = await open();
    await waitFor(() => expect(sheet.getAttribute("data-sheet-height")).toBe("fit"));
    expect(heightOf(sheet)).toBe("auto");
  });

  it("US-QS-15 · issue 2424 from 768 px the request changes nothing: a dialog has no sheet height", async () => {
    setViewportWidth(800);
    layout.content = 60;
    render(<Half halfHeight />);
    await userEvent.click(screen.getByRole("button", { name: "Notiz" }));
    const dialog = await screen.findByRole("dialog", { name: "Notiz" });
    expect(dialog.getAttribute("data-sheet-height")).toBeNull();
  });
});

describe("US-QS-15 · issue 2424 the actions of a layer under its title stay in place while the content scrolls", () => {
  function Top() {
    return (
      <MemoryRouter initialEntries={["/start"]}>
        <LayerHost>
          <LayerOpener id="notiz">Notiz</LayerOpener>
          <LayerSheet
            id="notiz"
            title="Notiz"
            topAction={<button>Messen</button>}
            primaryAction={<button>Sichern</button>}
          >
            <p>Inhalt</p>
          </LayerSheet>
        </LayerHost>
      </MemoryRouter>
    );
  }

  it.each([
    ["a phone sheet", 360, "dialog"],
    ["a dialog", 800, "dialog"],
    ["a pane", 1280, "complementary"],
  ] as const)(
    "US-QS-15 · issue 2424 in %s the top action stands before the scroll region and outside it, the primary action after it",
    async (_name, width, role) => {
      setViewportWidth(width);
      render(<Top />);
      await userEvent.click(screen.getByRole("button", { name: "Notiz" }));
      const layer = await screen.findByRole(role, { name: "Notiz" });
      const top = within(layer).getByRole("button", { name: "Messen" });
      const region = layer.querySelector("[data-layer-body] > [data-scroll-region]") as HTMLElement;
      const primary = within(layer).getByRole("button", { name: "Sichern" });
      expect(region.contains(top)).toBe(false);
      expect(region.contains(primary)).toBe(false);
      expect(top.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
      expect(region.compareDocumentPosition(primary) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(
        0,
      );
    },
  );

  it("US-QS-15 · issue 2424 at 200 % text the sheet counts the top action with its header: when they fill half height it opens at full height", async () => {
    document.documentElement.style.fontSize = "32px";
    layout.header = 150;
    layout.pinned = 70;
    render(<Top />);
    const sheet = await open();
    await waitFor(() => expect(sheet.getAttribute("data-sheet-height")).toBe("full"));
  });
});

describe("US-QS-15 · Escape, Schließen and Back close a layer at half height", () => {
  it("US-QS-15 Escape closes the layer at half height and its address is gone", async () => {
    render(<Example />);
    const sheet = await open();
    await waitFor(() => expect(heightOf(sheet)).toBe("400px"));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Notiz" })).toBeNull());
    expect(search).toBe("");
  });

  it("US-QS-15 'Schließen' closes the layer at half height", async () => {
    render(<Example />);
    const sheet = await open();
    await waitFor(() => expect(heightOf(sheet)).toBe("400px"));
    await userEvent.click(within(sheet).getByRole("button", { name: "Schließen" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Notiz" })).toBeNull());
    expect(search).toBe("");
  });

  it("US-QS-15 Back closes the layer at half height", async () => {
    render(<Example />);
    const sheet = await open();
    await waitFor(() => expect(heightOf(sheet)).toBe("400px"));
    // The modal hides the page behind it from the pointer, so Back is a click on the button, as the browser's step is.
    fireEvent.click(screen.getByText("Browser zurück"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Notiz" })).toBeNull());
  });

  it("US-QS-15 · US-QS-32 with typed input that is not saved Escape asks Eingabe verwerfen? at half height and keeps the height", async () => {
    render(
      <Example>
        <Unsaved />
      </Example>,
    );
    const sheet = await open();
    await waitFor(() => expect(heightOf(sheet)).toBe("400px"));
    await userEvent.keyboard("{Escape}");
    const question = await screen.findByRole("dialog", { name: "Eingabe verwerfen?" });
    await userEvent.click(within(question).getByRole("button", { name: "Weiter bearbeiten" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Eingabe verwerfen?" })).toBeNull(),
    );
    expect(screen.getByRole("dialog", { name: "Notiz" })).toBe(sheet);
    expect(heightOf(sheet)).toBe("400px");
    expect(search).toBe("?sheet=notiz");
  });

  it("US-QS-15 · US-QS-32 a close by a drag on the handle that the question holds back brings the sheet back to its height", async () => {
    render(
      <Example>
        <Unsaved />
      </Example>,
    );
    const sheet = await open();
    await waitFor(() => expect(heightOf(sheet)).toBe("400px"));
    const handle = within(sheet).getByRole("separator", { name: "Höhe ändern" });
    const down = { pointerId: 1, pointerType: "touch", button: 0, isPrimary: true };
    handle.dispatchEvent(new PointerEvent("pointerdown", { ...down, clientY: 500, bubbles: true }));
    window.dispatchEvent(new PointerEvent("pointermove", { ...down, clientY: 900 }));
    window.dispatchEvent(new PointerEvent("pointerup", { ...down, clientY: 900 }));
    await screen.findByRole("dialog", { name: "Eingabe verwerfen?" });
    await userEvent.click(screen.getByRole("button", { name: "Weiter bearbeiten" }));
    await waitFor(() => expect(heightOf(sheet)).toBe("400px"));
    expect(sheet.style.transform).toBe("translate3d(0px, 0px, 0px)");
  });
});

describe("US-QS-15 · the content of a layer is the scroll region of sheet, dialog and pane", () => {
  it.each([
    ["a sheet", 360],
    ["a dialog", 800],
    ["a pane", 1280],
  ])(
    "US-QS-15 as %s the content scrolls inside the layer, and the title and the primary action stay",
    async (_, width) => {
      setViewportWidth(width);
      render(<Example />);
      await userEvent.click(screen.getByRole("button", { name: "Notiz" }));
      const layer =
        width >= 1024
          ? await screen.findByRole("complementary", { name: "Notiz" })
          : await screen.findByRole("dialog", { name: "Notiz" });
      const region = layer.querySelector<HTMLElement>("[data-layer-body] > [data-scroll-region]");
      expect(region).not.toBeNull();
      expect(region?.className).toContain("overflow-y-auto");
      expect(region?.className).toContain("overscroll-contain");
      expect(region?.contains(within(layer).getByRole("heading", { name: "Notiz" }))).toBe(false);
      expect(region?.contains(within(layer).getByRole("button", { name: "Sichern" }))).toBe(false);
      expect(region?.contains(within(layer).getByLabelText("Text"))).toBe(true);
    },
  );
});
