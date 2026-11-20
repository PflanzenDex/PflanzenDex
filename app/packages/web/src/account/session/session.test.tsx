// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ERROR_TEXTS } from "@pflanzendex/core";

// The sign-in service is a foreign system: UserManager is replaced, the session logic of the app runs for real.
const mgr = vi.hoisted(() => {
  const handler: Record<string, (() => void)[]> = {};
  return {
    handler,
    getUser: vi.fn(),
    removeUser: vi.fn(async () => undefined),
    signinCallback: vi.fn(),
    signinRedirect: vi.fn(async () => undefined),
    signinSilent: vi.fn<() => Promise<unknown>>(async () => undefined),
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
      addSilentRenewError: (f: () => void) => (mgr.handler["renew"] ??= []).push(f),
      removeSilentRenewError: () => undefined,
    };
    getUser = mgr.getUser;
    removeUser = mgr.removeUser;
    signinCallback = mgr.signinCallback;
    signinRedirect = mgr.signinRedirect;
    signinSilent = mgr.signinSilent;
    signoutRedirect = mgr.signoutRedirect;
  },
}));

import { currentTimeZone, setProfileTimeZone } from "../../shared/data";
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

// A fresh module instance: the once-guard of the sign-in return lives at module level (one page load per instance).
async function freshUseSession() {
  vi.resetModules();
  return (await import("./session")).useSession;
}

beforeEach(() => {
  mgr.getUser.mockReset();
  mgr.signinSilent.mockReset();
  mgr.signinCallback.mockReset();
  mgr.removeUser.mockClear();
  mgr.signinRedirect.mockClear();
  mgr.signoutRedirect.mockClear();
  mgr.handler["source"] = [];
  mgr.handler["renew"] = [];
  window.sessionStorage.clear();
  // The silent attempt has its own tests below; all others start as if it had already been made.
  window.sessionStorage.setItem("pflanzendex.silent_tried", "1");
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

describe("US-ACC-01 session", () => {
  it("without a stored sign-in: signed out, without a hint", async () => {
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
    // The sign-in service handed out a token, so its session lives and the switch shows (US-QS-32).
    await waitFor(() =>
      expect(result.current.state).toEqual({ kind: "signedOut", canSwitch: true }),
    );
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
        code: "account.not_loadable",
        text: "Dein Konto konnte gerade nicht geladen werden. Versuche es noch einmal.",
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
    await waitFor(() => expect(mgr.signoutRedirect).toHaveBeenCalledOnce());
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

  it("US-ACC-01 another account: the session at the sign-in service ends first, no login with prompt=login is asked", async () => {
    // The tab knows of the live session (the silent check found it): the switch shows only then (US-QS-32).
    window.sessionStorage.setItem("pflanzendex.live_session", "1");
    mgr.getUser.mockResolvedValue(null);
    const { result } = renderHook(() => useSession());
    await waitFor(() =>
      expect(result.current.state).toEqual({ kind: "signedOut", canSwitch: true }),
    );
    act(() => result.current.switchAccount());
    await waitFor(() => expect(mgr.signoutRedirect).toHaveBeenCalledOnce());
    // Keycloak refuses a different person while another session is alive, prompt=login included (see session.ts).
    expect(mgr.signinRedirect).not.toHaveBeenCalled();
  });

  it("US-ACC-01 Konto wechseln: the return opens the sign-in form for the other account at once, with no hint and no silent attempt", async () => {
    // The tab knows of the live session: the switch shows only then (US-QS-32).
    window.sessionStorage.setItem("pflanzendex.live_session", "1");
    mgr.getUser.mockResolvedValue(null);
    const { result } = renderHook(() => useSession());
    await waitFor(() =>
      expect(result.current.state).toEqual({ kind: "signedOut", canSwitch: true }),
    );
    act(() => result.current.switchAccount());
    await waitFor(() => expect(mgr.signoutRedirect).toHaveBeenCalledOnce());
    cleanup();
    // The return from the sign-in service: the session has ended, so the sign-in form opens for the other account
    // (owner decision 2026-11-14). The press set the silent flag, so no silent attempt runs on this return.
    const back = renderHook(() => useSession());
    await waitFor(() =>
      expect(mgr.signinRedirect).toHaveBeenCalledWith({
        prompt: "login",
        redirect_uri: `${window.location.origin}/`,
        state: "/",
      }),
    );
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
    expect(mgr.signinRedirect).toHaveBeenCalledOnce();
    expect(back.result.current.state).toEqual({ kind: "loading" });
    expect(window.sessionStorage.getItem("pflanzendex.register")).toBeNull();
    expect(window.sessionStorage.getItem("pflanzendex.signed_out")).toBeNull();
    expect(window.sessionStorage.getItem("pflanzendex.live_session")).toBeNull();
  });

  it("US-ACC-01 Konto wechseln: the press keeps no sign-out marker, removes the live flag and leaves the intent and the silent flag for the return", async () => {
    window.sessionStorage.setItem("pflanzendex.live_session", "1");
    mgr.getUser.mockResolvedValue(null);
    const { result } = renderHook(() => useSession());
    await waitFor(() =>
      expect(result.current.state).toEqual({ kind: "signedOut", canSwitch: true }),
    );
    // Removed after the page has loaded: the press itself has to set it for the return.
    window.sessionStorage.removeItem("pflanzendex.silent_tried");
    let atRedirect: Record<string, string | null> = {};
    mgr.signoutRedirect.mockImplementationOnce(async () => {
      atRedirect = {
        register: window.sessionStorage.getItem("pflanzendex.register"),
        marker: window.sessionStorage.getItem("pflanzendex.signed_out"),
        live: window.sessionStorage.getItem("pflanzendex.live_session"),
        silent: window.sessionStorage.getItem("pflanzendex.silent_tried"),
      };
    });
    act(() => result.current.switchAccount());
    await waitFor(() => expect(mgr.signoutRedirect).toHaveBeenCalledOnce());
    expect(atRedirect).toEqual({ register: "after_switch", marker: null, live: null, silent: "1" });
  });

  it("sign in and register start the detour via the sign-in service; register checks the session first (prompt=none)", async () => {
    mgr.getUser.mockResolvedValue(null);
    window.sessionStorage.setItem("pflanzendex.signed_out", "1");
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedOut"));
    act(() => result.current.signIn());
    await waitFor(() =>
      expect(mgr.signinRedirect).toHaveBeenLastCalledWith({
        redirect_uri: `${window.location.origin}/`,
        state: "/",
      }),
    );
    expect(window.sessionStorage.getItem("pflanzendex.signed_out")).toBeNull();
    act(() => result.current.register());
    await waitFor(() => expect(mgr.signinRedirect).toHaveBeenLastCalledWith({ prompt: "none" }));
  });

  it("US-ACC-01 Konto anlegen without a live session: the silent check comes back empty and the registration opens at once, no sign-out", async () => {
    const session = await freshUseSession();
    mgr.getUser.mockResolvedValue(null);
    const first = renderHook(() => session());
    await waitFor(() => expect(first.result.current.state.kind).toBe("signedOut"));
    act(() => first.result.current.register());
    await waitFor(() => expect(mgr.signinRedirect).toHaveBeenLastCalledWith({ prompt: "none" }));
    cleanup();
    // The silent check returns from the sign-in service without a session.
    window.history.replaceState({}, "", "/?error=login_required&state=abc");
    renderHook(() => session());
    await waitFor(() => expect(mgr.signinRedirect).toHaveBeenLastCalledWith({ prompt: "create" }));
    expect(mgr.signoutRedirect).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
  });

  it("US-ACC-01 Konto anlegen with a live session of another person: the session ends first, then the registration opens", async () => {
    const session = await freshUseSession();
    mgr.getUser.mockResolvedValue(null);
    const first = renderHook(() => session());
    await waitFor(() => expect(first.result.current.state.kind).toBe("signedOut"));
    act(() => first.result.current.register());
    await waitFor(() => expect(mgr.signinRedirect).toHaveBeenLastCalledWith({ prompt: "none" }));
    cleanup();
    // The silent check returns with a code: the sign-in service still holds the session of the other person.
    window.history.replaceState({}, "", "/?code=abc&state=xyz");
    mgr.signinCallback.mockResolvedValue(user);
    renderHook(() => session());
    await waitFor(() => expect(mgr.signoutRedirect).toHaveBeenCalledOnce());
    expect(mgr.signinRedirect).not.toHaveBeenCalledWith({ prompt: "create" });
    cleanup();
    // The sign-out comes back without a sign-in: the registration opens at once.
    mgr.getUser.mockResolvedValue(null);
    window.history.replaceState({}, "", "/");
    renderHook(() => session());
    await waitFor(() => expect(mgr.signinRedirect).toHaveBeenLastCalledWith({ prompt: "create" }));
    expect(mgr.signoutRedirect).toHaveBeenCalledOnce();
    // Nobody signed out: the tab of the new account keeps its silent sign-in.
    expect(window.sessionStorage.getItem("pflanzendex.signed_out")).toBeNull();
  });

  it("US-ACC-01 Konto anlegen under Strict Mode: the registration opens once", async () => {
    const { StrictMode } = await import("react");
    const session = await freshUseSession();
    window.sessionStorage.setItem("pflanzendex.register", "check");
    window.history.replaceState({}, "", "/?error=login_required&state=abc");
    mgr.getUser.mockResolvedValue(null);
    renderHook(() => session(), { wrapper: StrictMode });
    await waitFor(() => expect(mgr.signinRedirect).toHaveBeenCalledWith({ prompt: "create" }));
    expect(mgr.signinRedirect).toHaveBeenCalledOnce();
  });

  it("US-ACC-01 a registration check that came back without an answer in the address does not open the registration", async () => {
    window.sessionStorage.setItem("pflanzendex.register", "check");
    mgr.getUser.mockResolvedValue(null);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedOut"));
    expect(mgr.signinRedirect).not.toHaveBeenCalled();
    expect(mgr.signoutRedirect).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem("pflanzendex.register")).toBeNull();
  });

  it("US-ACC-01 signing out on all devices ends the sessions through the API with the token and signs out", async () => {
    mgr.getUser.mockResolvedValue(user);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedIn"));
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => response(200, { ended: true })),
    );
    await act(() => result.current.everywhereSignOut());
    // The API ends the sessions; the browser never calls the sign-in service's account API (issue 2065).
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("http://localhost:3000/account/sessions/end");
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.method).toBe("POST");
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: "Bearer tok",
    });
    expect(mgr.removeUser).toHaveBeenCalled();
    expect(result.current.state).toEqual({
      kind: "signedOut",
      hint: "Du bist auf allen Geräten abgemeldet.",
    });
  });

  it("US-ACC-01 if signing out on all devices fails, the session stays with the text of its code and the dialog can press again (P-10)", async () => {
    const text =
      "Abmelden auf allen Geräten hat nicht geklappt. Die anderen Geräte sind vielleicht noch angemeldet; versuche es gleich noch einmal.";
    mgr.getUser.mockResolvedValue(user);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedIn"));
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        response(502, { error: { code: "account.sign_out_everywhere_failed", text } }),
      ),
    );
    await act(() => result.current.everywhereSignOut());
    expect(result.current.state).toMatchObject({ kind: "signedIn", everywhereError: text });
    expect(mgr.removeUser).not.toHaveBeenCalled();
    // A second press calls the API again and, once it answers, signs out.
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => response(200, { ended: true })),
    );
    await act(() => result.current.everywhereSignOut());
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(result.current.state).toEqual({
      kind: "signedOut",
      hint: "Du bist auf allen Geräten abgemeldet.",
    });
  });

  it("US-ACC-01 a second press while signing out on all devices runs makes no second request and the state is busy meanwhile", async () => {
    mgr.getUser.mockResolvedValue(user);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedIn"));
    // The first request waits until the test answers it, so the busy state can be seen.
    let answer: (r: Response) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(
        () =>
          new Promise<Response>((resolve) => {
            answer = resolve;
          }),
      ),
    );
    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.everywhereSignOut();
    });
    await waitFor(() =>
      expect(result.current.state).toMatchObject({ kind: "signedIn", everywhereBusy: true }),
    );
    await act(() => result.current.everywhereSignOut());
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    answer(new Response(JSON.stringify({ ended: true }), { status: 200 }));
    await act(() => first);
    expect(result.current.state).toEqual({
      kind: "signedOut",
      hint: "Du bist auf allen Geräten abgemeldet.",
    });
  });

  it("US-ACC-01 an expired access token is renewed once, silently, and the sign-out uses the new token", async () => {
    mgr.getUser.mockResolvedValue(user);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedIn"));
    mgr.getUser.mockResolvedValueOnce({ access_token: "old", expired: true });
    mgr.signinSilent.mockResolvedValueOnce({ access_token: "new", expired: false });
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => response(200, { ended: true })),
    );
    await act(() => result.current.everywhereSignOut());
    expect(mgr.signinSilent).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: "Bearer new",
    });
    expect(mgr.removeUser).toHaveBeenCalled();
  });

  it("US-ACC-01 an expired access token that cannot be renewed shows the error and ends nothing", async () => {
    mgr.getUser.mockResolvedValue(user);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedIn"));
    mgr.getUser.mockResolvedValueOnce({ access_token: "old", expired: true });
    mgr.signinSilent.mockRejectedValueOnce(new Error("login_required"));
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => response(200, { ended: true })),
    );
    await act(() => result.current.everywhereSignOut());
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(result.current.state).toMatchObject({
      kind: "signedIn",
      everywhereError:
        "Abmelden auf allen Geräten hat nicht geklappt. Versuche es gleich noch einmal.",
    });
    expect(mgr.removeUser).not.toHaveBeenCalled();
  });

  it("US-ACC-01 without a connection the sign-out says so with its own text, not the one of a write", async () => {
    mgr.getUser.mockResolvedValue(user);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedIn"));
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await act(() => result.current.everywhereSignOut());
    expect(result.current.state).toMatchObject({
      kind: "signedIn",
      everywhereError:
        "Keine Verbindung. Abmelden auf allen Geräten hat nicht geklappt, versuch es gleich noch einmal.",
    });
    expect(mgr.removeUser).not.toHaveBeenCalled();
  });

  it("US-ACC-01 an unavailable sign-out on all devices shows the text of its code and removes nothing", async () => {
    const text =
      "Abmelden auf allen Geräten ist auf diesem Server nicht eingerichtet. Melde dich hier ab; andere Geräte bleiben dann angemeldet.";
    mgr.getUser.mockResolvedValue(user);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedIn"));
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        response(503, { error: { code: "account.sign_out_everywhere_unavailable", text } }),
      ),
    );
    await act(() => result.current.everywhereSignOut());
    expect(result.current.state).toMatchObject({ kind: "signedIn", everywhereError: text });
    expect(mgr.removeUser).not.toHaveBeenCalled();
  });

  it("US-ACC-01 signing out on all devices without a stored sign-in ends nothing and says so", async () => {
    mgr.getUser.mockResolvedValue(user);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedIn"));
    mgr.getUser.mockResolvedValueOnce(undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => response(200, { ended: true })),
    );
    await act(() => result.current.everywhereSignOut());
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(result.current.state).toMatchObject({
      kind: "signedIn",
      everywhereError:
        "Abmelden auf allen Geräten hat nicht geklappt. Versuche es gleich noch einmal.",
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
    act(() => mgr.handler["renew"]?.forEach((f) => f()));
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

  it("signed out with the sign-out marker shows the hint, without the marker no hint", async () => {
    mgr.getUser.mockResolvedValue(null);
    window.sessionStorage.setItem("pflanzendex.signed_out", "1");
    const marked = renderHook(() => useSession());
    await waitFor(() =>
      expect(marked.result.current.state).toEqual({
        kind: "signedOut",
        hint: "Du bist abgemeldet.",
      }),
    );
    cleanup();
    window.sessionStorage.clear();
    window.sessionStorage.setItem("pflanzendex.silent_tried", "1");
    const plain = renderHook(() => useSession());
    await waitFor(() => expect(plain.result.current.state).toEqual({ kind: "signedOut" }));
  });

  it("a 401 not_signed_in from the API discards the stored sign-in and shows no error", async () => {
    mgr.getUser.mockResolvedValue(user);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => response(401, { error: { code: "not_signed_in" } })),
    );
    const { result } = renderHook(() => useSession());
    // The token was handed out, so the sign-in service's session lives and the switch shows (US-QS-32).
    await waitFor(() =>
      expect(result.current.state).toEqual({ kind: "signedOut", canSwitch: true }),
    );
    expect(mgr.removeUser).toHaveBeenCalledOnce();
  });

  it("the return from the sign-in service is processed once under Strict Mode", async () => {
    // The once-guard lives at module level (one page load); a fresh module instance starts without a cached callback.
    vi.resetModules();
    const { StrictMode } = await import("react");
    const fresh = await import("./session");
    window.history.replaceState({}, "", "/?code=abc&state=xyz");
    mgr.signinCallback.mockClear();
    mgr.signinCallback.mockResolvedValue(user);
    const { result } = renderHook(() => fresh.useSession(), { wrapper: StrictMode });
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

  it("US-ACC-01 without a stored sign-in a live session at the sign-in service is picked up silently (prompt=none), once", async () => {
    window.sessionStorage.removeItem("pflanzendex.silent_tried");
    mgr.getUser.mockResolvedValue(null);
    const { result } = renderHook(() => useSession());
    await waitFor(() =>
      expect(mgr.signinRedirect).toHaveBeenCalledWith({
        prompt: "none",
        redirect_uri: `${window.location.origin}/`,
        state: "/",
      }),
    );
    expect(result.current.state).toEqual({ kind: "loading" });
    expect(window.sessionStorage.getItem("pflanzendex.silent_tried")).toBe("1");
  });

  it("US-ACC-01 when the silent attempt is refused (login_required) the welcome page shows, without a second attempt", async () => {
    window.sessionStorage.removeItem("pflanzendex.silent_tried");
    window.sessionStorage.setItem("pflanzendex.silent_tried", "1");
    window.history.replaceState({}, "", "/?error=login_required&state=abc");
    mgr.getUser.mockResolvedValue(null);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state).toEqual({ kind: "signedOut" }));
    expect(mgr.signinRedirect).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
  });

  it("US-ACC-01 after an explicit sign-out there is no silent attempt, the person stays signed out", async () => {
    window.sessionStorage.removeItem("pflanzendex.silent_tried");
    window.sessionStorage.setItem("pflanzendex.signed_out", "1");
    mgr.getUser.mockResolvedValue(null);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedOut"));
    expect(mgr.signinRedirect).not.toHaveBeenCalled();
  });
});

describe("US-QS-32 Konto wechseln only with a live session at the sign-in service, no hint without a real sign-out", () => {
  const LIVE = "pflanzendex.live_session";

  it("US-QS-32 a visitor who was never signed in gets no hint and no switch when the silent check answers login_required", async () => {
    window.history.replaceState({}, "", "/?error=login_required&state=abc");
    mgr.getUser.mockResolvedValue(null);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state).toEqual({ kind: "signedOut" }));
    expect(result.current.state).not.toHaveProperty("hint");
    expect(result.current.state).not.toHaveProperty("canSwitch");
    expect(window.sessionStorage.getItem(LIVE)).toBeNull();
  });

  it("US-QS-32 a return with error=login_required removes a stale live flag: the service holds no session, so no switch shows", async () => {
    // An earlier sign-in in this tab left the flag; the service now answers that it holds no session.
    window.sessionStorage.setItem(LIVE, "1");
    window.history.replaceState({}, "", "/?error=login_required&state=abc");
    mgr.getUser.mockResolvedValue(null);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state).toEqual({ kind: "signedOut" }));
    expect(result.current.state).not.toHaveProperty("canSwitch");
    expect(window.sessionStorage.getItem(LIVE)).toBeNull();
  });

  it.each(["interaction_required", "consent_required", "account_selection_required"])(
    "US-QS-32 a silent check answered %s shows the switch and no hint: the sign-in service holds a session",
    async (error) => {
      window.history.replaceState({}, "", `/?error=${error}&state=abc`);
      mgr.getUser.mockResolvedValue(null);
      const { result } = renderHook(() => useSession());
      await waitFor(() =>
        expect(result.current.state).toEqual({ kind: "signedOut", canSwitch: true }),
      );
      expect(result.current.state).not.toHaveProperty("hint");
      expect(window.sessionStorage.getItem(LIVE)).toBe("1");
    },
  );

  it("US-QS-32 signed in once in this tab, the stored sign-in is gone later: the switch shows and no hint", async () => {
    mgr.getUser.mockResolvedValue(user);
    const first = renderHook(() => useSession());
    await waitFor(() => expect(first.result.current.state.kind).toBe("signedIn"));
    cleanup();
    mgr.getUser.mockResolvedValue(null);
    const back = renderHook(() => useSession());
    await waitFor(() =>
      expect(back.result.current.state).toEqual({ kind: "signedOut", canSwitch: true }),
    );
    expect(back.result.current.state).not.toHaveProperty("hint");
  });

  it("US-QS-32 after a real sign-out the welcome page shows the hint and no switch", async () => {
    mgr.getUser.mockResolvedValue(user);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedIn"));
    act(() => result.current.signOut());
    await waitFor(() => expect(mgr.signoutRedirect).toHaveBeenCalledOnce());
    cleanup();
    mgr.getUser.mockResolvedValue(null);
    const fresh = renderHook(() => useSession());
    await waitFor(() =>
      expect(fresh.result.current.state).toEqual({
        kind: "signedOut",
        hint: "Du bist abgemeldet.",
      }),
    );
    expect(fresh.result.current.state).not.toHaveProperty("canSwitch");
  });

  it("US-QS-32 the sign-out marker wins over a live flag: the hint shows and no switch", async () => {
    window.sessionStorage.setItem("pflanzendex.signed_out", "1");
    window.sessionStorage.setItem(LIVE, "1");
    mgr.getUser.mockResolvedValue(null);
    const { result } = renderHook(() => useSession());
    await waitFor(() =>
      expect(result.current.state).toEqual({ kind: "signedOut", hint: "Du bist abgemeldet." }),
    );
    expect(result.current.state).not.toHaveProperty("canSwitch");
  });

  it("US-QS-32 the sign-in service ends the session: the tab forgets the live session and the welcome page shows no switch", async () => {
    mgr.getUser.mockResolvedValue(user);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedIn"));
    expect(window.sessionStorage.getItem(LIVE)).toBe("1");
    act(() => mgr.handler["source"]?.forEach((f) => f()));
    expect(window.sessionStorage.getItem(LIVE)).toBeNull();
    expect(result.current.state).toEqual({
      kind: "signedOut",
      hint: "Deine Sitzung wurde beendet. Bitte melde dich neu an.",
    });
  });

  it("US-QS-32 signing out on all devices ends the live session too: after a reload no switch shows", async () => {
    mgr.getUser.mockResolvedValue(user);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedIn"));
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => response(200, { ended: true })),
    );
    await act(() => result.current.everywhereSignOut());
    expect(window.sessionStorage.getItem(LIVE)).toBeNull();
    cleanup();
    mgr.getUser.mockResolvedValue(null);
    const back = renderHook(() => useSession());
    await waitFor(() => expect(back.result.current.state).toEqual({ kind: "signedOut" }));
  });

  it("US-QS-32 signing out on all devices clears the photo cache: a picture of the keeper is revoked and the next view fetches it anew (P-05)", async () => {
    // The session and the photo hook come from one module registry, so the sign-out clears the cache the test fills.
    const useFreshSession = await freshUseSession();
    const { useStoredPhoto } = await import("../../shared/platform/browser/use-stored-photo");
    const photoAccess = { api: "http://localhost:3000", token: async () => "tok" };
    const photoPath = "/specimens/s1/photo";
    const photoFetches: string[] = [];
    const revoked: string[] = [];
    const createUrl = URL.createObjectURL;
    const revokeUrl = URL.revokeObjectURL;
    let created = 0;
    URL.createObjectURL = vi.fn(() => `blob:photo-${++created}`);
    URL.revokeObjectURL = vi.fn((url: string) => {
      revoked.push(url);
    });
    try {
      mgr.getUser.mockResolvedValue(user);
      const { result } = renderHook(() => useFreshSession());
      await waitFor(() => expect(result.current.state.kind).toBe("signedIn"));
      vi.stubGlobal(
        "fetch",
        vi.fn<typeof fetch>(async (input) => {
          const url = String(input);
          if (url.endsWith("/account/sessions/end")) return response(200, { ended: true });
          if (url.includes(photoPath)) {
            photoFetches.push(url);
            return {
              ok: true,
              status: 200,
              blob: async () => new Blob(["picture"]),
            } as unknown as Response;
          }
          return response(200, account);
        }),
      );
      const photo = renderHook(() => useStoredPhoto(photoAccess, photoPath, { size: "thumb" }));
      await waitFor(() => expect(typeof photo.result.current).toBe("string"));
      const shown = photo.result.current as string;
      photo.unmount();
      expect(photoFetches).toHaveLength(1);
      await act(() => result.current.everywhereSignOut());
      // The picture leaves memory with the sign-out; the photo module loads at the sign-out, so the revoke may follow it.
      await waitFor(() => expect(revoked).toContain(shown));
      const again = renderHook(() => useStoredPhoto(photoAccess, photoPath, { size: "thumb" }));
      await waitFor(() => expect(typeof again.result.current).toBe("string"));
      expect(photoFetches).toHaveLength(2);
      expect(again.result.current).not.toBe(shown);
    } finally {
      URL.createObjectURL = createUrl;
      URL.revokeObjectURL = revokeUrl;
    }
  });
});

describe("US-ACC-01 Abmelden and Konto wechseln on a failure", () => {
  const FAILED =
    "Abmelden hat nicht geklappt: Die Anmeldung ist gerade nicht erreichbar. Prüfe deine Verbindung und versuche es noch einmal.";

  it("US-ACC-01 Abmelden: a failed sign-out says what to do, the person stays signed in, no marker stays behind and the live flag stays (US-QS-32)", async () => {
    mgr.getUser.mockResolvedValue(user);
    mgr.signoutRedirect.mockRejectedValueOnce(new Error("discovery failed"));
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedIn"));
    act(() => result.current.signOut());
    await waitFor(() =>
      expect(result.current.state).toEqual({ kind: "signedIn", account, error: FAILED }),
    );
    expect(window.sessionStorage.getItem("pflanzendex.signed_out")).toBeNull();
    expect(window.sessionStorage.getItem("pflanzendex.live_session")).toBe("1");
    expect(mgr.removeUser).not.toHaveBeenCalled();
  });

  it("US-ACC-01 Konto wechseln: a failed sign-out on the welcome page says so there, no marker stays behind and the live flag stays", async () => {
    window.sessionStorage.setItem("pflanzendex.live_session", "1");
    mgr.getUser.mockResolvedValue(null);
    mgr.signoutRedirect.mockRejectedValueOnce(new Error("discovery failed"));
    const { result } = renderHook(() => useSession());
    await waitFor(() =>
      expect(result.current.state).toEqual({ kind: "signedOut", canSwitch: true }),
    );
    act(() => result.current.switchAccount());
    await waitFor(() =>
      expect(result.current.state).toEqual({ kind: "signedOut", canSwitch: true, error: FAILED }),
    );
    expect(window.sessionStorage.getItem("pflanzendex.signed_out")).toBeNull();
    expect(window.sessionStorage.getItem("pflanzendex.live_session")).toBe("1");
  });

  it("US-QS-32 a failed Konto wechseln keeps the sign-out marker and the live flag as they were", async () => {
    window.sessionStorage.setItem("pflanzendex.signed_out", "1");
    window.sessionStorage.setItem("pflanzendex.live_session", "1");
    mgr.getUser.mockResolvedValue(null);
    mgr.signoutRedirect.mockRejectedValueOnce(new Error("discovery failed"));
    const { result } = renderHook(() => useSession());
    await waitFor(() =>
      expect(result.current.state).toEqual({ kind: "signedOut", hint: "Du bist abgemeldet." }),
    );
    act(() => result.current.switchAccount());
    await waitFor(() =>
      expect(result.current.state).toEqual({
        kind: "signedOut",
        hint: "Du bist abgemeldet.",
        error: FAILED,
      }),
    );
    expect(window.sessionStorage.getItem("pflanzendex.signed_out")).toBe("1");
    expect(window.sessionStorage.getItem("pflanzendex.live_session")).toBe("1");
  });

  it("US-ACC-01 Abmelden on the invitation page: a failed sign-out is said there too", async () => {
    mgr.getUser.mockResolvedValue(user);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => response(403, { error: { code: "invitation.required" } })),
    );
    mgr.signoutRedirect.mockRejectedValueOnce(new Error("discovery failed"));
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("invitationNeeded"));
    act(() => result.current.signOut());
    await waitFor(() =>
      expect(result.current.state).toEqual({ kind: "invitationNeeded", error: FAILED }),
    );
    expect(window.sessionStorage.getItem("pflanzendex.signed_out")).toBeNull();
  });

  it("US-ACC-01 Abmelden can be tried again: the next press calls the sign-out again, and its success leaves no error", async () => {
    mgr.getUser.mockResolvedValue(user);
    mgr.signoutRedirect.mockRejectedValueOnce(new Error("discovery failed"));
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedIn"));
    act(() => result.current.signOut());
    await waitFor(() => expect(result.current.state).toMatchObject({ error: FAILED }));
    act(() => result.current.signOut());
    await waitFor(() => expect(mgr.signoutRedirect).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.state).toEqual({ kind: "signedIn", account }));
    expect(window.sessionStorage.getItem("pflanzendex.signed_out")).toBe("1");
  });

  it("US-ACC-01 Abmelden sets the marker before the redirect starts, so the return shows the hint", async () => {
    mgr.getUser.mockResolvedValue(user);
    let markerAtRedirect: string | null = null;
    let liveAtRedirect: string | null = "unset";
    mgr.signoutRedirect.mockImplementationOnce(async () => {
      markerAtRedirect = window.sessionStorage.getItem("pflanzendex.signed_out");
      liveAtRedirect = window.sessionStorage.getItem("pflanzendex.live_session");
    });
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedIn"));
    act(() => result.current.signOut());
    await waitFor(() => expect(mgr.signoutRedirect).toHaveBeenCalledOnce());
    expect(markerAtRedirect).toBe("1");
    // The session ends at the sign-in service: the tab no longer knows of a live one (US-QS-32).
    expect(liveAtRedirect).toBeNull();
    expect(result.current.state).toEqual({ kind: "signedIn", account });
  });

  it("US-ACC-01 Konto wechseln fails: the intent and the silent flag are removed again and the live flag is back (P-10)", async () => {
    window.sessionStorage.setItem("pflanzendex.live_session", "1");
    mgr.getUser.mockResolvedValue(null);
    const { result } = renderHook(() => useSession());
    await waitFor(() =>
      expect(result.current.state).toEqual({ kind: "signedOut", canSwitch: true }),
    );
    // Removed after the page has loaded: the failed press must give back that it had not been set.
    window.sessionStorage.removeItem("pflanzendex.silent_tried");
    mgr.signoutRedirect.mockRejectedValueOnce(new Error("discovery failed"));
    act(() => result.current.switchAccount());
    await waitFor(() =>
      expect(result.current.state).toEqual({ kind: "signedOut", canSwitch: true, error: FAILED }),
    );
    expect(window.sessionStorage.getItem("pflanzendex.register")).toBeNull();
    expect(window.sessionStorage.getItem("pflanzendex.silent_tried")).toBeNull();
    expect(window.sessionStorage.getItem("pflanzendex.signed_out")).toBeNull();
    expect(window.sessionStorage.getItem("pflanzendex.live_session")).toBe("1");
  });

  it("US-ACC-01 Konto wechseln: a sign-in that cannot start on the return shows the welcome page with its error, no hint and no intent left (P-10)", async () => {
    const SIGN_IN_FAILED =
      "Anmelden hat nicht geklappt: Die Anmeldung ist gerade nicht erreichbar. Prüfe deine Verbindung und versuche es noch einmal.";
    window.sessionStorage.setItem("pflanzendex.register", "after_switch");
    mgr.getUser.mockResolvedValue(null);
    mgr.signinRedirect.mockRejectedValueOnce(new Error("discovery failed"));
    const { result } = renderHook(() => useSession());
    await waitFor(() =>
      expect(result.current.state).toEqual({ kind: "signedOut", error: SIGN_IN_FAILED }),
    );
    expect(mgr.signinRedirect).toHaveBeenCalledOnce();
    expect(mgr.signinRedirect).toHaveBeenCalledWith({
      prompt: "login",
      redirect_uri: `${window.location.origin}/`,
      state: "/",
    });
    expect(window.sessionStorage.getItem("pflanzendex.register")).toBeNull();
    expect(window.sessionStorage.getItem("pflanzendex.signed_out")).toBeNull();
  });

  it("US-ACC-01 Konto wechseln under Strict Mode: the sign-in form opens once on the return, the intent is read once", async () => {
    const { StrictMode } = await import("react");
    window.sessionStorage.setItem("pflanzendex.live_session", "1");
    mgr.getUser.mockResolvedValue(null);
    const first = renderHook(() => useSession());
    await waitFor(() =>
      expect(first.result.current.state).toEqual({ kind: "signedOut", canSwitch: true }),
    );
    // Removed after the page has loaded: the press has to set it again, so the return never attempts silently (see the press test above).
    window.sessionStorage.removeItem("pflanzendex.silent_tried");
    act(() => first.result.current.switchAccount());
    await waitFor(() => expect(mgr.signoutRedirect).toHaveBeenCalledOnce());
    cleanup();
    renderHook(() => useSession(), { wrapper: StrictMode });
    await waitFor(() =>
      expect(mgr.signinRedirect).toHaveBeenCalledWith({
        prompt: "login",
        redirect_uri: `${window.location.origin}/`,
        state: "/",
      }),
    );
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
    expect(mgr.signinRedirect).toHaveBeenCalledOnce();
    expect(mgr.signinRedirect).not.toHaveBeenCalledWith({ prompt: "none" });
  });
});

describe("US-ACC-01 Anmelden and Konto anlegen when the sign-in service cannot be reached", () => {
  const SIGN_IN_FAILED =
    "Anmelden hat nicht geklappt: Die Anmeldung ist gerade nicht erreichbar. Prüfe deine Verbindung und versuche es noch einmal.";
  const REGISTER_FAILED =
    "Konto anlegen hat nicht geklappt: Die Anmeldung ist gerade nicht erreichbar. Prüfe deine Verbindung und versuche es noch einmal.";
  const SIGN_OUT_FAILED =
    "Abmelden hat nicht geklappt: Die Anmeldung ist gerade nicht erreichbar. Prüfe deine Verbindung und versuche es noch einmal.";
  const MARKER = "pflanzendex.signed_out";
  const SILENT_TRIED = "pflanzendex.silent_tried";
  const REGISTER = "pflanzendex.register";
  // One macrotask lets every press reach the sign-in library and every failure run its catch.
  const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

  it("US-ACC-01 Anmelden fails: the welcome page says so, and the sign-out marker from before is back with its hint", async () => {
    window.sessionStorage.setItem(MARKER, "1");
    mgr.getUser.mockResolvedValue(null);
    mgr.signinRedirect.mockRejectedValueOnce(new Error("discovery failed"));
    const { result } = renderHook(() => useSession());
    await waitFor(() =>
      expect(result.current.state).toEqual({ kind: "signedOut", hint: "Du bist abgemeldet." }),
    );
    act(() => result.current.signIn());
    await waitFor(() =>
      expect(result.current.state).toEqual({
        kind: "signedOut",
        hint: "Du bist abgemeldet.",
        error: SIGN_IN_FAILED,
      }),
    );
    expect(window.sessionStorage.getItem(MARKER)).toBe("1");
  });

  it("US-ACC-01 Anmelden fails without a sign-out before: the welcome page says so and no marker stays behind", async () => {
    mgr.getUser.mockResolvedValue(null);
    mgr.signinRedirect.mockRejectedValueOnce(new Error("discovery failed"));
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state).toEqual({ kind: "signedOut" }));
    act(() => result.current.signIn());
    await waitFor(() =>
      expect(result.current.state).toEqual({ kind: "signedOut", error: SIGN_IN_FAILED }),
    );
    expect(window.sessionStorage.getItem(MARKER)).toBeNull();
  });

  it("US-ACC-01 Anmelden can be tried again: the next press calls the sign-in again, and its success leaves no error", async () => {
    mgr.getUser.mockResolvedValue(null);
    mgr.signinRedirect.mockRejectedValueOnce(new Error("discovery failed"));
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedOut"));
    act(() => result.current.signIn());
    await waitFor(() => expect(result.current.state).toMatchObject({ error: SIGN_IN_FAILED }));
    act(() => result.current.signIn());
    await waitFor(() => expect(mgr.signinRedirect).toHaveBeenCalledTimes(2));
    expect(result.current.state).toEqual({ kind: "signedOut" });
  });

  it("US-ACC-01 Konto anlegen fails: the welcome page says so, the registration flags are as before and the sign-out marker is back", async () => {
    window.sessionStorage.setItem(MARKER, "1");
    mgr.getUser.mockResolvedValue(null);
    mgr.signinRedirect.mockRejectedValueOnce(new Error("discovery failed"));
    const { result } = renderHook(() => useSession());
    await waitFor(() =>
      expect(result.current.state).toEqual({ kind: "signedOut", hint: "Du bist abgemeldet." }),
    );
    act(() => result.current.register());
    await waitFor(() =>
      expect(result.current.state).toEqual({
        kind: "signedOut",
        hint: "Du bist abgemeldet.",
        error: REGISTER_FAILED,
      }),
    );
    expect(window.sessionStorage.getItem(REGISTER)).toBeNull();
    expect(window.sessionStorage.getItem(SILENT_TRIED)).toBe("1");
    expect(window.sessionStorage.getItem(MARKER)).toBe("1");
  });

  it("US-ACC-01 Konto anlegen fails with no silent attempt before: the silent attempt flag stays absent", async () => {
    mgr.getUser.mockResolvedValue(null);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state).toEqual({ kind: "signedOut" }));
    // Removed after the page has loaded: the load itself would otherwise make the silent attempt.
    window.sessionStorage.removeItem(SILENT_TRIED);
    mgr.signinRedirect.mockRejectedValueOnce(new Error("discovery failed"));
    act(() => result.current.register());
    await waitFor(() =>
      expect(result.current.state).toEqual({ kind: "signedOut", error: REGISTER_FAILED }),
    );
    expect(window.sessionStorage.getItem(REGISTER)).toBeNull();
    expect(window.sessionStorage.getItem(SILENT_TRIED)).toBeNull();
  });

  it("US-ACC-01 Anmelden pressed twice while it fails: the sign-in is called once and the sign-out marker is as it was", async () => {
    window.sessionStorage.setItem(MARKER, "1");
    mgr.getUser.mockResolvedValue(null);
    mgr.signinRedirect.mockRejectedValueOnce(new Error("discovery failed"));
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedOut"));
    act(() => {
      result.current.signIn();
      result.current.signIn();
    });
    await settle();
    expect(mgr.signinRedirect).toHaveBeenCalledOnce();
    await waitFor(() => expect(result.current.state).toMatchObject({ error: SIGN_IN_FAILED }));
    expect(window.sessionStorage.getItem(MARKER)).toBe("1");
  });

  it("US-ACC-01 Abmelden pressed twice while it fails: the sign-out is called once and no marker stays behind", async () => {
    mgr.getUser.mockResolvedValue(user);
    mgr.signoutRedirect.mockRejectedValueOnce(new Error("discovery failed"));
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedIn"));
    act(() => {
      result.current.signOut();
      result.current.signOut();
    });
    await settle();
    expect(mgr.signoutRedirect).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(result.current.state).toEqual({ kind: "signedIn", account, error: SIGN_OUT_FAILED }),
    );
    expect(window.sessionStorage.getItem(MARKER)).toBeNull();
  });

  it("US-ACC-01 after a failed Anmelden has finished, the next press is not ignored: Konto anlegen starts its check", async () => {
    mgr.getUser.mockResolvedValue(null);
    mgr.signinRedirect.mockRejectedValueOnce(new Error("discovery failed"));
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedOut"));
    act(() => result.current.signIn());
    await settle();
    act(() => result.current.register());
    await waitFor(() => expect(mgr.signinRedirect).toHaveBeenLastCalledWith({ prompt: "none" }));
    expect(window.sessionStorage.getItem(REGISTER)).toBe("check");
  });

  it("US-ACC-01 signing out on all devices when the stored sign-in cannot be read: the error shows on the account and nothing is removed", async () => {
    mgr.getUser.mockResolvedValue(user);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedIn"));
    mgr.getUser.mockRejectedValueOnce(new Error("storage unavailable"));
    await act(() => result.current.everywhereSignOut());
    expect(result.current.state).toMatchObject({
      kind: "signedIn",
      everywhereError:
        "Abmelden auf allen Geräten hat nicht geklappt. Versuche es gleich noch einmal.",
    });
    expect(mgr.removeUser).not.toHaveBeenCalled();
  });

  it("US-ACC-01 Konto anlegen returns with a live session but the session cannot end: the page shows its error and the registration flag is removed", async () => {
    const session = await freshUseSession();
    window.sessionStorage.setItem(REGISTER, "check");
    window.history.replaceState({}, "", "/?code=abc&state=xyz");
    mgr.signinCallback.mockResolvedValue(user);
    mgr.signoutRedirect.mockRejectedValueOnce(new Error("discovery failed"));
    const { result } = renderHook(() => session());
    await waitFor(() => expect(result.current.state.kind).toBe("error"));
    expect(window.sessionStorage.getItem(REGISTER)).toBeNull();
    expect(mgr.signinRedirect).not.toHaveBeenCalled();
  });
});

describe("US-ACC-01 first load when the sign-in service or its library fails", () => {
  const UNREACHABLE =
    "Die Anmeldung ist gerade nicht erreichbar. Prüfe deine Verbindung und versuche es noch einmal.";
  const LIBRARY_FAILED =
    "Die Anmeldung konnte nicht geladen werden. Prüfe deine Verbindung und lade die Seite neu.";
  const SILENT_TRIED = "pflanzendex.silent_tried";

  // The sign-in library cannot be loaded: the module is replaced for the next import only, and undone after the test.
  const libraryFails = () =>
    vi.doMock("../api/sign-in-client", () => ({
      newManager: () => Promise.reject(new Error("chunk failed")),
      processReturn: vi.fn(),
    }));
  const undoLibraryFails = () => {
    vi.doUnmock("../api/sign-in-client");
    vi.resetModules();
  };

  // A first load in a fresh tab whose silent attempt is refused, because the sign-in service cannot be reached.
  const unreachableFirstLoad = () => {
    window.sessionStorage.removeItem(SILENT_TRIED);
    mgr.getUser.mockResolvedValue(null);
    mgr.signinRedirect.mockRejectedValueOnce(new Error("discovery failed"));
    return renderHook(() => useSession());
  };

  it("US-ACC-01 when the sign-in service cannot be reached at the first load, the welcome page says so at once, without a retry", async () => {
    const { result } = unreachableFirstLoad();
    await waitFor(() =>
      expect(result.current.state).toEqual({ kind: "signedOut", error: UNREACHABLE }),
    );
    expect(mgr.signinRedirect).toHaveBeenCalledWith({
      prompt: "none",
      redirect_uri: `${window.location.origin}/`,
      state: "/",
    });
    expect(window.sessionStorage.getItem(SILENT_TRIED)).toBe("1");
  });

  it("US-ACC-01 after that first load, a further load makes no second attempt and shows the welcome page without an error", async () => {
    const { result } = unreachableFirstLoad();
    await waitFor(() =>
      expect(result.current.state).toEqual({ kind: "signedOut", error: UNREACHABLE }),
    );
    await act(() => result.current.reload());
    await waitFor(() => expect(result.current.state).toEqual({ kind: "signedOut" }));
    expect(mgr.signinRedirect).toHaveBeenCalledOnce();
    cleanup();
    // A page reload: the same tab, so the attempt stays used.
    const again = renderHook(() => useSession());
    await waitFor(() => expect(again.result.current.state).toEqual({ kind: "signedOut" }));
    expect(mgr.signinRedirect).toHaveBeenCalledOnce();
  });

  it("US-ACC-01 pressing Anmelden after that first load starts the sign-in and clears the error", async () => {
    const { result } = unreachableFirstLoad();
    await waitFor(() =>
      expect(result.current.state).toEqual({ kind: "signedOut", error: UNREACHABLE }),
    );
    act(() => result.current.signIn());
    await waitFor(() =>
      expect(mgr.signinRedirect).toHaveBeenLastCalledWith({
        redirect_uri: `${window.location.origin}/`,
        state: "/",
      }),
    );
    await waitFor(() => expect(result.current.state).toEqual({ kind: "signedOut" }));
  });

  it("US-ACC-01 when the sign-in library cannot be loaded the page says so and offers a reload, never the loading state", async () => {
    libraryFails();
    try {
      const session = await freshUseSession();
      const { result } = renderHook(() => session());
      await waitFor(() => expect(result.current.state.kind).toBe("error"));
      expect(result.current.state).toEqual({
        kind: "error",
        text: LIBRARY_FAILED,
        reloadPage: true,
      });
    } finally {
      undoLibraryFails();
    }
  });

  it("US-ACC-01 when the sign-in library cannot be loaded no rejection goes unhandled, also not when the page unmounts", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    libraryFails();
    try {
      const session = await freshUseSession();
      const { unmount } = renderHook(() => session());
      // One macrotask lets the failure run its course; then the page unmounts and the effect cleanup runs.
      await new Promise((resolve) => setTimeout(resolve, 0));
      unmount();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
      undoLibraryFails();
    }
  });

  it("US-ACC-01 a failed account load keeps its text and offers no page reload", async () => {
    mgr.getUser.mockResolvedValue(user);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => response(500)),
    );
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("error"));
    expect(result.current.state).toEqual({
      kind: "error",
      code: "account.not_loadable",
      text: "Dein Konto konnte gerade nicht geladen werden. Versuche es noch einmal.",
    });
    expect(result.current.state).not.toHaveProperty("reloadPage");
  });

  it("US-QS-32 a refusal with a code of the message table shows the text of that code, never the raw server text (P-10)", async () => {
    mgr.getUser.mockResolvedValue(user);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        response(503, { error: { code: "system.database_unavailable", text: "raw server text" } }),
      ),
    );
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("error"));
    expect(result.current.state).toEqual({
      kind: "error",
      code: "system.database_unavailable",
      text: ERROR_TEXTS["system.database_unavailable"],
    });
    expect(JSON.stringify(result.current.state)).not.toContain("raw server text");
  });

  it("US-QS-32 a network failure says that the server is not reachable, and offline says the connection is missing", async () => {
    mgr.getUser.mockResolvedValue(user);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("error"));
    expect(result.current.state).toEqual({
      kind: "error",
      code: "network.not_reachable",
      text: "Der Server ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.",
    });
    const online = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
    Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => false });
    try {
      await act(() => result.current.reload());
      await waitFor(() =>
        expect(result.current.state).toEqual({
          kind: "error",
          code: "network.not_reachable",
          text: "Wieder keine Verbindung. Prüfe dein Netz und versuche es noch einmal.",
        }),
      );
    } finally {
      if (online) Object.defineProperty(window.navigator, "onLine", online);
      else delete (window.navigator as { onLine?: boolean }).onLine;
    }
  });

  it("US-QS-32 a retry that fails again says so: the error text starts with Wieder keine Verbindung.", async () => {
    mgr.getUser.mockResolvedValue(user);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("error"));
    await act(() => result.current.reload());
    await waitFor(() =>
      expect(result.current.state).toEqual({
        kind: "error",
        code: "network.not_reachable",
        text: "Wieder keine Verbindung. Der Server ist gerade nicht erreichbar.",
      }),
    );
  });

  it("US-QS-32 a refusal that fails again says that the load failed again, with the text of its code", async () => {
    mgr.getUser.mockResolvedValue(user);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => response(500)),
    );
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("error"));
    await act(() => result.current.reload());
    await waitFor(() =>
      expect(result.current.state).toEqual({
        kind: "error",
        code: "account.not_loadable",
        text: "Wieder nicht geladen. Dein Konto konnte gerade nicht geladen werden. Versuche es noch einmal.",
      }),
    );
  });

  it("US-ACC-01 when our API never answers, the account load ends in its error and the retry works", async () => {
    mgr.getUser.mockResolvedValue(user);
    const realTimeout = AbortSignal.timeout.bind(AbortSignal);
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => realTimeout(1));
    // The API never answers: the request ends only when its signal fires, the way a real request does.
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(
        (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(init?.signal?.reason));
          }),
      ),
    );
    const { result } = renderHook(() => useSession());
    try {
      await waitFor(() =>
        expect(result.current.state).toEqual({
          kind: "error",
          code: "network.not_reachable",
          text: "Der Server ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.",
        }),
      );
      expect(timeout).toHaveBeenCalledWith(15_000);
    } finally {
      timeout.mockRestore();
    }
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => response(200, account)),
    );
    await act(() => result.current.reload());
    expect(result.current.state.kind).toBe("signedIn");
  });
});

describe("US-BES-17 the sign-in returns to the address that asked for it (#1619)", () => {
  it("US-BES-17 a silent check made from a scanned label returns to that label", async () => {
    window.sessionStorage.removeItem("pflanzendex.silent_tried");
    window.history.replaceState({}, "", "/label/abc");
    mgr.getUser.mockResolvedValue(null);
    renderHook(() => useSession());
    await waitFor(() =>
      expect(mgr.signinRedirect).toHaveBeenCalledWith({
        prompt: "none",
        redirect_uri: `${window.location.origin}/label/abc`,
        state: "/label/abc",
      }),
    );
  });

  it("US-BES-17 a refused silent check comes back to the label, which shows the welcome page there without a second attempt", async () => {
    window.history.replaceState({}, "", "/label/abc?error=login_required&state=abc");
    mgr.getUser.mockResolvedValue(null);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state).toEqual({ kind: "signedOut" }));
    expect(window.location.pathname).toBe("/label/abc");
    expect(window.location.search).toBe("");
    expect(mgr.signinRedirect).not.toHaveBeenCalled();
  });

  it("US-BES-17 pressing Anmelden on a scanned label returns to that label", async () => {
    window.history.replaceState({}, "", "/label/abc");
    mgr.getUser.mockResolvedValue(null);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedOut"));
    act(() => result.current.signIn());
    await waitFor(() =>
      expect(mgr.signinRedirect).toHaveBeenLastCalledWith({
        redirect_uri: `${window.location.origin}/label/abc`,
        state: "/label/abc",
      }),
    );
  });

  it("US-BES-17 Konto anlegen keeps the start page: a new account begins on Heute, not on the label", async () => {
    window.history.replaceState({}, "", "/label/abc");
    mgr.getUser.mockResolvedValue(null);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedOut"));
    act(() => result.current.register());
    // Strict: the register check carries no return address at all, not even an undefined one.
    await waitFor(() =>
      expect(mgr.signinRedirect.mock.lastCall).toStrictEqual([{ prompt: "none" }]),
    );
  });

  it("US-BES-17 a return at a scanned label ends signed in with that label as the address", async () => {
    const session = await freshUseSession();
    mgr.signinCallback.mockClear();
    window.history.replaceState({}, "", "/label/abc?code=x&state=y");
    mgr.signinCallback.mockResolvedValue(user);
    const { result } = renderHook(() => session());
    await waitFor(() => expect(result.current.state.kind).toBe("signedIn"));
    expect(mgr.signinCallback).toHaveBeenCalledOnce();
    expect(window.location.pathname).toBe("/label/abc");
    expect(window.location.search).toBe("");
  });
});

describe("US-BES-17 the sign-in returns with the query of the address (#1639)", () => {
  const origin = window.location.origin;
  const refused = () =>
    Object.assign(new Error("login_required"), { state: "/collection?view=plants" });

  it("US-BES-17 an expired sign-in at a deep link: the silent check carries the address with its query as state, the path stays the redirect URI", async () => {
    window.sessionStorage.removeItem("pflanzendex.silent_tried");
    window.history.replaceState({}, "", "/collection?view=plants");
    mgr.getUser.mockResolvedValue({ ...user, expired: true });
    renderHook(() => useSession());
    await waitFor(() =>
      expect(mgr.signinRedirect).toHaveBeenCalledWith({
        prompt: "none",
        redirect_uri: `${origin}/collection`,
        state: "/collection?view=plants",
      }),
    );
  });

  it("US-BES-17 the silent check keeps every parameter of a layer address", async () => {
    window.sessionStorage.removeItem("pflanzendex.silent_tried");
    window.history.replaceState({}, "", "/today?sheet=hints&x=1");
    mgr.getUser.mockResolvedValue({ ...user, expired: true });
    renderHook(() => useSession());
    await waitFor(() =>
      expect(mgr.signinRedirect).toHaveBeenCalledWith({
        prompt: "none",
        redirect_uri: `${origin}/today`,
        state: "/today?sheet=hints&x=1",
      }),
    );
  });

  it("US-BES-17 the return of the silent check restores the address with its query and without the sign-in's own parameters", async () => {
    const session = await freshUseSession();
    window.history.replaceState({}, "", "/collection?code=abc&state=xyz&session_state=s&iss=i");
    mgr.signinCallback.mockResolvedValue({ ...user, state: "/collection?view=plants" });
    const { result } = renderHook(() => session());
    await waitFor(() => expect(result.current.state.kind).toBe("signedIn"));
    expect(window.location.pathname + window.location.search).toBe("/collection?view=plants");
  });

  it.each<[string, unknown]>([
    ["a host after two slashes", "//evil.example/x"],
    ["a host after a slash and a backslash", "/\\evil.example/x"],
    ["an absolute address", "https://evil.example/x"],
    ["a script address", "javascript:alert(1)"],
    ["an object", { path: "/collection" }],
  ])(
    "US-BES-17 a return whose state is %s goes back to the start path, not to the foreign address",
    async (_label, state) => {
      const session = await freshUseSession();
      window.history.replaceState({}, "", "/collection?code=abc&state=xyz");
      mgr.signinCallback.mockResolvedValue({ ...user, state });
      const { result } = renderHook(() => session());
      await waitFor(() => expect(result.current.state.kind).toBe("signedIn"));
      expect(window.location.origin).toBe(origin);
      expect(window.location.pathname + window.location.search).toBe("/collection");
    },
  );

  it("US-BES-17 the interactive sign-in keeps the query of the address", async () => {
    window.history.replaceState({}, "", "/collection?view=plants");
    mgr.getUser.mockResolvedValue(null);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedOut"));
    act(() => result.current.signIn());
    await waitFor(() =>
      expect(mgr.signinRedirect).toHaveBeenLastCalledWith({
        redirect_uri: `${origin}/collection`,
        state: "/collection?view=plants",
      }),
    );
  });

  it("US-BES-17 a refused silent check on a deep link keeps the query, so the next press keeps it too", async () => {
    const session = await freshUseSession();
    window.history.replaceState({}, "", "/collection?view=plants&error=login_required&state=abc");
    mgr.signinCallback.mockRejectedValueOnce(refused());
    mgr.getUser.mockResolvedValue(null);
    const { result } = renderHook(() => session());
    await waitFor(() => expect(result.current.state).toEqual({ kind: "signedOut" }));
    expect(window.location.pathname + window.location.search).toBe("/collection?view=plants");
    act(() => result.current.signIn());
    await waitFor(() =>
      expect(mgr.signinRedirect).toHaveBeenLastCalledWith({
        redirect_uri: `${origin}/collection`,
        state: "/collection?view=plants",
      }),
    );
  });

  it("US-BES-17 a refused silent check under Strict Mode asks the sign-in service once and keeps the query", async () => {
    const { StrictMode } = await import("react");
    const session = await freshUseSession();
    window.history.replaceState({}, "", "/collection?view=plants&error=login_required&state=abc");
    mgr.signinCallback.mockRejectedValueOnce(refused());
    mgr.getUser.mockResolvedValue(null);
    const { result } = renderHook(() => session(), { wrapper: StrictMode });
    await waitFor(() => expect(result.current.state).toEqual({ kind: "signedOut" }));
    expect(mgr.signinCallback).toHaveBeenCalledOnce();
    expect(window.location.pathname + window.location.search).toBe("/collection?view=plants");
  });
});
