// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, it, vi } from "vitest";
import {
  expectTitleInBar,
  renderInTopBar,
} from "@/shared/patterns/navigation/page-header/app-bar-slot/app-bar-slot.test-helpers";
import { DifficultyPage } from "./difficulty-page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-QS-32 · SG-HEAD-01 the species comparison on its own puts its title into the top bar", () => {
  it('US-QS-32 below md without a host the title "Artenvergleich" is the one h1, in the bar, and the brand waits', async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ rows: [] }), { status: 200 })),
    );
    renderInTopBar(<DifficultyPage api="http://api" token={async () => "tok"} />);
    await screen.findByText("Noch keine Art mit aktiver Pflanze");
    expectTitleInBar("Artenvergleich");
  });
});
