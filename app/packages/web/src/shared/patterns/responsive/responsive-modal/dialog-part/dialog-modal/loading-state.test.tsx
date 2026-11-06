// @vitest-environment jsdom
import * as React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { Sheet, SheetContent, SheetTrigger } from "@/shared/ui/overlays/sheet/sheet";
import { DialogPart } from "../dialog-part";

// A chunk that waits until the test releases it, as on a slow network: while `hold` is set, a lazy page does not load.
// While `fail` is set the request fails (offline, or a deployment replaced the file); `attempts` counts every request.
const chunk = vi.hoisted(() => ({
  hold: null as Promise<void> | null,
  loaded: 0,
  fail: false,
  attempts: 0,
}));
vi.mock("@/shared/platform/routing/lazy-page/lazy-page", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("@/shared/platform/routing/lazy-page/lazy-page")>();
  return {
    ...real,
    lazyPage: ((load: () => Promise<never>) =>
      real.lazyPage(async () => {
        chunk.attempts += 1;
        if (chunk.fail) throw new Error("Failed to fetch dynamically imported module");
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
  chunk.fail = false;
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

/** Records every `role="status"` node that enters the DOM, also one that leaves again before anyone looks (US-QS-07). */
function watchStatus() {
  const entered: string[] = [];
  const collect = (records: MutationRecord[]) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        for (const el of [node, ...Array.from(node.querySelectorAll("[role='status']"))]) {
          if (el.matches("[role='status']")) entered.push(el.textContent ?? "");
        }
      }
    }
  };
  const observer = new MutationObserver(collect);
  observer.observe(document.body, { childList: true, subtree: true });
  return {
    /** The number of status nodes that have entered the DOM since the watch started. */
    count: () => {
      collect(observer.takeRecords());
      return entered.length;
    },
    stop: () => {
      collect(observer.takeRecords());
      observer.disconnect();
    },
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("US-QS-07 · DS-08 the loading status waits 300 ms, so a window that opens quickly shows none", () => {
  it.each([
    ["dialog", 1024],
    ["sheet", 360],
  ])(
    "US-QS-07 · DS-08 a %s whose chunk arrives at once opens without a loading status, which never enters the DOM",
    async (_kind, width) => {
      const ResponsiveModal = await freshResponsiveModal();
      setViewportWidth(width);
      render(
        <ResponsiveModal title="Pflanze bearbeiten" trigger={<button>Öffnen</button>}>
          <button>Speichern</button>
        </ResponsiveModal>,
      );
      const watch = watchStatus();
      await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
      expect(await screen.findByRole("dialog", { name: "Pflanze bearbeiten" })).toBeTruthy();
      expect(watch.count()).toBe(0);
      watch.stop();
    },
  );

  it.each([
    ["dialog", 1024],
    ["sheet", 360],
  ])(
    "US-QS-07 · DS-08 a %s whose chunk is already loaded opens at once, and no loading status enters the DOM",
    async (kind, width) => {
      const ResponsiveModal = await freshResponsiveModal();
      setViewportWidth(width);
      render(
        <ResponsiveModal title="Pflanze bearbeiten" trigger={<button>Öffnen</button>}>
          <button>Speichern</button>
        </ResponsiveModal>,
      );
      const trigger = screen.getByRole("button", { name: "Öffnen" });
      // Pointer enter starts the preload (DS-08); the test then waits until the module has arrived.
      await userEvent.hover(trigger);
      await (kind === "dialog"
        ? import("./dialog-modal")
        : import("@/shared/ui/overlays/sheet/sheet-panel/sheet-panel"));
      const watch = watchStatus();
      await userEvent.click(trigger);
      expect(await screen.findByRole("dialog", { name: "Pflanze bearbeiten" })).toBeTruthy();
      expect(watch.count()).toBe(0);
      watch.stop();
    },
  );

  it.each([
    ["dialog", 1024],
    ["sheet", 360],
  ])(
    "US-QS-07 · DS-08 a slow %s shows its loading status only after 300 ms, and the status goes when it opens",
    async (_kind, width) => {
      const ResponsiveModal = await freshResponsiveModal();
      setViewportWidth(width);
      const release = holdChunk();
      render(
        <ResponsiveModal title="Pflanze bearbeiten" trigger={<button>Öffnen</button>}>
          <button>Speichern</button>
        </ResponsiveModal>,
      );
      await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
      await sleep(250);
      expect(screen.queryByRole("status")).toBeNull();
      await sleep(100);
      expect(screen.getByRole("status").textContent).toBe("Fenster wird geladen …");
      release();
      expect(await screen.findByRole("dialog", { name: "Pflanze bearbeiten" })).toBeTruthy();
      expect(screen.queryByRole("status")).toBeNull();
    },
  );

  it.each([
    ["dialog", 1024],
    ["sheet", 360],
  ])(
    "US-QS-07 · DS-08 a second open of the %s shows no loading status, because its chunk is loaded",
    async (_kind, width) => {
      const ResponsiveModal = await freshResponsiveModal();
      setViewportWidth(width);
      const release = holdChunk();
      render(
        <ResponsiveModal title="Pflanze bearbeiten" trigger={<button>Öffnen</button>}>
          <button>Speichern</button>
        </ResponsiveModal>,
      );
      const trigger = screen.getByRole("button", { name: "Öffnen" });
      await userEvent.click(trigger);
      await screen.findByRole("status");
      release();
      await screen.findByRole("dialog", { name: "Pflanze bearbeiten" });
      await userEvent.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).toBeNull();
      const watch = watchStatus();
      await userEvent.click(trigger);
      expect(await screen.findByRole("dialog", { name: "Pflanze bearbeiten" })).toBeTruthy();
      expect(watch.count()).toBe(0);
      watch.stop();
    },
  );

  it("US-QS-07 · DS-23 the sheet's loading status is a centred panel, not anchored to the bottom edge, so it covers no navigation label", async () => {
    const ResponsiveModal = await freshResponsiveModal();
    setViewportWidth(360);
    const release = holdChunk();
    render(
      <ResponsiveModal title="Pflanze bearbeiten" trigger={<button>Öffnen</button>}>
        <button>Speichern</button>
      </ResponsiveModal>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    const cls = (await screen.findByRole("status")).className;
    expect(cls).toContain("left-1/2");
    expect(cls).toContain("top-1/2");
    expect(cls).toContain("-translate-y-1/2");
    expect(cls).not.toContain("bottom-0");
    expect(cls).not.toContain("inset-x-0");
    release();
    await screen.findByRole("dialog", { name: "Pflanze bearbeiten" });
  });
});

/** A child that suspends until the test releases it: a lazy page inside the body of a window (US-QS-07). */
function suspendingChild() {
  let release: () => void = () => undefined;
  const Late = React.lazy(
    () =>
      new Promise<{ default: () => React.ReactElement }>((resolve) => {
        release = () => resolve({ default: () => <p>Späterer Inhalt</p> });
      }),
  );
  return { Late, release: () => release() };
}

/** A dialog part whose body is `body`; it mounts at the first open, as `ResponsiveModal` does. */
function DialogExample({ body }: { body: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [opened, setOpened] = React.useState(false);
  return (
    <DialogPart
      title="Pflanze bearbeiten"
      trigger={<button>Öffnen</button>}
      open={open}
      opened={opened}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setOpened(true);
      }}
      body={body}
    />
  );
}

describe("US-QS-07 · DS-08 a window keeps its boundary for what its body loads", () => {
  it("US-QS-07 · DS-08 a dialog whose body suspends waits inside the dialog, and the outer boundary shows nothing", async () => {
    setViewportWidth(1024);
    const { Late, release } = suspendingChild();
    render(
      <React.Suspense fallback={<p>outer</p>}>
        <DialogExample body={<Late />} />
      </React.Suspense>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    await sleep(100);
    expect(screen.queryByText("outer")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Fenster wird geladen …");
    release();
    expect(await screen.findByText("Späterer Inhalt")).toBeTruthy();
    expect(screen.queryByText("outer")).toBeNull();
  });

  it("US-QS-07 · DS-08 a sheet whose body suspends waits inside the sheet, and the outer boundary shows nothing", async () => {
    setViewportWidth(360);
    const { Late, release } = suspendingChild();
    render(
      <React.Suspense fallback={<p>outer</p>}>
        <Sheet>
          <SheetTrigger asChild>
            <button>Öffnen</button>
          </SheetTrigger>
          <SheetContent title="Filter">
            <Late />
          </SheetContent>
        </Sheet>
      </React.Suspense>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    await sleep(100);
    expect(screen.queryByText("outer")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Fenster wird geladen …");
    release();
    expect(await screen.findByText("Späterer Inhalt")).toBeTruthy();
    expect(screen.queryByText("outer")).toBeNull();
  });
});

describe("US-QS-07 · DS-08 · P-10 a failed chunk of a window offers retry and close, and retry opens it", () => {
  it("US-QS-07 · DS-08 · P-10 a dialog whose chunk fails shows the error with retry and close; retry requests the chunk again and the dialog opens", async () => {
    const ResponsiveModal = await freshResponsiveModal();
    setViewportWidth(1024);
    chunk.fail = true;
    render(
      <ResponsiveModal title="Pflanze bearbeiten" trigger={<button>Öffnen</button>}>
        <button>Speichern</button>
      </ResponsiveModal>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Das Fenster konnte nicht geladen werden.");
    expect(alert.textContent).not.toContain("Failed to fetch");
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Schließen" })).toBeTruthy();
    const failedAttempts = chunk.attempts;
    chunk.fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByRole("dialog", { name: "Pflanze bearbeiten" })).toBeTruthy();
    expect(chunk.attempts).toBe(failedAttempts + 1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("US-QS-07 · DS-08 · P-10 a sheet whose chunk fails shows the error with retry and close; retry requests the chunk again and the sheet opens", async () => {
    const ResponsiveModal = await freshResponsiveModal();
    setViewportWidth(360);
    chunk.fail = true;
    render(
      <ResponsiveModal title="Pflanze bearbeiten" trigger={<button>Öffnen</button>}>
        <button>Speichern</button>
      </ResponsiveModal>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Das Fenster konnte nicht geladen werden.");
    expect(alert.textContent).not.toContain("Failed to fetch");
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Schließen" })).toBeTruthy();
    const failedAttempts = chunk.attempts;
    chunk.fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByRole("dialog", { name: "Pflanze bearbeiten" })).toBeTruthy();
    expect(chunk.attempts).toBe(failedAttempts + 1);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("US-QS-07 · DS-40 Escape stops a window that is still loading", () => {
  it.each([
    ["dialog", 1024],
    ["sheet", 360],
  ])(
    "US-QS-07 · DS-40 a %s whose chunk is pending closes on Escape before the status shows, and nothing opens when the chunk arrives",
    async (_kind, width) => {
      const ResponsiveModal = await freshResponsiveModal();
      setViewportWidth(width);
      const release = holdChunk();
      render(
        <ResponsiveModal title="Pflanze bearbeiten" trigger={<button>Öffnen</button>}>
          <button>Speichern</button>
        </ResponsiveModal>,
      );
      const trigger = screen.getByRole("button", { name: "Öffnen" });
      await userEvent.click(trigger);
      expect(screen.queryByRole("status")).toBeNull();
      await userEvent.keyboard("{Escape}");
      expect(screen.queryByRole("status")).toBeNull();
      release();
      await waitFor(() => expect(chunk.loaded).toBe(1));
      await act(async () => undefined);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.queryByRole("status")).toBeNull();
      expect(document.activeElement).toBe(trigger);
    },
  );

  it.each([
    ["dialog", 1024],
    ["sheet", 360],
  ])(
    "US-QS-07 · DS-40 a %s whose chunk is pending closes on Escape while the status shows, and the status goes",
    async (_kind, width) => {
      const ResponsiveModal = await freshResponsiveModal();
      setViewportWidth(width);
      const release = holdChunk();
      render(
        <ResponsiveModal title="Pflanze bearbeiten" trigger={<button>Öffnen</button>}>
          <button>Speichern</button>
        </ResponsiveModal>,
      );
      const trigger = screen.getByRole("button", { name: "Öffnen" });
      await userEvent.click(trigger);
      expect((await screen.findByRole("status")).textContent).toBe("Fenster wird geladen …");
      await userEvent.keyboard("{Escape}");
      expect(screen.queryByRole("status")).toBeNull();
      release();
      await waitFor(() => expect(chunk.loaded).toBe(1));
      await act(async () => undefined);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.queryByRole("status")).toBeNull();
      expect(document.activeElement).toBe(trigger);
    },
  );

  it.each([
    ["dialog", 1024],
    ["sheet", 360],
  ])(
    "US-QS-07 · DS-40 after Escape on a pending %s, a later open works and opens the window",
    async (_kind, width) => {
      const ResponsiveModal = await freshResponsiveModal();
      setViewportWidth(width);
      const release = holdChunk();
      render(
        <ResponsiveModal title="Pflanze bearbeiten" trigger={<button>Öffnen</button>}>
          <button>Speichern</button>
        </ResponsiveModal>,
      );
      const trigger = screen.getByRole("button", { name: "Öffnen" });
      await userEvent.click(trigger);
      await userEvent.keyboard("{Escape}");
      release();
      await waitFor(() => expect(chunk.loaded).toBe(1));
      await act(async () => undefined);
      expect(screen.queryByRole("dialog")).toBeNull();
      await userEvent.click(trigger);
      expect(await screen.findByRole("dialog", { name: "Pflanze bearbeiten" })).toBeTruthy();
      expect(screen.queryByRole("status")).toBeNull();
    },
  );

  it.each([
    ["dialog", 1024],
    ["sheet", 360],
  ])(
    "US-QS-07 · DS-40 with the real %s open, Escape calls onOpenChange once, not twice",
    async (_kind, width) => {
      const ResponsiveModal = await freshResponsiveModal();
      setViewportWidth(width);
      const onOpenChange = vi.fn();
      render(
        <ResponsiveModal title="Pflanze bearbeiten" open onOpenChange={onOpenChange}>
          <button>Speichern</button>
        </ResponsiveModal>,
      );
      await screen.findByRole("dialog", { name: "Pflanze bearbeiten" });
      await userEvent.keyboard("{Escape}");
      expect(onOpenChange).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    },
  );
});
