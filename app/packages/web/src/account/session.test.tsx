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
      addSilentRenewError: (f: () => void) => (mgr.handler["renew"] ??= []).push(f),
      removeSilentRenewError: () => undefined,
    };
    getUser = mgr.getUser;
    removeUser = mgr.removeUser;
    signinCallback = mgr.signinCallback;
    signinRedirect = mgr.signinRedirect;
    signoutRedirect = mgr.signoutRedirect;
  },
}));

import { currentTimeZone, setProfileTimeZone } from "../shared/data";
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
    mgr.getUser.mockResolvedValue(null);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedOut"));
    act(() => result.current.useAnotherAccount());
    await waitFor(() => expect(mgr.signoutRedirect).toHaveBeenCalledOnce());
    // Keycloak refuses a different person while another session is alive, prompt=login included (see session.ts).
    expect(mgr.signinRedirect).not.toHaveBeenCalled();
  });

  it("US-ACC-01 another account: the return shows the welcome page with the hint and makes no silent attempt", async () => {
    mgr.getUser.mockResolvedValue(user);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedIn"));
    act(() => result.current.useAnotherAccount());
    await waitFor(() => expect(mgr.signoutRedirect).toHaveBeenCalledOnce());
    cleanup();
    // A fresh tab state: only the marker of the sign-out may keep the silent attempt from running.
    window.sessionStorage.removeItem("pflanzendex.silent_tried");
    mgr.getUser.mockResolvedValue(null);
    const back = renderHook(() => useSession());
    await waitFor(() =>
      expect(back.result.current.state).toEqual({ kind: "signedOut", hint: "Du bist abgemeldet." }),
    );
    expect(mgr.signinRedirect).not.toHaveBeenCalled();
  });

  it("sign in and register start the detour via the sign-in service; register checks the session first (prompt=none)", async () => {
    mgr.getUser.mockResolvedValue(null);
    window.sessionStorage.setItem("pflanzendex.signed_out", "1");
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedOut"));
    act(() => result.current.signIn());
    await waitFor(() => expect(mgr.signinRedirect).toHaveBeenLastCalledWith());
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
    await waitFor(() => expect(result.current.state).toEqual({ kind: "signedOut" }));
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
    await waitFor(() => expect(mgr.signinRedirect).toHaveBeenCalledWith({ prompt: "none" }));
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

describe("US-ACC-01 Abmelden and Anderes Konto on a failure", () => {
  const FAILED =
    "Abmelden hat nicht geklappt: Die Anmeldung ist gerade nicht erreichbar. Prüfe deine Verbindung und versuche es noch einmal.";

  it("US-ACC-01 Abmelden: a failed sign-out says what to do, the person stays signed in and no marker stays behind", async () => {
    mgr.getUser.mockResolvedValue(user);
    mgr.signoutRedirect.mockRejectedValueOnce(new Error("discovery failed"));
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedIn"));
    act(() => result.current.signOut());
    await waitFor(() =>
      expect(result.current.state).toEqual({ kind: "signedIn", account, error: FAILED }),
    );
    expect(window.sessionStorage.getItem("pflanzendex.signed_out")).toBeNull();
    expect(mgr.removeUser).not.toHaveBeenCalled();
  });

  it("US-ACC-01 Anderes Konto: a failed sign-out on the welcome page says so there, and no marker stays behind", async () => {
    mgr.getUser.mockResolvedValue(null);
    mgr.signoutRedirect.mockRejectedValueOnce(new Error("discovery failed"));
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedOut"));
    act(() => result.current.useAnotherAccount());
    await waitFor(() => expect(result.current.state).toEqual({ kind: "signedOut", error: FAILED }));
    expect(window.sessionStorage.getItem("pflanzendex.signed_out")).toBeNull();
  });

  it("US-ACC-01 Anderes Konto after a real sign-out: a failure keeps that sign-out, the marker stays", async () => {
    window.sessionStorage.setItem("pflanzendex.signed_out", "1");
    mgr.getUser.mockResolvedValue(null);
    mgr.signoutRedirect.mockRejectedValueOnce(new Error("discovery failed"));
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedOut"));
    act(() => result.current.useAnotherAccount());
    await waitFor(() =>
      expect(result.current.state).toEqual({
        kind: "signedOut",
        hint: "Du bist abgemeldet.",
        error: FAILED,
      }),
    );
    expect(window.sessionStorage.getItem("pflanzendex.signed_out")).toBe("1");
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
    mgr.signoutRedirect.mockImplementationOnce(async () => {
      markerAtRedirect = window.sessionStorage.getItem("pflanzendex.signed_out");
    });
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.state.kind).toBe("signedIn"));
    act(() => result.current.signOut());
    await waitFor(() => expect(mgr.signoutRedirect).toHaveBeenCalledOnce());
    expect(markerAtRedirect).toBe("1");
    expect(result.current.state).toEqual({ kind: "signedIn", account });
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
      error: "Abmelden auf allen Geräten ist fehlgeschlagen.",
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
