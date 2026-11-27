// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type RefObject } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { useInLayer } from "@/shared/ui/layer-scope";
import { ResponsiveModal } from "./responsive-modal";

beforeAll(() => {
  // jsdom has no pointer capture, Vaul calls it on pointerdown inside the sheet.
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
});

afterEach(cleanup);

function Counter() {
  const [n, setN] = useState(0);
  return <button onClick={() => setN(n + 1)}>Zähler {n}</button>;
}

function Example() {
  return (
    <ResponsiveModal
      trigger={<button>Öffnen</button>}
      title="Pflanze bearbeiten"
      description="Ändere die Angaben"
    >
      <Counter />
    </ResponsiveModal>
  );
}

function Scope() {
  return <p>{useInLayer() ? "in a layer" : "on a page"}</p>;
}

describe("US-QS-32 · SG-LIST-01 what a ResponsiveModal holds is in a layer", () => {
  // The children are rendered through a portal into a host node, so the scope of the sheet and the dialog does not reach them.
  it.each([
    ["a sheet below md", 360],
    ["a dialog from md", 1024],
  ])(
    "US-QS-32 · SG-LIST-01 %s: its lists scroll with the layer and never page",
    async (_name, width) => {
      setViewportWidth(width);
      render(
        <ResponsiveModal trigger={<button>Öffnen</button>} title="Pflanze bearbeiten">
          <Scope />
        </ResponsiveModal>,
      );
      await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
      expect(await screen.findByText("in a layer")).toBeTruthy();
    },
  );

  it("US-QS-32 · SG-LIST-01 a component beside the modal is on a page", () => {
    setViewportWidth(360);
    render(<Scope />);
    expect(screen.getByText("on a page")).toBeTruthy();
  });
});

describe("ResponsiveModal (US-QS-07, DS-23)", () => {
  it("US-QS-32 · SG-SHEET-02 below md the sheet's close button takes the closeLabel the caller gives", async () => {
    setViewportWidth(360);
    render(
      <ResponsiveModal
        trigger={<button>Öffnen</button>}
        title="Pflanze bearbeiten"
        closeLabel="Pflanze schließen"
      >
        <Counter />
      </ResponsiveModal>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    const dialog = await screen.findByRole("dialog", { name: "Pflanze bearbeiten" });
    expect(within(dialog).getByRole("button", { name: "Pflanze schließen" })).toBeTruthy();
  });

  it("US-QS-07 · DS-23 below md it opens as a bottom sheet with safe-area padding", async () => {
    setViewportWidth(360);
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    const dialog = await screen.findByRole("dialog", { name: "Pflanze bearbeiten" });
    expect(dialog.className).toContain("pb-[env(safe-area-inset-bottom)]");
    expect(dialog.className).toContain("inset-x-0");
  });

  it("US-QS-07 · DS-23 from md it opens as a centered dialog", async () => {
    setViewportWidth(768);
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    const dialog = await screen.findByRole("dialog", { name: "Pflanze bearbeiten" });
    expect(dialog.className).toContain("-translate-x-1/2");
  });

  it("US-QS-07 · DS-23 the content mounts once and keeps its state when the viewport crosses md", async () => {
    setViewportWidth(360);
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    await userEvent.click(screen.getByRole("button", { name: "Zähler 0" }));
    expect(screen.getAllByRole("button", { name: "Zähler 1" })).toHaveLength(1);
    act(() => setViewportWidth(1024));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.className).toContain("-translate-x-1/2");
    expect(screen.getAllByRole("button", { name: "Zähler 1" })).toHaveLength(1);
    act(() => setViewportWidth(360));
    expect(screen.getAllByRole("button", { name: "Zähler 1" })).toHaveLength(1);
  });

  it("US-QS-07 · DS-23 Esc closes it", async () => {
    setViewportWidth(768);
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("US-QS-07 · DS-40 Esc returns the focus to the trigger that opened the dialog", async () => {
    setViewportWidth(1024);
    render(<Example />);
    const trigger = screen.getByRole("button", { name: "Öffnen" });
    await userEvent.click(trigger);
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    expect(document.activeElement).toBe(trigger);
  });
});

/** A controlled modal without a trigger: `opener` is the element it returns the focus to (US-QS-08). */
function ControlledExample(props: {
  opener: RefObject<HTMLButtonElement | null>;
  withOpener: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {props.withOpener ? (
        <button ref={props.opener} type="button" onClick={() => setOpen(true)}>
          Öffnen
        </button>
      ) : null}
      <main id="inhalt" tabIndex={-1}>
        <h1>Heute</h1>
      </main>
      <ResponsiveModal
        title="Filter"
        open={open}
        onOpenChange={setOpen}
        returnFocusTo={props.opener}
      >
        <button>Anwenden</button>
      </ResponsiveModal>
    </>
  );
}

describe("US-QS-08 · DS-40 a controlled modal returns the focus to the element it is given", () => {
  it.each([
    ["dialog", 1024],
    ["sheet", 360],
  ])(
    "US-QS-08 · DS-40 Esc returns the focus to the element named by returnFocusTo (as a %s)",
    async (_kind, width) => {
      setViewportWidth(width);
      const opener: RefObject<HTMLButtonElement | null> = { current: null };
      render(<ControlledExample opener={opener} withOpener />);
      const button = screen.getByRole("button", { name: "Öffnen" });
      await userEvent.click(button);
      await screen.findByRole("dialog", { name: "Filter" });
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(document.activeElement).toBe(button));
    },
  );

  it.each([
    ["dialog", 1024],
    ["sheet", 360],
  ])(
    "US-QS-08 · DS-40 when the named element has left the page, Esc moves the focus to the heading of the view (as a %s)",
    async (_kind, width) => {
      setViewportWidth(width);
      const opener: RefObject<HTMLButtonElement | null> = { current: null };
      const { rerender } = render(<ControlledExample opener={opener} withOpener />);
      await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
      await screen.findByRole("dialog", { name: "Filter" });
      // The opener leaves the page while the modal is open; the focus falls back to the heading of the view.
      rerender(<ControlledExample opener={opener} withOpener={false} />);
      expect(opener.current).toBeNull();
      await userEvent.keyboard("{Escape}");
      const heading = screen.getByRole("heading", { level: 1, name: "Heute" });
      await waitFor(() => expect(document.activeElement).toBe(heading));
    },
  );
});
