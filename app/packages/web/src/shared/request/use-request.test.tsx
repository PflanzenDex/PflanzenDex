// @vitest-environment jsdom
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tabAccount } from "@/shared/data/api";
import { RequestFailure } from "./query-client";
import { SIGN_IN } from "./response";
import { requestQueryFn, useInvalidate, useRequest, useRequestPages } from "./use-request";

const KEY = ["NFR-12", "US-ONB-01", "1795", "refetch"];
const token = async () => "tok";

/** Lets the refetch and the renders it causes run to their end. */
const settle = () => act(() => new Promise<void>((done) => setTimeout(done, 20)));

function Again() {
  const again = useInvalidate(KEY);
  return (
    <button type="button" onClick={again}>
      Neu laden
    </button>
  );
}

describe("NFR-12 · US-ONB-01 · #1795 a view that reads only the value of a request", () => {
  it("NFR-12 · US-ONB-01 · #1795 is not re-rendered when its refetch starts and ends", async () => {
    let loads = 0;
    let release!: () => void;
    const held = new Promise<void>((done) => (release = done));
    const renders = { n: 0 };
    // The first answer comes at once; the refetch waits until the test releases it.
    const load = async () => {
      loads += 1;
      if (loads > 1) await held;
      return { ok: true as const, value: "Monstera" };
    };
    function ValueOnly() {
      renders.n += 1;
      const r = useRequest({ queryKey: KEY, token, load });
      return <p>{r.value ?? "wird geladen"}</p>;
    }
    render(
      <>
        <ValueOnly />
        <Again />
      </>,
    );
    await screen.findByText("Monstera");
    await settle();
    const before = renders.n;

    await userEvent.click(screen.getByRole("button", { name: "Neu laden" }));
    await vi.waitFor(() => expect(loads).toBe(2));
    await settle();
    expect(renders.n).toBe(before);

    release();
    await settle();
    expect(renders.n).toBe(before);
    expect(screen.getByText("Monstera")).toBeTruthy();
  });
});

describe("DS-09 · US-QS-23 the query function of a request is one function, for the hook and for a prefetch (issue 2384)", () => {
  it("DS-09 · US-QS-23 it gives the value of an answer that is ok", async () => {
    const load = vi.fn(async () => ({ ok: true as const, value: "Monstera" }));
    expect(await requestQueryFn(token, load)()).toBe("Monstera");
    expect(load).toHaveBeenCalledWith("tok");
  });

  it("DS-09 · US-QS-23 it throws a RequestFailure with the error of a refusal (P-10), and with the sign-in error without a token", async () => {
    const error = { code: "specimen.not_found", text: "Nicht gefunden." };
    const refused = requestQueryFn(token, async () => ({ ok: false as const, error }))();
    await expect(refused).rejects.toBeInstanceOf(RequestFailure);
    await expect(refused).rejects.toMatchObject({ error });
    const load = vi.fn();
    const noToken = requestQueryFn(async () => undefined, load)();
    await expect(noToken).rejects.toMatchObject({ error: SIGN_IN });
    expect(load).not.toHaveBeenCalled();
  });
});

const USER_KEY = "oidc.user:http://localhost:18081/realms/pflanzendex:pflanzendex-web";

/** Signs the device in as `sub`, the way the sign-in library keeps its user (shared by every tab of the origin). */
const signInAs = (sub: string) =>
  window.localStorage.setItem(
    USER_KEY,
    JSON.stringify({ access_token: `token-of-${sub}`, profile: { sub } }),
  );

describe("US-QS-07 · a stale tab reads nothing under the account of another tab (P-04, P-05)", () => {
  afterEach(() => {
    tabAccount.sub = undefined;
    window.localStorage.clear();
  });

  it("US-QS-07 the tab loaded A, the device is signed in as B: load is not called and the error is access.account_in_other_tab", async () => {
    tabAccount.sub = "A";
    signInAs("B");
    const load = vi.fn(async () => ({ ok: true as const, value: "Daten von B" }));
    const refused = requestQueryFn(token, load)();
    await expect(refused).rejects.toBeInstanceOf(RequestFailure);
    await expect(refused).rejects.toMatchObject({ error: { code: "access.account_in_other_tab" } });
    expect(load).not.toHaveBeenCalled();
  });

  it("US-QS-07 the tab loaded A and the device is still signed in as A: load is called with the token", async () => {
    tabAccount.sub = "A";
    signInAs("A");
    const load = vi.fn(async () => ({ ok: true as const, value: "Daten von A" }));
    expect(await requestQueryFn(token, load)()).toBe("Daten von A");
    expect(load).toHaveBeenCalledWith("tok");
  });

  it("US-QS-07 the view of a stale tab ends in the error state with the code, and shows nothing of B", async () => {
    tabAccount.sub = "A";
    signInAs("B");
    const load = vi.fn(async () => ({ ok: true as const, value: "Daten von B" }));
    const { result } = renderHook(() =>
      useRequest({ queryKey: ["US-QS-07", "stale-tab"], token, load }),
    );
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error?.code).toBe("access.account_in_other_tab");
    expect(result.current.value).toBeUndefined();
    expect(load).not.toHaveBeenCalled();
  });

  it("US-QS-07 a list read in pages is refused the same way: no page of B is loaded", async () => {
    tabAccount.sub = "A";
    signInAs("B");
    const load = vi.fn(async () => ({
      ok: true as const,
      value: { next: null, rows: ["B"] },
    }));
    const { result } = renderHook(() =>
      useRequestPages({ queryKey: ["US-QS-07", "stale-tab-pages"], token, load }),
    );
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error?.code).toBe("access.account_in_other_tab");
    expect(result.current.pages).toEqual([]);
    expect(load).not.toHaveBeenCalled();
  });

  it("US-QS-07 a tab whose session loaded no account reads as before, whoever is signed in", async () => {
    tabAccount.sub = undefined;
    signInAs("B");
    const load = vi.fn(async () => ({ ok: true as const, value: "Monstera" }));
    expect(await requestQueryFn(token, load)()).toBe("Monstera");
  });
});
