// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The sign-in service is a foreign system: UserManager is replaced, the session logic of the app runs for real.
const mgr = vi.hoisted(() => {
  const handler: Record<string, (() => void)[]> = {};
  return {
    handler,
    getUser: vi.fn(),
    removeUser: vi.fn(async () => undefined),
    signinCallback: vi.fn(),
    signinRedirect: vi.fn(async () => undefined),
    signoutRedirect: vi.fn(async () => undefined),
  };
});
vi.mock("oidc-client-ts", () => ({
  WebStorageStateStore: vi.fn(),
  UserManager: class {
    settings = { authority: "http://auth/realm" };
    events = {
      addUserSignedOut: (f: () => void) => (mgr.handler["source"] ??= []).push(f),
      removeUserSignedOut: () => undefined,
      addSilentRenewError: (f: () => void) => (mgr.handler["erneuern"] ??= []).push(f),
      removeSilentRenewError: () => undefined,
    };
    getUser = mgr.getUser;
    removeUser = mgr.removeUser;
    signinCallback = mgr.signinCallback;
    signinRedirect = mgr.signinRedirect;
    signoutRedirect = mgr.signoutRedirect;
  },
}));

import { currentTimeZone, setProfileTimeZone } from "../kernel";
import { useSession } from "./session";

const account = {
  id: "1",
  email: "lena@example.test",
  displayName: "Lena",
  emailConfirmed: true,
  mayShareWithFriends: true,
};
const user = { access_token: "tok", expired: false };
const response = (status: number, body: unknown = {}) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  mgr.getUser.mockReset();
  mgr.removeUser.mockClear();
  mgr.signinRedirect.mockClear();
  mgr.signoutRedirect.mockClear();
  mgr.handler["source"] = [];
  mgr.handler["erneuern"] = [];
  window.sessionStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () => response(200, account)),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-ACC-01 Sitzung", () => {
  it("ohne gespeicherte Anmeldung: abgemeldet, ohne Hinweis", async () => {
    mgr.getUser.mockResolvedValue(null);
    const { result } = renderHook(() => useSession());
    expect(result.current.state).toEqual({ kind: "loading" });
    await waitFor(() => expect(result.current.state).toEqual({ kind: "signedOut" }));
  });

  it("an expired sign-in does not count as signed in", async () => {
    mgr.getUser.mockResolvedValue({ ...user, expired: true });
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedOut"));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("with a valid sign-in the session loads the account with the bearer token", async () => {
    mgr.getUser.mockResolvedValue(user);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state).toEqual({ kind: "signedIn", account }));
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.headers).toEqual({ Authorization: "Bearer tok" });
    expect(await result.current.token()).toBe("tok");
  });

  it("US-ACC-02 the time zone of the profile becomes the zone of all dates right after sign-in (NFR-08)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => response(200, { ...account, timeZone: "Pacific/Auckland" })),
    );
    mgr.getUser.mockResolvedValue(user);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedIn"));
    expect(currentTimeZone()).toBe("Pacific/Auckland");
    setProfileTimeZone(null);
  });

  it("if the account answers with 401, the sign-in is discarded and the welcome page is shown", async () => {
    mgr.getUser.mockResolvedValue(user);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => response(401)),
    );
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state).toEqual({ kind: "signedOut" }));
    expect(mgr.removeUser).toHaveBeenCalledOnce();
  });

  it("US-ACC-05 a 403 invitation.required keeps the sign-in and asks for an invitation code", async () => {
    mgr.getUser.mockResolvedValue(user);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        response(403, { error: { code: "invitation.required", text: "Nur mit Einladungscode." } }),
      ),
    );
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state).toEqual({ kind: "invitationNeeded" }));
    expect(mgr.removeUser).not.toHaveBeenCalled();
    expect(await result.current.token()).toBe("tok");
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => response(200, account)),
    );
    await act(() => result.current.reload());
    expect(result.current.state.kind).toBe("signedIn");
  });

  it("US-ACC-05 any other 403 stays an error, never the invitation form", async () => {
    mgr.getUser.mockResolvedValue(user);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => response(403, { error: { code: "access.denied" } })),
    );
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("error"));
  });

  it("another server error shows an error with the option to reload (P-09)", async () => {
    mgr.getUser.mockResolvedValue(user);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => response(500)),
    );
    const { result } = renderHook(() => useSession());
    await waitFor(() =>
      expect(result.current.state).toEqual({
        kind: "error",
        text: "Das Konto konnte nicht geladen werden.",
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => response(200, account)),
    );
    await act(() => result.current.reload());
    expect(result.current.state.kind).toBe("signedIn");
  });

  it("signing out remembers this for the next page and shows the hint there", async () => {
    mgr.getUser.mockResolvedValue(user);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedIn"));
    act(() => result.current.signOut());
    expect(mgr.signoutRedirect).toHaveBeenCalledOnce();
    cleanup();
    mgr.getUser.mockResolvedValue(null);
    const fresh = renderHook(() => useSession());
    await waitFor(() =>
      expect(fresh.result.current.state).toEqual({
        kind: "signedOut",
        hint: "Du bist abgemeldet.",
      }),
    );
  });

  it("sign in and register start the detour via the sign-in service; register with prompt=create", async () => {
    mgr.getUser.mockResolvedValue(null);
    window.sessionStorage.setItem("pflanzendex.signed_out", "1");
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedOut"));
    act(() => result.current.signIn());
    expect(mgr.signinRedirect).toHaveBeenLastCalledWith();
    expect(window.sessionStorage.getItem("pflanzendex.signed_out")).toBeNull();
    act(() => result.current.register());
    expect(mgr.signinRedirect).toHaveBeenLastCalledWith({ prompt: "create" });
  });

  it("signing out on all devices ends the sessions at the sign-in service and signs out", async () => {
    mgr.getUser.mockResolvedValue(user);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedIn"));
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response(null, { status: 204 })),
    );
    await act(() => result.current.everywhereSignOut());
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("http://auth/realm/account/sessions");
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.method).toBe("DELETE");
    expect(result.current.state).toEqual({
      kind: "signedOut",
      hint: "Du bist auf allen Geräten abgemeldet.",
    });
  });

  it("if signing out on all devices fails, the session stays with a visible error (P-10)", async () => {
    mgr.getUser.mockResolvedValue(user);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedIn"));
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => response(500)),
    );
    await act(() => result.current.everywhereSignOut());
    expect(result.current.state).toMatchObject({
      kind: "signedIn",
      error: "Abmelden auf allen Geräten ist fehlgeschlagen.",
    });
    expect(mgr.removeUser).not.toHaveBeenCalled();
  });

  it("if the sign-in service ends the session or the renewal fails, the hint to sign in again follows", async () => {
    mgr.getUser.mockResolvedValue(user);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedIn"));
    act(() => mgr.handler["source"]?.forEach((f) => f()));
    expect(result.current.state).toEqual({
      kind: "signedOut",
      hint: "Deine Sitzung wurde beendet. Bitte melde dich neu an.",
    });
    await act(() => result.current.reload());
    act(() => mgr.handler["erneuern"]?.forEach((f) => f()));
    expect(result.current.state.kind).toBe("signedOut");
  });

  it("when the sign-in service returns with code and state, the sign-in is processed once and the address cleaned", async () => {
    window.history.replaceState({}, "", "/?code=abc&state=xyz");
    mgr.signinCallback.mockResolvedValue(user);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedIn"));
    expect(mgr.signinCallback).toHaveBeenCalledOnce();
    expect(window.location.search).toBe("");
  });

  it("an error return (?error=…) is cleaned and leads to the welcome page", async () => {
    window.history.replaceState({}, "", "/?error=access_denied");
    mgr.getUser.mockResolvedValue(null);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedOut"));
    expect(window.location.search).toBe("");
  });
});
