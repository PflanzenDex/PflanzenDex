// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { setViewportWidth } from "@/shared/testing/viewport-mock";

// A chunk that waits until the test releases it, as on a slow network (as in the responsive-modal loading-state test).
// `loaded` counts the chunks that arrived since the last `holdChunk`.
const chunk = vi.hoisted(() => ({ hold: null as Promise<void> | null, loaded: 0 }));
vi.mock("@/shared/platform/routing/lazy-page/lazy-page", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("@/shared/platform/routing/lazy-page/lazy-page")>();
  return {
    ...real,
    lazyPage: ((load: Parameters<typeof real.lazyPage>[0]) =>
      real.lazyPage(async () => {
        if (chunk.hold) await chunk.hold;
        const loaded = await load();
        chunk.loaded += 1;
        return loaded;
      })) as typeof real.lazyPage,
  };
});

/** Holds the chunk until the returned function is called. */
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

type ProviderModule =
  typeof import("@/shared/platform/device/keyboard/shortcut-provider/shortcut-provider");
type OverviewModule =
  typeof import("@/shared/platform/device/keyboard/shortcut-overview/shortcut-overview");

let provider: ProviderModule;
let overview: OverviewModule;

// A fresh copy of the provider and the overview for each test: a chunk that is held here is not loaded by an earlier test.
beforeEach(async () => {
  vi.resetModules();
  provider = await import("@/shared/platform/device/keyboard/shortcut-provider/shortcut-provider");
  overview = await import("@/shared/platform/device/keyboard/shortcut-overview/shortcut-overview");
});

afterEach(() => {
  chunk.hold = null;
  cleanup();
});

const TARGETS = {
  search: "/discover?view=catalog",
  today: "/today",
  collection: "/collection",
  species: "/collection?view=species",
  wishlist: "/collection?view=wishlist",
};

/**
 * A page with a control for Back and one that changes only the search parameters. The buttons stand for the browser
 * Back and a history change of the search: both reach the router the same way. The test finds them by text and clicks
 * with `fireEvent`: an open modal hides the page from the accessibility tree and blocks the pointer.
 */
function Page() {
  const navigate = useNavigate();
  const at = useLocation();
  return (
    <main>
      <span data-testid="location">{at.pathname + at.search}</span>
      <button type="button" onClick={() => navigate(-1)}>
        Zurück
      </button>
      <button
        type="button"
        onClick={() => navigate({ pathname: at.pathname, search: "?view=wishlist" })}
      >
        Ansicht wechseln
      </button>
    </main>
  );
}

/** The overview as the app shell renders it: the open state comes from the provider. */
function OverviewHost() {
  const s = provider.useShortcuts();
  const Overview = overview.ShortcutOverview;
  return (
    <Overview open={s.overviewOpen} onOpenChange={s.setOverviewOpen} rows={s.rows} off={false} />
  );
}

/** The app with the provider; it starts on `/today` with `/other` behind it, so Back leads to `/other`. */
function renderApp() {
  const Provider = provider.ShortcutProvider;
  return render(
    <MemoryRouter initialEntries={["/other", "/today"]} initialIndex={1}>
      <Provider mode="plain" targets={TARGETS}>
        <Page />
        <OverviewHost />
      </Provider>
    </MemoryRouter>,
  );
}

const openWithKey = () =>
  fireEvent.keyDown(document.body, { key: "?", code: "Slash", shiftKey: true });
const location = () => screen.getByTestId("location").textContent;

describe("US-QS-07 · DS-40 leaving the page ends an overview whose window is still loading", () => {
  it.each([
    ["dialog", 1024],
    ["sheet", 360],
  ])(
    "US-QS-07 · DS-40 with the %s overview's chunk pending, Back ends the wait: the status goes and nothing opens on the new page",
    async (_kind, width) => {
      setViewportWidth(width);
      const release = holdChunk();
      renderApp();
      openWithKey();
      expect((await screen.findByRole("status")).textContent).toBe("Fenster wird geladen …");
      fireEvent.click(screen.getByText("Zurück"));
      expect(location()).toBe("/other");
      expect(screen.queryByRole("status")).toBeNull();
      release();
      await waitFor(() => expect(chunk.loaded).toBe(1));
      await act(async () => undefined);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.queryByRole("status")).toBeNull();
    },
  );

  it.each([
    ["dialog", 1024],
    ["sheet", 360],
  ])(
    "US-QS-07 · DS-40 an open %s overview closes when Back changes the page",
    async (_kind, width) => {
      setViewportWidth(width);
      renderApp();
      openWithKey();
      expect(await screen.findByRole("dialog")).toBeTruthy();
      fireEvent.click(screen.getByText("Zurück"));
      expect(location()).toBe("/other");
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    },
  );

  it.each([
    ["dialog", 1024],
    ["sheet", 360],
  ])(
    "US-QS-07 · DS-40 a change of the search parameters alone keeps an open %s overview open",
    async (_kind, width) => {
      setViewportWidth(width);
      renderApp();
      openWithKey();
      expect(await screen.findByRole("dialog")).toBeTruthy();
      fireEvent.click(screen.getByText("Ansicht wechseln"));
      expect(location()).toBe("/today?view=wishlist");
      expect(screen.getByRole("dialog")).toBeTruthy();
    },
  );
});
