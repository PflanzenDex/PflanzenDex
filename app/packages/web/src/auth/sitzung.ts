import { useCallback, useEffect, useMemo, useState } from "react";
import { UserManager, WebStorageStateStore, type User } from "oidc-client-ts";
import { abmeldenUeberall, apiUrl, holeKonto, oidcEinstellungen, type Konto } from "./konto-api";

export type Zustand =
  | { art: "laedt" }
  | { art: "abgemeldet"; hinweis?: string }
  | { art: "angemeldet"; konto: Konto; fehler?: string }
  | { art: "fehler"; text: string };

const env = import.meta.env as Record<string, string | undefined>;
const MERKER = "pflanzendex.abgemeldet";

function neuerManager(): UserManager {
  return new UserManager({
    ...oidcEinstellungen(env, window.location.origin),
    // Die Anmeldung bleibt auf dem Gerät erhalten (US-ACC-01); widerrufbar über „auf allen Geräten abmelden“.
    userStore: new WebStorageStateStore({ store: window.localStorage }),
  });
}

// Der Rücksprung aus dem Anmeldedienst darf nur einmal verarbeitet werden (React-Strict-Mode ruft Effekte doppelt auf).
let rueckkehr: Promise<User | undefined> | null = null;
function verarbeiteRueckkehr(mgr: UserManager): Promise<User | undefined> {
  const q = new URLSearchParams(window.location.search);
  if (q.has("code") && q.has("state")) {
    rueckkehr ??= mgr.signinCallback().then((u) => u ?? undefined);
    return rueckkehr.finally(() => window.history.replaceState({}, "", window.location.pathname));
  }
  if (q.has("error")) window.history.replaceState({}, "", window.location.pathname);
  return mgr.getUser().then((u) => (u && !u.expired ? u : undefined));
}

export function useSitzung() {
  const mgr = useMemo(neuerManager, []);
  const [zustand, setZustand] = useState<Zustand>({ art: "laedt" });

  const lade = useCallback(async () => {
    setZustand({ art: "laedt" });
    try {
      const user = await verarbeiteRueckkehr(mgr);
      if (!user) {
        const hinweis = window.sessionStorage.getItem(MERKER) ? "Du bist abgemeldet." : undefined;
        return setZustand(hinweis ? { art: "abgemeldet", hinweis } : { art: "abgemeldet" });
      }
      setZustand({ art: "angemeldet", konto: await holeKonto(apiUrl(env), user.access_token) });
    } catch (e) {
      if (e instanceof Error && e.message === "nicht_angemeldet") {
        await mgr.removeUser();
        return setZustand({ art: "abgemeldet" });
      }
      setZustand({ art: "fehler", text: "Das Konto konnte nicht geladen werden." });
    }
  }, [mgr]);

  useEffect(() => {
    void lade();
    const beendet = () =>
      setZustand({
        art: "abgemeldet",
        hinweis: "Deine Sitzung wurde beendet. Bitte melde dich neu an.",
      });
    mgr.events.addUserSignedOut(beendet);
    mgr.events.addSilentRenewError(beendet);
    return () => {
      mgr.events.removeUserSignedOut(beendet);
      mgr.events.removeSilentRenewError(beendet);
    };
  }, [mgr, lade]);

  const token = useCallback(async () => (await mgr.getUser())?.access_token, [mgr]);

  return {
    zustand,
    token,
    neuLaden: lade,
    anmelden: () => {
      window.sessionStorage.removeItem(MERKER);
      void mgr.signinRedirect();
    },
    // `prompt=create` öffnet beim Anmeldedienst direkt die Registrierung (OIDC-Erweiterung, von Keycloak unterstützt).
    registrieren: () => {
      window.sessionStorage.removeItem(MERKER);
      void mgr.signinRedirect({ prompt: "create" });
    },
    abmelden: () => {
      window.sessionStorage.setItem(MERKER, "1");
      void mgr.signoutRedirect();
    },
    ueberallAbmelden: async () => {
      const user = await mgr.getUser();
      try {
        if (user) await abmeldenUeberall(mgr.settings.authority, user.access_token);
        await mgr.removeUser();
        setZustand({ art: "abgemeldet", hinweis: "Du bist auf allen Geräten abgemeldet." });
      } catch {
        setZustand((z) =>
          z.art === "angemeldet"
            ? { ...z, fehler: "Abmelden auf allen Geräten ist fehlgeschlagen." }
            : z,
        );
      }
    },
  };
}
