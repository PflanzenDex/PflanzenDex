// @vitest-environment jsdom
import { cleanup } from "@testing-library/react";
import { afterEach, describe, it, vi } from "vitest";
import {
  expectTitleInBar,
  renderInTopBar,
} from "@/shared/patterns/navigation/page-header/app-bar-slot/app-bar-slot.test-helpers";
import { TreatmentsPage } from "./treatments-page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-QS-32 · SG-HEAD-01 the treatments page on its own puts its title into the top bar", () => {
  it('US-QS-32 below md without a host the title "Behandlung" is the one h1, in the bar, and the brand waits', () => {
    // The data never arrives: the title stands before it.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    renderInTopBar(<TreatmentsPage api="http://api" token={async () => "tok"} />);
    expectTitleInBar("Behandlung");
  });
});
