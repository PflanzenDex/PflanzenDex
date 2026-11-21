// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, it, vi } from "vitest";
import {
  expectTitleInBar,
  renderInTopBar,
} from "@/shared/patterns/navigation/page-header/app-bar-slot/app-bar-slot.test-helpers";
import { WishlistPage } from "./wishlist-page";

beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const EMPTY_LIST = {
  candidates: [],
  zones: [],
  hint: { text: "Noch kein Wunsch.", nextAction: null },
  duplicates: [],
  unfit: [],
  duplicateHint: null,
  replenishment: {
    buffer: 2,
    zones: [],
    actions: { discover: false, suggestions: false },
    nextAction: null,
  },
};

describe("US-QS-32 · SG-HEAD-01 the wishlist on its own puts its title into the top bar", () => {
  it('US-QS-32 below md without a host the title "Wunschliste" is the one h1, in the bar, and the brand waits', async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => {
        const path = new URL(String(url)).pathname;
        const body =
          path === "/wishes/candidates"
            ? EMPTY_LIST
            : path === "/wishes/bought"
              ? { bought: [], hint: { text: "-", nextAction: null } }
              : path === "/wishes/discarded"
                ? { discarded: [], hint: { text: "-", nextAction: null } }
                : { species: [] };
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );
    renderInTopBar(<WishlistPage api="http://api" token={async () => "tok"} />);
    await screen.findByRole("heading", { level: 1 });
    expectTitleInBar("Wunschliste");
  });
});
