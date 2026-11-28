// @vitest-environment jsdom
// US-QS-07 · the tab tells the keeper when another tab signed in as another account: a persistent banner with a reload
// button, shown on the storage event of the sign-in (and on focus as a backstop); the writes of the tab are refused.
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "@/shared/data";
import { tabAccount } from "@/shared/data/api";
import { useStoredPhoto } from "@/shared/platform/browser/use-stored-photo";
import { OtherTabNotice } from "./other-tab-notice";

const USER_KEY = "oidc.user:http://localhost:18081/realms/pflanzendex:pflanzendex-web";
const TEXT = "In einem anderen Tab ist jetzt ein anderes Konto angemeldet. Lade die Seite neu.";

/** The account the tab's session loaded (the slot the session sets, US-QS-07). */
const recordTabAccount = (sub: string | undefined) => {
  tabAccount.sub = sub;
};

function signInAs(sub: string | null) {
  if (sub === null) window.localStorage.removeItem(USER_KEY);
  else
    window.localStorage.setItem(
      USER_KEY,
      JSON.stringify({ access_token: `token-of-${sub}`, profile: { sub } }),
    );
  // Another tab changes the storage: this tab gets a storage event (a same-tab write fires none).
  act(() => void window.dispatchEvent(new StorageEvent("storage", { key: USER_KEY })));
}

/** Lets the check of the notice (a lazily loaded module) answer. */
const settle = () =>
  act(async () => {
    await new Promise((done) => setTimeout(done, 50));
  });

beforeEach(() => {
  signInAs("A");
  recordTabAccount("A");
});

afterEach(() => {
  cleanup();
  recordTabAccount(undefined);
  window.localStorage.clear();
});

describe("US-QS-07 · a tab notices a sign-in of another account in another tab", () => {
  it("US-QS-07 the device signed in as the tab's account: no notice", async () => {
    render(<OtherTabNotice reload={vi.fn()} />);
    await settle();
    expect(screen.queryByText(TEXT)).toBeNull();
  });

  it("US-QS-07 another tab signs in as B: the notice says so as a persistent banner with a reload button", async () => {
    render(<OtherTabNotice reload={vi.fn()} />);
    signInAs("B");
    expect(await screen.findByText(TEXT)).toBeDefined();
    expect(screen.getByRole("button", { name: "Seite neu laden" })).toBeDefined();
  });

  it("US-QS-07 the reload button reloads the page", async () => {
    const reload = vi.fn();
    render(<OtherTabNotice reload={reload} />);
    signInAs("B");
    await userEvent.click(await screen.findByRole("button", { name: "Seite neu laden" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("US-QS-07 the device signed in as the tab's account again: the notice goes", async () => {
    render(<OtherTabNotice reload={vi.fn()} />);
    signInAs("B");
    await screen.findByText(TEXT);
    signInAs("A");
    await waitFor(() => expect(screen.queryByText(TEXT)).toBeNull());
  });

  it("US-QS-07 signed out in another tab shows no account notice: a write then says that the keeper must sign in again", async () => {
    render(<OtherTabNotice reload={vi.fn()} />);
    signInAs(null);
    await settle();
    expect(screen.queryByText(TEXT)).toBeNull();
  });

  it("US-QS-07 a focus of the window checks the sign-in again, as a backstop for a missed storage event", async () => {
    render(<OtherTabNotice reload={vi.fn()} />);
    // Written without the storage event (the event was missed): only the focus shows it.
    window.localStorage.setItem(
      USER_KEY,
      JSON.stringify({ access_token: "token-of-B", profile: { sub: "B" } }),
    );
    act(() => void window.dispatchEvent(new Event("focus")));
    expect(await screen.findByText(TEXT)).toBeDefined();
  });

  it("US-QS-07 a tab whose session loaded no account shows no notice, whatever is signed in", async () => {
    recordTabAccount(undefined);
    render(<OtherTabNotice reload={vi.fn()} />);
    signInAs("B");
    await settle();
    expect(screen.queryByText(TEXT)).toBeNull();
  });
});

describe("US-QS-07 · a stale tab drops what it cached of the other account (P-04, P-05)", () => {
  const access = { api: "http://api", token: async () => "tok" };
  const PHOTO = "/specimens/s1/measurements/m1/photo";
  const KEY = ["US-QS-07", "plants"];
  let revoked: string[];

  beforeEach(() => {
    revoked = [];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(
        async () => ({ ok: true, status: 200, blob: async () => ({ size: 10 }) }) as Response,
      ),
    );
    URL.createObjectURL = vi.fn(() => "blob:photo");
    URL.revokeObjectURL = vi.fn((url: string) => void revoked.push(url));
  });

  afterEach(() => vi.unstubAllGlobals());

  /** The notice over a client of its own, with one cached query and one cached photo that nobody shows. */
  async function mountWithCaches() {
    const client = createQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const fill = async () => {
      client.setQueryData(KEY, "Pflanzen");
      const photo = renderHook(() => useStoredPhoto(access, PHOTO));
      await waitFor(() => expect(typeof photo.result.current).toBe("string"));
      photo.unmount();
    };
    await fill();
    render(<OtherTabNotice reload={vi.fn()} />, { wrapper });
    await settle();
    return { client, fill };
  }

  it("US-QS-07 the account of the tab keeps its caches: nothing is dropped while no other account is signed in", async () => {
    const { client } = await mountWithCaches();
    expect(client.getQueryData(KEY)).toBe("Pflanzen");
    expect(revoked).toEqual([]);
  });

  it("US-QS-07 another tab signs in as B: the query cache and the photo cache are emptied", async () => {
    const { client } = await mountWithCaches();
    signInAs("B");
    await screen.findByText(TEXT);
    expect(client.getQueryData(KEY)).toBeUndefined();
    expect(revoked).toEqual(["blob:photo"]);
  });

  it("US-QS-07 signed out in another tab: both caches are emptied too, the notice stays away", async () => {
    const { client } = await mountWithCaches();
    signInAs(null);
    await waitFor(() => expect(client.getQueryData(KEY)).toBeUndefined());
    expect(revoked).toEqual(["blob:photo"]);
    expect(screen.queryByText(TEXT)).toBeNull();
  });

  it("US-QS-07 back to the tab's account A: both caches are emptied again, so nothing of B stays", async () => {
    const { client, fill } = await mountWithCaches();
    signInAs("B");
    await screen.findByText(TEXT);
    // Something got in between (a request that was on its way when the check refused); the return to A drops it as well.
    tabAccount.sub = undefined;
    await fill();
    tabAccount.sub = "A";
    expect(client.getQueryData(KEY)).toBe("Pflanzen");
    revoked.length = 0;
    signInAs("A");
    await waitFor(() => expect(screen.queryByText(TEXT)).toBeNull());
    await waitFor(() => expect(client.getQueryData(KEY)).toBeUndefined());
    expect(revoked).toEqual(["blob:photo"]);
  });
});
