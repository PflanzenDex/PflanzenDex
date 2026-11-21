// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, it, vi } from "vitest";
import {
  expectTitleInBar,
  renderInTopBar,
} from "@/shared/patterns/navigation/page-header/app-bar-slot/app-bar-slot.test-helpers";
import { LayerHost } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { ToastProvider } from "@/shared/patterns/states/toast/toast-provider/toast-provider";
import { LightPage } from "./light-page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The answers of an account without zones and locations (the hints and the overview are empty lists). */
const BODIES: Record<string, unknown> = {
  "/light-zones": { zones: [] },
  "/locations": { locations: [] },
  "/hints": { hints: [] },
  "/specimens/light-overview": { rows: [] },
};

describe("US-QS-32 · SG-HEAD-01 the locations page on its own puts its title into the top bar", () => {
  it('US-QS-32 below md without a host the title "Standorte und Lichtzonen" is the one h1, in the bar, and the brand waits', async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => {
        const path = new URL(String(url)).pathname;
        return new Response(JSON.stringify(BODIES[path] ?? {}), { status: 200 });
      }),
    );
    renderInTopBar(
      <ToastProvider>
        <LayerHost>
          <LightPage api="http://api" token={async () => "tok"} />
        </LayerHost>
      </ToastProvider>,
    );
    await screen.findByRole("heading", { level: 1 });
    expectTitleInBar("Standorte und Lichtzonen");
  });
});
