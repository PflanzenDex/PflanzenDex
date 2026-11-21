// @vitest-environment jsdom
import { cleanup } from "@testing-library/react";
import type { Distribution } from "@pflanzendex/core";
import { afterEach, describe, it, vi } from "vitest";
import {
  expectTitleInBar,
  renderInTopBar,
} from "@/shared/patterns/navigation/page-header/app-bar-slot/app-bar-slot.test-helpers";
import { pagesOf, summaryOf } from "../specimens/tests/plants-test-helpers";
import { PlantsScreen } from "./plants-screen";

afterEach(cleanup);

const distribution = { zones: [], thinnest: [], hint: null } as unknown as Distribution;

describe("US-QS-32 · SG-HEAD-01 the plants screen on its own puts its title into the top bar", () => {
  it('US-QS-32 below md without a host the title "Sammlung" is the one h1, in the bar, and the brand waits', () => {
    renderInTopBar(
      <PlantsScreen
        cards={[]}
        plants={pagesOf([])}
        summary={summaryOf([])}
        distribution={distribution}
        archived={[]}
        photoAccess={{ api: "http://api", token: async () => "tok" }}
        onSpeciesChoose={vi.fn()}
        onManage={vi.fn()}
        onRestore={vi.fn()}
        onArchivedCatchDate={vi.fn()}
      />,
    );
    expectTitleInBar("Sammlung");
  });
});
