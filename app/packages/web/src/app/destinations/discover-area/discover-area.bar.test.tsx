// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, it, vi } from "vitest";
import { FeaturesProvider } from "@/shared/data";
import {
  expectTitleInBar,
  renderInTopBar,
} from "@/shared/patterns/navigation/page-header/app-bar-slot/app-bar-slot.test-helpers";
import { AnnouncerProvider } from "@/shared/platform/announcer/announcer";
import { DiscoverArea } from "./discover-area";

beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe("US-QS-32 · SG-HEAD-01 Entdecken puts its title into the top bar", () => {
  it.each(["/discover", "/discover?view=catalog"])(
    'US-QS-32 below md %s has one h1, "Entdecken", in the bar, and the brand is not shown',
    async (entry) => {
      vi.stubGlobal(
        "fetch",
        vi.fn<typeof fetch>(async (url) => {
          const path = new URL(String(url)).pathname;
          if (path === "/species") return response(200, { species: [] });
          return response(200, {});
        }),
      );
      renderInTopBar(
        <FeaturesProvider features={undefined}>
          <AnnouncerProvider>
            <DiscoverArea
              api="http://api"
              token={async () => "tok"}
              onChoose={() => {}}
              profileSection={() => null}
            />
          </AnnouncerProvider>
        </FeaturesProvider>,
        entry,
      );
      await screen.findByRole("group", { name: /Entdecken|Ansicht/ });
      expectTitleInBar("Entdecken");
    },
  );
});
