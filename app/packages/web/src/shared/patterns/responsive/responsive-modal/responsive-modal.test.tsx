// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type RefObject } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
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

describe("ResponsiveModal (US-QS-07, DS-23)", () => {
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
