// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { setViewportWidth } from "@/lib/viewport-mock";
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
    const dialog = screen.getByRole("dialog", { name: "Pflanze bearbeiten" });
    expect(dialog.className).toContain("pb-[env(safe-area-inset-bottom)]");
    expect(dialog.className).toContain("inset-x-0");
  });

  it("US-QS-07 · DS-23 from md it opens as a centered dialog", async () => {
    setViewportWidth(768);
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    const dialog = screen.getByRole("dialog", { name: "Pflanze bearbeiten" });
    expect(dialog.className).toContain("-translate-x-1/2");
  });

  it("US-QS-07 · DS-23 the content mounts once and keeps its state when the viewport crosses md", async () => {
    setViewportWidth(360);
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    await userEvent.click(screen.getByRole("button", { name: "Zähler 0" }));
    expect(screen.getAllByRole("button", { name: "Zähler 1" })).toHaveLength(1);
    act(() => setViewportWidth(1024));
    expect(screen.getAllByRole("button", { name: "Zähler 1" })).toHaveLength(1);
    expect(screen.getByRole("dialog").className).toContain("-translate-x-1/2");
    act(() => setViewportWidth(360));
    expect(screen.getAllByRole("button", { name: "Zähler 1" })).toHaveLength(1);
  });

  it("US-QS-07 · DS-23 Esc closes it", async () => {
    setViewportWidth(768);
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
