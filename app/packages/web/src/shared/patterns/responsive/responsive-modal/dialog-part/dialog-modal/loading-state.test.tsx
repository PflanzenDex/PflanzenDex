// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";

// A chunk that waits until the test releases it, as on a slow network: while `hold` is set, a lazy page does not load.
const chunk = vi.hoisted(() => ({ hold: null as Promise<void> | null, loaded: 0 }));
vi.mock("@/shared/platform/routing/lazy-page/lazy-page", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("@/shared/platform/routing/lazy-page/lazy-page")>();
  return {
    ...real,
    lazyPage: ((load: () => Promise<never>) =>
      real.lazyPage(async () => {
        if (chunk.hold) await chunk.hold;
        const loaded = await load();
        chunk.loaded += 1;
        return loaded;
      })) as typeof real.lazyPage,
  };
});

/** Holds the chunk until the returned function is called; counts the chunks that load from this test on. */
function holdChunk(): () => void {
  chunk.loaded = 0;
  let release: () => void = () => undefined;
  chunk.hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  return () => {
    chunk.hold = null;
    release();
  };
}

/** A lazy page keeps its chunk once it has loaded, so each test loads the modal anew and its first open waits. */
async function freshResponsiveModal() {
  vi.resetModules();
  return (await import("../../responsive-modal")).ResponsiveModal;
}

afterEach(() => {
  chunk.hold = null;
  cleanup();
});

describe("NFR-12 · DS-08 a first open says that the window is loading", () => {
  it("NFR-12 · DS-08 from md, while the dialog chunk is pending the dialog says it is loading and the trigger keeps the focus", async () => {
    const ResponsiveModal = await freshResponsiveModal();
    setViewportWidth(1024);
    const release = holdChunk();
    render(
      <ResponsiveModal title="Pflanze bearbeiten" trigger={<button>Öffnen</button>}>
        <button>Speichern</button>
      </ResponsiveModal>,
    );
    const trigger = screen.getByRole("button", { name: "Öffnen" });
    await userEvent.click(trigger);
    const status = await screen.findByRole("status");
    expect(status.textContent).toBe("Fenster wird geladen …");
    expect(document.activeElement).toBe(trigger);
    release();
    expect(await screen.findByRole("dialog", { name: "Pflanze bearbeiten" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
    await userEvent.keyboard("{Escape}");
    expect(document.activeElement).toBe(trigger);
  });

  it("NFR-12 · DS-08 below md, while the sheet chunk is pending the sheet says it is loading and the trigger keeps the focus", async () => {
    const ResponsiveModal = await freshResponsiveModal();
    setViewportWidth(360);
    const release = holdChunk();
    render(
      <ResponsiveModal title="Pflanze bearbeiten" trigger={<button>Öffnen</button>}>
        <button>Speichern</button>
      </ResponsiveModal>,
    );
    const trigger = screen.getByRole("button", { name: "Öffnen" });
    await userEvent.click(trigger);
    const status = await screen.findByRole("status");
    expect(status.textContent).toBe("Fenster wird geladen …");
    expect(document.activeElement).toBe(trigger);
    release();
    expect(await screen.findByRole("dialog", { name: "Pflanze bearbeiten" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("NFR-12 · DS-08 closing the dialog while its chunk is pending shows nothing when the chunk arrives", async () => {
    const ResponsiveModal = await freshResponsiveModal();
    setViewportWidth(1024);
    const release = holdChunk();
    render(
      <ResponsiveModal title="Pflanze bearbeiten" trigger={<button>Öffnen</button>}>
        <button>Speichern</button>
      </ResponsiveModal>,
    );
    const trigger = screen.getByRole("button", { name: "Öffnen" });
    await userEvent.click(trigger);
    await screen.findByRole("status");
    await userEvent.click(trigger);
    expect(screen.queryByRole("status")).toBeNull();
    release();
    await waitFor(() => expect(chunk.loaded).toBe(1));
    await act(async () => undefined);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("NFR-12 · DS-08 closing the sheet while its chunk is pending shows nothing when the chunk arrives", async () => {
    const ResponsiveModal = await freshResponsiveModal();
    setViewportWidth(360);
    const release = holdChunk();
    render(
      <ResponsiveModal title="Pflanze bearbeiten" trigger={<button>Öffnen</button>}>
        <button>Speichern</button>
      </ResponsiveModal>,
    );
    const trigger = screen.getByRole("button", { name: "Öffnen" });
    await userEvent.click(trigger);
    await screen.findByRole("status");
    await userEvent.click(trigger);
    expect(screen.queryByRole("status")).toBeNull();
    release();
    await waitFor(() => expect(chunk.loaded).toBe(1));
    await act(async () => undefined);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("NFR-12 · DS-08 a controlled dialog without a trigger says it is loading while its chunk is pending", async () => {
    const ResponsiveModal = await freshResponsiveModal();
    setViewportWidth(1024);
    const release = holdChunk();
    render(
      <ResponsiveModal title="Filter" open onOpenChange={() => undefined}>
        <button>Anwenden</button>
      </ResponsiveModal>,
    );
    expect((await screen.findByRole("status")).textContent).toBe("Fenster wird geladen …");
    release();
    expect(await screen.findByRole("dialog", { name: "Filter" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("NFR-12 · DS-08 a controlled sheet without a trigger says it is loading while its chunk is pending", async () => {
    const ResponsiveModal = await freshResponsiveModal();
    setViewportWidth(360);
    const release = holdChunk();
    render(
      <ResponsiveModal title="Filter" open onOpenChange={() => undefined}>
        <button>Anwenden</button>
      </ResponsiveModal>,
    );
    expect((await screen.findByRole("status")).textContent).toBe("Fenster wird geladen …");
    release();
    expect(await screen.findByRole("dialog", { name: "Filter" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
