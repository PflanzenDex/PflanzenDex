// @vitest-environment jsdom
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll, describe, it, vi } from "vitest";
import {
  expectTitleInBar,
  renderInTopBar,
} from "@/shared/patterns/navigation/page-header/app-bar-slot/app-bar-slot.test-helpers";
import { FriendsPage } from "./friends-page";

beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-QS-32 · SG-HEAD-01 Freunde puts its title into the top bar", () => {
  it('US-QS-32 below md the page has one h1, "Freunde", in the bar, and the brand is not shown', () => {
    // The data never arrives: the title stands before it, as the page's header is outside the load frame.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    renderInTopBar(<FriendsPage api="http://api" token={async () => "tok"} />);
    expectTitleInBar("Freunde");
  });
});
