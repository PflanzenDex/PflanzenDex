// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, it, vi } from "vitest";
import {
  expectTitleInBar,
  renderInTopBar,
} from "@/shared/patterns/navigation/page-header/app-bar-slot/app-bar-slot.test-helpers";
import { EquipmentPage } from "./equipment-page";

beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-QS-32 · SG-HEAD-01 the equipment page on its own puts its title into the top bar", () => {
  it("US-QS-32 below md without a host the title of a page that cannot load is the one h1, in the bar, and the brand waits", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(
        async () =>
          new Response(
            JSON.stringify({ error: { code: "server.error", text: "Nicht erreichbar." } }),
            {
              status: 500,
            },
          ),
      ),
    );
    renderInTopBar(<EquipmentPage api="http://api" token={async () => "tok"} />);
    await screen.findByRole("button", { name: "Erneut versuchen" });
    expectTitleInBar("Geräte");
  });
});
