// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, it, vi } from "vitest";
import {
  expectTitleInBar,
  renderInTopBar,
} from "@/shared/patterns/navigation/page-header/app-bar-slot/app-bar-slot.test-helpers";
import { DiscoverPage } from "./discover-page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-QS-32 · SG-HEAD-01 the suggestions on their own put their title into the top bar", () => {
  it('US-QS-32 below md without the destination the title "Entdecken" is the one h1, in the bar, and the brand waits', async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(
        async () =>
          new Response(
            JSON.stringify({
              deck: 1,
              suggestions: [],
              zoneFilter: null,
              empty: {
                reason: "all_decided",
                text: "Keine neuen Vorschläge.",
                nextAction: "Schlage eine Art vor.",
              },
            }),
            { status: 200 },
          ),
      ),
    );
    renderInTopBar(<DiscoverPage api="http://api" token={async () => "tok"} />);
    await screen.findByRole("heading", { level: 1 });
    expectTitleInBar("Entdecken");
  });
});
