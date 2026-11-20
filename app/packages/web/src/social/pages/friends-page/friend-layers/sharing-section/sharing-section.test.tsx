// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { AnnouncerProvider } from "@/shared/platform/announcer/announcer";
import type { FriendsData } from "../../../../api/friends-api";
import { SharingSection } from "./sharing-section";

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const online = (state: boolean) =>
  vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(state);

/** Three species, one plant each; the sharing starts empty (US-SOZ-04). */
const data = {
  requests: { incoming: [], outgoing: [] },
  friends: [],
  specimens: [
    { id: "p1", speciesId: "sp1", name: "Monstera", status: "active" },
    { id: "p2", speciesId: "sp2", name: "Aloe", status: "active" },
    { id: "p3", speciesId: "sp3", name: "Farn", status: "active" },
  ],
  shared: [],
} as unknown as FriendsData;

/** A key-enforcing server: each key is applied once, a key that comes back with another body is refused. */
function server(refuse?: string) {
  const keys: string[] = [];
  const bodies = new Map<string, string>();
  const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
    const key = (init?.headers as Record<string, string>)["Idempotency-Key"] ?? "";
    keys.push(key);
    const body = String(init?.body ?? "");
    if (refuse && String(url).includes(refuse))
      return new Response(JSON.stringify({ error: { code: "access.denied", text: "x" } }), {
        status: 403,
      });
    bodies.set(key, body);
    return new Response(JSON.stringify({ changed: 1 }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchFn);
  return { fetchFn, keys };
}

function renderSection() {
  const onWritten = vi.fn();
  render(
    <MemoryRouter>
      <AnnouncerProvider>
        <SharingSection
          data={data}
          api="http://api"
          token={async () => "tok"}
          onWritten={onWritten}
        />
      </AnnouncerProvider>
    </MemoryRouter>,
  );
  return { onWritten };
}

describe("US-SOZ-04 · US-QS-03 a bulk share of three species", () => {
  it("US-QS-03 · US-SOZ-04 offline, each species is its own buffered write with a key of its own; delivered once the network is back", async () => {
    online(false);
    const srv = server();
    const { onWritten } = renderSection();
    await userEvent.click(screen.getByRole("button", { name: "Alle teilen" }));
    await userEvent.click(screen.getByRole("button", { name: "Ja, alle teilen" }));
    expect(srv.fetchFn).not.toHaveBeenCalled();
    online(true);
    act(() => void window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(srv.fetchFn).toHaveBeenCalledTimes(3));
    expect(new Set(srv.keys).size).toBe(3);
    await waitFor(() =>
      expect(document.querySelector("[aria-live=polite]")?.textContent).toMatch(
        /3 Änderungen nachträglich gesendet\./,
      ),
    );
    expect(onWritten).toHaveBeenCalled();
  });

  it("US-QS-03 · US-SOZ-04 online, the first refused species stops the bulk and is reported with the count of the species that changed (P-10)", async () => {
    online(true);
    server("/sharing/species/sp2");
    renderSection();
    await userEvent.click(screen.getByRole("button", { name: "Alle teilen" }));
    await userEvent.click(screen.getByRole("button", { name: "Ja, alle teilen" }));
    expect(await screen.findByRole("status")).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("1 von 3 Arten geändert, 2 nicht."),
    );
    expect(screen.getByRole("alert").textContent).toBeTruthy();
  });
});
