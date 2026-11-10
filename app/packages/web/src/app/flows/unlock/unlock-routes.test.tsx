// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppRoutes } from "../../routes";
import { UnlocksProvider } from "./model/unlocks/unlocks";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const entry = (id: string, state: "open" | "locked") => ({
  id,
  state,
  announced: true,
  reasons: state === "locked" ? [{ kind: "specimens", needed: 5, have: 2 }] : [],
  ways: state === "locked" ? [{ kind: "add_specimens", missing: 3 }] : [],
  mayUnlockNow: state === "locked",
});

const renderAt = (path: string, functions: unknown[]) => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url) =>
      new URL(String(url)).pathname === "/onboarding/unlocks"
        ? response(200, { functions })
        : response(200, { friends: [], incoming: [], outgoing: [] }),
    ),
  );
  return render(
    <MemoryRouter initialEntries={[path]}>
      <UnlocksProvider api="http://api.test" token={async () => "tok"}>
        <AppRoutes
          api="http://api.test"
          session={{ token: async () => "tok" } as never}
          account={{ id: "1" } as never}
          onOpen={() => undefined}
          onOpenProfile={() => undefined}
          handOver={{
            newSpecies: null,
            setNewSpecies: () => undefined,
            choose: () => undefined,
            toTheCatalog: () => undefined,
            toAddPlant: () => undefined,
            onCreated: () => undefined,
            startFromWish: () => undefined,
          }}
        />
      </UnlocksProvider>
    </MemoryRouter>,
  );
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The page's own h1, not the one of the loading skeleton (issue 1097). */
const pageHeading = () =>
  waitFor(() => {
    const h = screen.getByRole("heading", { level: 1 });
    expect(h.hasAttribute("data-route-fallback")).toBe(false);
    return h;
  });

describe("US-ONB-05 routes of locked functions", () => {
  it("US-ONB-05 the address of a locked destination opens the lock page, never a blank page or a redirect", async () => {
    renderAt("/friends", [entry("friends", "locked")]);
    // The loading skeleton names the destination too (issue 1097); the lock page brings its own heading and button.
    expect(await screen.findByRole("button", { name: "Jetzt freischalten" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Freunde" })).toBeTruthy();
  });

  it("US-ONB-05 the exchange shows its own lock page while swapping is locked", async () => {
    renderAt("/friends/exchange", [entry("swapping", "locked")]);
    expect(await screen.findByRole("heading", { level: 1, name: "Tauschen" })).toBeTruthy();
  });

  it("US-ONB-05 / FR-ONB-06 with everything open (style many) the address opens the function as before", async () => {
    renderAt("/friends", [entry("friends", "open")]);
    await pageHeading();
    expect(screen.queryByRole("button", { name: "Jetzt freischalten" })).toBeNull();
    expect(screen.queryByText("Noch gesperrt")).toBeNull();
  });

  it("US-ONB-05 · FR-ONB-04 a usable target shows no locked row: the wishlist in the Sammlung opens without Noch gesperrt", async () => {
    renderAt("/collection?view=wishlist", [
      entry("wishlist", "locked"),
      entry("equipment", "locked"),
    ]);
    await pageHeading();
    expect(screen.queryByRole("link", { name: /Wunschliste: lege noch 3 Pflanzen an/ })).toBeNull();
    expect(screen.queryByText(/Noch gesperrt/)).toBeNull();
    expect(screen.queryByRole("link", { name: /Geräte:/ })).toBeNull();
  });
});
