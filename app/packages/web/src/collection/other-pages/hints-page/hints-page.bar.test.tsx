// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, it, vi } from "vitest";
import {
  expectTitleInBar,
  renderInTopBar,
} from "@/shared/patterns/navigation/page-header/app-bar-slot/app-bar-slot.test-helpers";
import { HintsPage } from "./hints-page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-QS-32 · SG-HEAD-01 the hints page on its own puts its title into the top bar", () => {
  it('US-QS-32 below md without a host the title "Hinweise" is the one h1, in the bar, and the brand waits', async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => {
        const path = new URL(String(url)).pathname;
        const body = path === "/locations" ? { locations: [] } : { hints: [] };
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );
    renderInTopBar(
      <HintsPage api="http://api" token={async () => "tok"} onOpen={() => undefined} />,
    );
    await screen.findByRole("heading", { level: 1 });
    expectTitleInBar("Hinweise");
  });
});
