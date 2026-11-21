// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, it, vi } from "vitest";
import {
  expectTitleInBar,
  renderInTopBar,
} from "@/shared/patterns/navigation/page-header/app-bar-slot/app-bar-slot.test-helpers";
import { PokedexPage } from "./pokedex-page";

beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-QS-32 · SG-HEAD-01 the species page on its own puts its title into the top bar", () => {
  it('US-QS-32 below md without a host the title "Arten" is the one h1, in the bar, and the brand waits', async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => {
        const path = new URL(String(url)).pathname;
        const body =
          path === "/pokedex/ownership"
            ? { caught: [], unidentified: [] }
            : path === "/pokedex/tree"
              ? { tree: null }
              : { cards: [] };
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );
    renderInTopBar(<PokedexPage api="http://api" token={async () => "tok"} />);
    await screen.findByRole("heading", { level: 1 });
    expectTitleInBar("Arten");
  });
});
