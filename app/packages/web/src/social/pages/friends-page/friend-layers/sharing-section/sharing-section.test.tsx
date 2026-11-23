// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { AnnouncerProvider } from "@/shared/platform/announcer/announcer";
import { drainOutbox } from "@/shared/testing/test-setup/drain-outbox";
import type { FriendsData } from "../../../../api/friends-api";
import { SharingSection } from "./sharing-section";

// The buffer sends a write under the account it was made under (US-QS-07): the device is signed in as one account.
beforeEach(() =>
  window.localStorage.setItem(
    "oidc.user:http://localhost:18081/realms/pflanzendex:pflanzendex-web",
    JSON.stringify({ access_token: "tok", profile: { sub: "keeper-a" } }),
  ),
);

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  // The buffer is shared by the whole file: a write this test left in it would be sent by the next test (US-QS-03).
  await drainOutbox();
});

const online = (state: boolean) =>
  vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(state);
/**
 * Waits until the three species are buffered: the note names the last one, which is said after the first two (US-QS-10).
 * The network comes back only then, because the buffer hears the `online` event once its first write is in it.
 */
const buffered = () =>
  waitFor(() =>
    expect(document.querySelector("[aria-live=polite]")?.textContent).toMatch(
      /Freigegeben: „Farn“/,
    ),
  );

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

/**
 * A key-enforcing server of the sharing routes: a key is applied once and its repeat gets the stored answer; a key that
 * comes back with another body is refused. The first answer on `lostOn` is lost (applied, the client sees a network error).
 */
function strictSharing(lostOn?: string) {
  const seen = new Map<string, string>();
  const keys: string[] = [];
  const applied: string[] = [];
  let lost = lostOn;
  const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
    const key = (init?.headers as Record<string, string>)["Idempotency-Key"] ?? "";
    const path = String(url).replace("http://api", "");
    const body = String(init?.body ?? "");
    keys.push(key);
    const stored = seen.get(key);
    if (stored !== undefined && stored !== body)
      return new Response(
        JSON.stringify({ error: { code: "idempotency.key_conflict", text: "x" } }),
        { status: 409 },
      );
    if (stored === undefined) {
      seen.set(key, body);
      applied.push(`${init?.method} ${path}`);
    }
    if (lost !== undefined && path.includes(lost)) {
      lost = undefined;
      throw new TypeError("Failed to fetch");
    }
    return new Response(JSON.stringify({ changed: 1 }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchFn);
  return { fetchFn, keys, applied };
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
    await buffered();
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
    // One reload for the whole bulk, after the last species is delivered (US-QS-03: no double after()).
    expect(onWritten).toHaveBeenCalledTimes(1);
  });

  it("US-QS-03 · P-10 offline, one species refused on delivery: no blanket success claim, the delivery says its result", async () => {
    online(false);
    server("/sharing/species/sp2");
    renderSection();
    await userEvent.click(screen.getByRole("button", { name: "Alle teilen" }));
    await userEvent.click(screen.getByRole("button", { name: "Ja, alle teilen" }));
    await buffered();
    online(true);
    act(() => void window.dispatchEvent(new Event("online")));
    await waitFor(() =>
      expect(document.querySelector("[aria-live=polite]")?.textContent).toMatch(/Nicht gesendet/),
    );
    expect(document.querySelector("[aria-live=polite]")?.textContent).toMatch(
      /2 Änderungen nachträglich gesendet\./,
    );
    expect(document.body.textContent).not.toContain("Alle Pflanzen sind für Freunde freigegeben.");
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

  it("US-QS-03 · US-SOZ-04 a lost answer of the bulk share, repeated: the species keep their keys, none is written twice", async () => {
    online(true);
    const srv = strictSharing("/sharing/species/sp1");
    renderSection();
    await userEvent.click(screen.getByRole("button", { name: "Alle teilen" }));
    await userEvent.click(screen.getByRole("button", { name: "Ja, alle teilen" }));
    await waitFor(() => expect(srv.fetchFn).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole("button", { name: "Alle teilen" }));
    await userEvent.click(screen.getByRole("button", { name: "Ja, alle teilen" }));
    await waitFor(() => expect(srv.fetchFn).toHaveBeenCalledTimes(4));
    expect(srv.keys[1]).toBe(srv.keys[0]);
    expect(srv.applied).toEqual([
      "PUT /sharing/species/sp1",
      "PUT /sharing/species/sp2",
      "PUT /sharing/species/sp3",
    ]);
  });
});
