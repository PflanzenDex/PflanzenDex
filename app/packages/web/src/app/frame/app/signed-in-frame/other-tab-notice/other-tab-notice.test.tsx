// @vitest-environment jsdom
// US-QS-07 · the tab tells the keeper when another tab signed in as another account: a persistent banner with a reload
// button, shown on the storage event of the sign-in (and on focus as a backstop); the writes of the tab are refused.
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tabAccount } from "@/shared/data/api";
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
