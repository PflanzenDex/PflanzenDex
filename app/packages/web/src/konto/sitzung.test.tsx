// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Der Anmeldedienst ist ein Fremdsystem: UserManager wird ersetzt, die Sitzungslogik der App läuft echt.
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
      addUserSignedOut: (f: () => void) => (mgr.handler["aus"] ??= []).push(f),
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

import { useSitzung } from "./sitzung";

const konto = {
  id: "1",
  email: "lena@example.test",
  anzeigename: "Lena",
  emailBestaetigt: true,
  darfMitFreundenTeilen: true,
};
const user = { access_token: "tok", expired: false };
const antwort = (status: number, body: unknown = {}) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  mgr.getUser.mockReset();
  mgr.removeUser.mockClear();
  mgr.signinRedirect.mockClear();
  mgr.signoutRedirect.mockClear();
  mgr.handler["aus"] = [];
  mgr.handler["erneuern"] = [];
  window.sessionStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () => antwort(200, konto)),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-ACC-01 Sitzung", () => {
  it("ohne gespeicherte Anmeldung: abgemeldet, ohne Hinweis", async () => {
    mgr.getUser.mockResolvedValue(null);
    const { result } = renderHook(() => useSitzung());
    expect(result.current.zustand).toEqual({ art: "laedt" });
    await waitFor(() => expect(result.current.zustand).toEqual({ art: "abgemeldet" }));
  });

  it("eine abgelaufene Anmeldung zählt nicht als angemeldet", async () => {
    mgr.getUser.mockResolvedValue({ ...user, expired: true });
    const { result } = renderHook(() => useSitzung());
    await waitFor(() => expect(result.current.zustand.art).toBe("abgemeldet"));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("mit gültiger Anmeldung lädt die Sitzung das Konto mit dem Bearer-Token", async () => {
    mgr.getUser.mockResolvedValue(user);
    const { result } = renderHook(() => useSitzung());
    await waitFor(() => expect(result.current.zustand).toEqual({ art: "angemeldet", konto }));
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.headers).toEqual({ Authorization: "Bearer tok" });
    expect(await result.current.token()).toBe("tok");
  });

  it("antwortet das Konto mit 401, wird die Anmeldung verworfen und die Willkommensseite gezeigt", async () => {
    mgr.getUser.mockResolvedValue(user);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => antwort(401)),
    );
    const { result } = renderHook(() => useSitzung());
    await waitFor(() => expect(result.current.zustand).toEqual({ art: "abgemeldet" }));
    expect(mgr.removeUser).toHaveBeenCalledOnce();
  });

  it("ein anderer Serverfehler zeigt einen Fehler mit der Möglichkeit, neu zu laden (P-09)", async () => {
    mgr.getUser.mockResolvedValue(user);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => antwort(500)),
    );
    const { result } = renderHook(() => useSitzung());
    await waitFor(() =>
      expect(result.current.zustand).toEqual({
        art: "fehler",
        text: "Das Konto konnte nicht geladen werden.",
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => antwort(200, konto)),
    );
    await act(() => result.current.neuLaden());
    expect(result.current.zustand.art).toBe("angemeldet");
  });

  it("Abmelden merkt sich das für die nächste Seite und zeigt dort den Hinweis", async () => {
    mgr.getUser.mockResolvedValue(user);
    const { result } = renderHook(() => useSitzung());
    await waitFor(() => expect(result.current.zustand.art).toBe("angemeldet"));
    act(() => result.current.abmelden());
    expect(mgr.signoutRedirect).toHaveBeenCalledOnce();
    cleanup();
    mgr.getUser.mockResolvedValue(null);
    const neu = renderHook(() => useSitzung());
    await waitFor(() =>
      expect(neu.result.current.zustand).toEqual({
        art: "abgemeldet",
        hinweis: "Du bist abgemeldet.",
      }),
    );
  });

  it("Anmelden und Registrieren starten den Umweg über den Anmeldedienst; Registrieren mit prompt=create", async () => {
    mgr.getUser.mockResolvedValue(null);
    window.sessionStorage.setItem("pflanzendex.abgemeldet", "1");
    const { result } = renderHook(() => useSitzung());
    await waitFor(() => expect(result.current.zustand.art).toBe("abgemeldet"));
    act(() => result.current.anmelden());
    expect(mgr.signinRedirect).toHaveBeenLastCalledWith();
    expect(window.sessionStorage.getItem("pflanzendex.abgemeldet")).toBeNull();
    act(() => result.current.registrieren());
    expect(mgr.signinRedirect).toHaveBeenLastCalledWith({ prompt: "create" });
  });

  it("Auf allen Geräten abmelden beendet die Sitzungen beim Anmeldedienst und meldet ab", async () => {
    mgr.getUser.mockResolvedValue(user);
    const { result } = renderHook(() => useSitzung());
    await waitFor(() => expect(result.current.zustand.art).toBe("angemeldet"));
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response(null, { status: 204 })),
    );
    await act(() => result.current.ueberallAbmelden());
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("http://auth/realm/account/sessions");
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.method).toBe("DELETE");
    expect(result.current.zustand).toEqual({
      art: "abgemeldet",
      hinweis: "Du bist auf allen Geräten abgemeldet.",
    });
  });

  it("scheitert das Abmelden auf allen Geräten, bleibt die Sitzung mit sichtbarem Fehler (P-10)", async () => {
    mgr.getUser.mockResolvedValue(user);
    const { result } = renderHook(() => useSitzung());
    await waitFor(() => expect(result.current.zustand.art).toBe("angemeldet"));
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => antwort(500)),
    );
    await act(() => result.current.ueberallAbmelden());
    expect(result.current.zustand).toMatchObject({
      art: "angemeldet",
      fehler: "Abmelden auf allen Geräten ist fehlgeschlagen.",
    });
    expect(mgr.removeUser).not.toHaveBeenCalled();
  });

  it("beendet der Anmeldedienst die Sitzung oder scheitert die Erneuerung, folgt der Hinweis zum Neuanmelden", async () => {
    mgr.getUser.mockResolvedValue(user);
    const { result } = renderHook(() => useSitzung());
    await waitFor(() => expect(result.current.zustand.art).toBe("angemeldet"));
    act(() => mgr.handler["aus"]?.forEach((f) => f()));
    expect(result.current.zustand).toEqual({
      art: "abgemeldet",
      hinweis: "Deine Sitzung wurde beendet. Bitte melde dich neu an.",
    });
    await act(() => result.current.neuLaden());
    act(() => mgr.handler["erneuern"]?.forEach((f) => f()));
    expect(result.current.zustand.art).toBe("abgemeldet");
  });

  it("kehrt der Anmeldedienst mit code und state zurück, wird die Anmeldung einmal verarbeitet und die Adresse bereinigt", async () => {
    window.history.replaceState({}, "", "/?code=abc&state=xyz");
    mgr.signinCallback.mockResolvedValue(user);
    const { result } = renderHook(() => useSitzung());
    await waitFor(() => expect(result.current.zustand.art).toBe("angemeldet"));
    expect(mgr.signinCallback).toHaveBeenCalledOnce();
    expect(window.location.search).toBe("");
  });

  it("eine Fehlerrückkehr (?error=…) wird bereinigt und führt zur Willkommensseite", async () => {
    window.history.replaceState({}, "", "/?error=access_denied");
    mgr.getUser.mockResolvedValue(null);
    const { result } = renderHook(() => useSitzung());
    await waitFor(() => expect(result.current.zustand.art).toBe("abgemeldet"));
    expect(window.location.search).toBe("");
  });
});
