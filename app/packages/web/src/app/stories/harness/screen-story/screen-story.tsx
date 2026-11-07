import type { StoryObj } from "@storybook/react-vite";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import type { ReactElement } from "react";
import { createQueryClient } from "@/shared/data";
import { AppShell } from "@/app/frame/app-shell/app-shell";
import { navItems, viewTitle } from "@/shared/patterns/navigation/navigation/navigation";
import { fakeFetch, type Routes } from "../fake-api.fixtures";

// The page stories render the real screen inside the real page frame (US-QS-14). Server state lives in a query client
// that a loader fills before the story renders, so the story starts with its data and never shows a skeleton.
const LOADING = /laden|geladen|lädt/i;
/** Milliseconds between two looks at the screen: one poll of `warm`. */
export const POLL_MS = 10;
/**
 * The longest time a page story waits for its screen, in ms (FR-QG-03). Measured with the timing rows of this harness
 * on the devbox at two workers and normal load: 17 warm-ups in 6 test files. The first warm-up of a path took 357 to
 * 1 926 ms (slowest: `/today` in heute.test.tsx, 129 polls, median poll gap 12 ms); repeated warm-ups took 58 to 81 ms.
 * 300 polls cover 3.0 s at the 10 ms timer and about 3.6 s at the measured gap, so a cold start on a loaded runner ran
 * out of polls while the work was still running. 10 s leaves about 5x headroom over the slowest measured start. The
 * page-story tests raise their test timeout above it (`prepareStories`), so this budget decides when a wait ends.
 */
export const SETTLE_BUDGET_MS = 10_000;
/** The screen counts as loaded when it stayed quiet for this many polls: a finished request starts the next lazy part. */
const QUIET_POLLS = 3;

function frame(client: QueryClient, path: string, screen: ReactElement) {
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AppShell titleOf={viewTitle} items={navItems({})}>
          {/* The page frame of the app: the width cap is lifted for a destination with layers (US-QS-15, #1027). */}
          <div className="mx-auto w-full max-w-180 has-[[data-layer-host]]:max-w-none">
            {screen}
          </div>
        </AppShell>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const loading = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('[role="status"]')).some((e) => LOADING.test(e.textContent));

/**
 * Renders the screen off screen until nothing loads any more: lazy parts are fetched and requests are cached. The
 * off-screen copy stays mounted while the story runs, so data that is dropped when no view uses it (forms) stays too.
 * It waits for at most `SETTLE_BUDGET_MS` of time, not for a count of polls: under load a poll takes longer, and a
 * cold start that needs seconds must not run out of polls first (FR-QG-03).
 */
export async function warm(client: QueryClient, path: string, screen: ReactElement) {
  const host = document.createElement("div");
  const root = createRoot(host);
  root.render(frame(client, path, screen));
  const started = performance.now();
  let polls = 0;
  let quiet = 0;
  while (performance.now() - started < SETTLE_BUDGET_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    polls++;
    const settled = host.childElementCount > 0 && client.isFetching() === 0 && !loading(host);
    quiet = settled ? quiet + 1 : 0;
    if (quiet >= QUIET_POLLS) return () => root.unmount();
  }
  const elapsed = Math.round(performance.now() - started);
  root.unmount();
  throw new Error(
    `The screen ${path} did not finish loading: ${elapsed} ms and ${polls} polls (budget ${SETTLE_BUDGET_MS} ms)`,
  );
}

export type ScreenOptions = {
  /** Address of the screen, e.g. `/collection?view=wishlist`. */
  path: string;
  screen: ReactElement;
  /** The answers of the fake API. */
  routes: Routes;
};

/** One page story: the screen with its fixture data. Light/dark and the viewport come from `variants`. */
export function screenStory(options: ScreenOptions): StoryObj {
  const { path, screen, routes } = options;
  let client = createQueryClient();
  return {
    beforeEach: async () => {
      globalThis.fetch = fakeFetch(routes);
      client = createQueryClient();
      client.setDefaultOptions({
        queries: { ...client.getDefaultOptions().queries, staleTime: Infinity, gcTime: Infinity },
      });
      return warm(client, path, screen);
    },
    render: () => frame(client, path, screen),
  };
}

const desktop = { value: "desktop", isRotated: false };

/**
 * The four reference states of a screen: phone (360 px) and desktop (1280 px), each in light and dark. Name the
 * exports `<State>Phone`, `<State>PhoneDark`, `<State>Desktop`, `<State>DesktopDark`: the visual regression (FR-QG-27)
 * snapshots only the phone story, at every size and scheme, and recognises the other three by that name, because the
 * globals they set would override the scheme of the screenshot run (Storybook cannot index a tag set at runtime).
 */
export function variants(base: StoryObj) {
  return {
    phone: base,
    phoneDark: { ...base, globals: { colorScheme: "dark" } },
    desktop: { ...base, globals: { viewport: desktop } },
    desktopDark: { ...base, globals: { viewport: desktop, colorScheme: "dark" } },
  } satisfies Record<string, StoryObj>;
}

/** Added to the meta of every page story file: the 1280 px preset next to the phone and tablet of the preview. */
export const pageParameters = {
  viewport: {
    options: {
      desktop: { name: "Desktop 1280x800", styles: { width: "1280px", height: "800px" } },
    },
  },
};
