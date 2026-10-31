// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useNavigate, useSearchParams } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/lib/viewport-mock";
import { AnnouncerProvider } from "@/platform/announcer/announcer";
import { RouteFocus } from "@/components/routing/route-focus/route-focus";
import { LayerHost, LayerOpener, LayerSheet } from "./layer-sheet";

beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
});

afterEach(cleanup);

function Back() {
  const navigate = useNavigate();
  return <button onClick={() => void navigate(-1)}>Browser zurück</button>;
}

function Example({ at = "/" }: { at?: string }) {
  return (
    <MemoryRouter initialEntries={["/start", at]} initialIndex={at === "/" ? 0 : 1}>
      <LayerHost>
        <LayerOpener id="licht">Licht</LayerOpener>
        <LayerSheet id="licht" title="Lichtzonen" primaryAction={<button>Speichern</button>}>
          <p>Inhalt</p>
        </LayerSheet>
      </LayerHost>
      <Back />
    </MemoryRouter>
  );
}

function Pager() {
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
            <Pager />
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
    const pager = screen.getByRole("button", { name: "Seite 2" });
    await userEvent.click(pager);
    await new Promise((r) => setTimeout(r, 400));
    expect(document.activeElement).toBe(pager);
  });

  it("US-QS-22 a closed layer mounts no content, so it loads nothing and holds no pager", () => {
    setViewportWidth(360);
    render(<Example />);
    expect(screen.queryByText("Inhalt")).toBeNull();
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
    fireEvent.click(screen.getByRole("button", { name: "Browser zurück", hidden: true }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
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
    expect(screen.getByRole("button", { name: "Speichern" })).toBeTruthy();
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
