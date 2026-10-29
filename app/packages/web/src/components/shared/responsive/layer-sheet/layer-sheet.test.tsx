// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useNavigate } from "react-router";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { setViewportWidth } from "@/lib/viewport-mock";
import { LayerOpener, LayerSheet } from "./layer-sheet";

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
      <LayerOpener id="licht">Licht</LayerOpener>
      <LayerSheet id="licht" title="Lichtzonen" primaryAction={<button>Speichern</button>}>
        <p>Inhalt</p>
      </LayerSheet>
      <Back />
    </MemoryRouter>
  );
}

describe("LayerSheet (US-QS-15)", () => {
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
});
