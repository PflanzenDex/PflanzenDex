import type { StoryObj } from "@storybook/react-vite";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import type { ReactElement } from "react";
import { createQueryClient } from "@/kernel";
import { AppShell } from "@/components/shared/navigation/app-shell/app-shell";
import {
  navItems,
  viewTitle,
} from "@/components/shared/navigation/nav-model/navigation/navigation";
import { fakeFetch, type Routes } from "../fake-api.fixtures";

// The page stories render the real screen inside the real page frame (US-QS-14). Server state lives in a query client
// that a loader fills before the story renders, so the story starts with its data and never shows a skeleton.
const LOADING = /laden|geladen|lädt/i;
const settleLimit = 300;
/** The screen counts as loaded when it stayed quiet for this many polls: a finished request starts the next lazy part. */
const QUIET_POLLS = 3;

function frame(client: QueryClient, path: string, screen: ReactElement) {
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AppShell titleOf={viewTitle} items={navItems({})}>
          <div className="mx-auto w-full max-w-180">{screen}</div>
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
 */
async function warm(client: QueryClient, path: string, screen: ReactElement) {
  const host = document.createElement("div");
  const root = createRoot(host);
  root.render(frame(client, path, screen));
  let quiet = 0;
  for (let i = 0; i < settleLimit; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    const settled = host.childElementCount > 0 && client.isFetching() === 0 && !loading(host);
    quiet = settled ? quiet + 1 : 0;
    if (quiet >= QUIET_POLLS) return () => root.unmount();
  }
  root.unmount();
  throw new Error(`The screen ${path} did not finish loading`);
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

/** The four reference states of a screen: phone (360 px) and desktop (1280 px), each in light and dark. */
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
