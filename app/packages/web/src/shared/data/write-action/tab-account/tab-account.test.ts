// @vitest-environment jsdom
// US-QS-07 · a stale tab (loaded under account A while another tab signed in as B) sends no write under B's token and
// buffers none (P-04, P-10). The device's sign-in is the storage of the sign-in library (`oidc.user:*`), shared by every
// tab of the origin; the check runs before a request is sent, so a token read earlier cannot send it either.
import { ERROR_TEXTS } from "@pflanzendex/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { call, createWrite, tabAccount } from "../../api";
import { accountRefusal, signedInSub } from "./tab-account";

const USER_KEY = "oidc.user:http://localhost:18081/realms/pflanzendex:pflanzendex-web";
const OTHER_TAB = ERROR_TEXTS["access.account_in_other_tab"];
const NOT_SIGNED_IN = ERROR_TEXTS["access.not_signed_in"];

/** The account the tab's session loaded (the slot the session sets, US-QS-07). */
const recordTabAccount = (sub: string | null | undefined) => {
  tabAccount.sub = sub;
};

/** Signs the device in as `sub`, or out for `null`, the way the sign-in library keeps its user. */
function signInAs(sub: string | null) {
  if (sub === null) window.localStorage.removeItem(USER_KEY);
  else
    window.localStorage.setItem(
      USER_KEY,
      JSON.stringify({ access_token: `token-of-${sub}`, profile: { sub } }),
    );
}

const online = (state: boolean) =>
  vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(state);

const sentWith = (fetchFn: ReturnType<typeof vi.fn>) =>
  fetchFn.mock.calls.map(([, init]) => (init?.headers as Record<string, string>).Authorization);

const okFetch = () => vi.fn<typeof fetch>(async () => new Response("{}", { status: 201 }));

afterEach(() => {
  recordTabAccount(undefined);
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("US-QS-07 · the account the tab loaded decides what its writes may do (P-04)", () => {
  it("US-QS-07 a tab that has not loaded an account refuses nothing: writes behave as before", () => {
    recordTabAccount(undefined);
    signInAs("B");
    expect(accountRefusal()).toBeUndefined();
    signInAs(null);
    expect(accountRefusal()).toBeUndefined();
  });

  it("US-QS-07 the device still signed in as the tab's account: nothing is refused", () => {
    recordTabAccount("A");
    signInAs("A");
    expect(accountRefusal()).toBeUndefined();
  });

  it("US-QS-07 another account signed in on the device: refused with access.account_in_other_tab and its ERROR_TEXTS text", () => {
    recordTabAccount("A");
    signInAs("B");
    expect(accountRefusal()).toEqual({ code: "access.account_in_other_tab", text: OTHER_TAB });
  });

  it("US-QS-07 no account signed in on the device (signed out in another tab): refused as access.not_signed_in", () => {
    recordTabAccount("A");
    signInAs(null);
    expect(accountRefusal()).toEqual({ code: "access.not_signed_in", text: NOT_SIGNED_IN });
  });

  it("US-QS-07 a session that loaded a sign-in without an account refuses every write, fail closed (P-04)", () => {
    recordTabAccount(null);
    signInAs(null);
    expect(accountRefusal()?.code).toBe("access.not_signed_in");
    signInAs("A");
    expect(accountRefusal()?.code).toBe("access.not_signed_in");
  });

  it("US-QS-07 unreadable sign-in storage counts as no account, so a write is refused, not guessed (P-04)", () => {
    recordTabAccount("A");
    window.localStorage.setItem(USER_KEY, "{not json");
    expect(signedInSub()).toBeUndefined();
    expect(accountRefusal()?.code).toBe("access.not_signed_in");
  });

  it("US-QS-07 two kept users of different accounts count as no account (fail closed)", () => {
    recordTabAccount("A");
    signInAs("A");
    window.localStorage.setItem(
      "oidc.user:https://other.example/realms/x:pflanzendex-web",
      JSON.stringify({ access_token: "token-of-B", profile: { sub: "B" } }),
    );
    expect(signedInSub()).toBeUndefined();
    expect(accountRefusal()?.code).toBe("access.not_signed_in");
  });

  it("US-QS-07 the signed-in account is read from the stored user's profile, and only from the sign-in keys", () => {
    window.localStorage.setItem("some.other.key", JSON.stringify({ profile: { sub: "X" } }));
    expect(signedInSub()).toBeUndefined();
    signInAs("A");
    expect(signedInSub()).toBe("A");
  });
});

describe("US-QS-07 · an online write of a tab that loaded another account is refused before it is sent", () => {
  beforeEach(() => {
    signInAs("A");
    recordTabAccount("A");
  });

  it("US-QS-07 the device signed in as B, the tab loaded A: nothing is sent, the refusal has the code and its text", async () => {
    online(true);
    signInAs("B");
    const fetchFn = okFetch();
    const r = await createWrite("http://api", "token-of-B", { key: "k", fetchFn })(
      "POST",
      "/measurements",
      { value: 9 },
    );
    expect(fetchFn).not.toHaveBeenCalled();
    expect(r).toEqual({
      ok: false,
      error: { code: "access.account_in_other_tab", text: OTHER_TAB },
    });
  });

  it('US-QS-07 a bulk write without an id in its route ("Alle freigeben") is refused the same way', async () => {
    online(true);
    signInAs("B");
    const fetchFn = okFetch();
    const r = await createWrite("http://api", "token-of-B", { key: "k", fetchFn })(
      "PUT",
      "/friends/sharing",
      { share: true },
    );
    expect(fetchFn).not.toHaveBeenCalled();
    expect(!r.ok && r.error.code).toBe("access.account_in_other_tab");
  });

  it("US-QS-07 a direct write through call (no createWrite) is refused under another account too", async () => {
    online(true);
    signInAs("B");
    const fetchFn = okFetch();
    const r = await call(fetchFn, "http://api/registration/invitation", "token-of-B", {
      method: "POST",
      body: { code: "x" },
    });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(!r.ok && r.error.code).toBe("access.account_in_other_tab");
  });

  it("US-QS-07 a read (GET) through call is refused under another account too: nothing is sent, the refusal has the code", async () => {
    online(true);
    signInAs("B");
    const fetchFn = okFetch();
    const r = await call(fetchFn, "http://api/today", "token-of-B");
    expect(fetchFn).not.toHaveBeenCalled();
    expect(r).toEqual({
      ok: false,
      error: { code: "access.account_in_other_tab", text: OTHER_TAB },
    });
  });

  it("US-QS-07 a read (GET) through call after a sign-out in another tab is refused as access.not_signed_in", async () => {
    online(true);
    signInAs(null);
    const fetchFn = okFetch();
    const r = await call(fetchFn, "http://api/today", "token-of-A");
    expect(fetchFn).not.toHaveBeenCalled();
    expect(!r.ok && r.error.code).toBe("access.not_signed_in");
  });

  it("US-QS-07 a read (GET) through call is sent with the token while the device is still signed in as the tab's account A", async () => {
    online(true);
    const fetchFn = okFetch();
    const r = await call(fetchFn, "http://api/today", "token-of-A");
    expect(r.ok).toBe(true);
    expect(sentWith(fetchFn)).toEqual(["Bearer token-of-A"]);
  });

  it("US-QS-07 a read (GET) of a tab that loaded no account is sent as before, whoever is signed in", async () => {
    recordTabAccount(undefined);
    online(true);
    signInAs("B");
    const fetchFn = okFetch();
    await call(fetchFn, "http://api/today", "token-of-B");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("US-QS-07 the device still signed in as the tab's account A: the write is sent with A's token", async () => {
    online(true);
    const fetchFn = okFetch();
    const r = await createWrite("http://api", "token-of-A", { key: "k", fetchFn })(
      "POST",
      "/measurements",
      { value: 9 },
    );
    expect(r.ok).toBe(true);
    expect(sentWith(fetchFn)).toEqual(["Bearer token-of-A"]);
  });

  it("US-QS-07 signed out in another tab: refused as access.not_signed_in, nothing sent", async () => {
    online(true);
    signInAs(null);
    const fetchFn = okFetch();
    const r = await createWrite("http://api", "token-of-A", { key: "k", fetchFn })(
      "POST",
      "/measurements",
      { value: 9 },
    );
    expect(fetchFn).not.toHaveBeenCalled();
    expect(!r.ok && r.error.code).toBe("access.not_signed_in");
  });

  it("US-QS-07 a tab that loaded no account sends as before, whoever is signed in", async () => {
    recordTabAccount(undefined);
    online(true);
    signInAs("B");
    const fetchFn = okFetch();
    const r = await createWrite("http://api", "token-of-B", { key: "k", fetchFn })(
      "POST",
      "/measurements",
      { value: 9 },
    );
    expect(r.ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("US-QS-07 · an offline write goes to the buffer, which refuses another account (outbox.test.tsx)", () => {
  it("US-QS-07 offline, the device signed in as B: the write is handed to the buffer and nothing is sent here", async () => {
    recordTabAccount("A");
    online(false);
    signInAs("B");
    const fetchFn = okFetch();
    const buffer = vi.fn(async () => ({ ok: true as const, value: {} }));
    await createWrite("http://api", "token-of-B", { key: "k", fetchFn, buffer })(
      "POST",
      "/measurements",
      { value: 9 },
    );
    expect(buffer).toHaveBeenCalledTimes(1);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
