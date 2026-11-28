// @vitest-environment jsdom
// US-QS-07 · a loader outside `useRequest` reads through `call`: a tab that loaded another account than the one signed in
// on the device sends no request with that account's token and caches nothing of it (P-04, P-05).
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tabAccount } from "@/shared/data/api";
import { usePlaces } from "./use-places";

const USER_KEY = "oidc.user:http://localhost:18081/realms/pflanzendex:pflanzendex-web";

const signInAs = (sub: string) =>
  window.localStorage.setItem(
    USER_KEY,
    JSON.stringify({ access_token: `token-of-${sub}`, profile: { sub } }),
  );

afterEach(() => {
  tabAccount.sub = undefined;
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe("US-QS-07 · the places of the first-plant question in a stale tab (P-04, P-05)", () => {
  it("US-QS-07 the tab loaded A, the device is signed in as B: no request is sent and the question shows the refusal", async () => {
    tabAccount.sub = "A";
    signInAs("B");
    const fetchFn = vi.fn<typeof fetch>(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchFn);
    const { result } = renderHook(() => usePlaces("http://api", async () => "token-of-B"));
    await waitFor(() => expect(result.current.error?.code).toBe("access.account_in_other_tab"));
    expect(fetchFn).not.toHaveBeenCalled();
    expect(result.current.places).toBeNull();
  });
});
