// @vitest-environment jsdom
// US-QS-07 · the export of the own data is a read with the sign-in token: a tab that loaded another account than the one
// signed in on the device sends no request and gets no archive of the other account (P-04, P-05).
import { afterEach, describe, expect, it, vi } from "vitest";
import { tabAccount } from "../shared/data/api";
import { fetchExport } from "./privacy-api";

const USER_KEY = "oidc.user:http://localhost:18081/realms/pflanzendex:pflanzendex-web";

const signInAs = (sub: string) =>
  window.localStorage.setItem(
    USER_KEY,
    JSON.stringify({ access_token: `token-of-${sub}`, profile: { sub } }),
  );

const archive = () =>
  vi.fn<typeof fetch>(
    async () => new Response("zip", { status: 200, headers: { "x-missing-photos": "2" } }),
  );

afterEach(() => {
  tabAccount.sub = undefined;
  window.localStorage.clear();
});

describe("US-QS-07 · the export of a stale tab (P-04, P-05)", () => {
  it("US-QS-07 the tab loaded A, the device is signed in as B: the request is not sent, the refusal has the code", async () => {
    tabAccount.sub = "A";
    signInAs("B");
    const fetchFn = archive();
    const r = await fetchExport("http://api", "token-of-B", fetchFn);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(!r.ok && r.error.code).toBe("access.account_in_other_tab");
  });

  it("US-QS-07 the device still signed in as the tab's account A: the archive comes with its count of missing photos", async () => {
    tabAccount.sub = "A";
    signInAs("A");
    const fetchFn = archive();
    const r = await fetchExport("http://api", "token-of-A", fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(r.ok && r.value.missingPhotos).toBe(2);
  });
});
