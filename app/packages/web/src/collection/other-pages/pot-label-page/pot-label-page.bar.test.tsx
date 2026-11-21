// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { afterEach, describe, it, vi } from "vitest";
import {
  expectTitleInBar,
  renderInTopBar,
} from "@/shared/patterns/navigation/page-header/app-bar-slot/app-bar-slot.test-helpers";
import { PotLabelPage } from "./pot-label-page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-QS-32 · SG-HEAD-01 the pot label puts its title into the top bar", () => {
  it('US-QS-32 below md a label without a plant has the one h1 "Etikett" in the bar, and the state\'s title is a section', async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(
        async () =>
          new Response(
            JSON.stringify({
              error: { code: "specimen.not_found", text: "Diese Pflanze gibt es nicht." },
            }),
            { status: 404 },
          ),
      ),
    );
    renderInTopBar(
      <Routes>
        <Route
          path="/label/:id"
          element={<PotLabelPage api="http://api" token={async () => "tok"} />}
        />
      </Routes>,
      "/label/unbekannt",
    );
    await screen.findByRole("heading", { level: 2, name: "Etikett ohne Pflanze" });
    expectTitleInBar("Etikett");
  });
});
