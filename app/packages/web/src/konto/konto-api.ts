import type { UserManagerSettings } from "oidc-client-ts";

export type Konto = {
  id: string;
  email: string;
  anzeigename: string | null;
  emailBestaetigt: boolean;
  darfMitFreundenTeilen: boolean;
};

type Umgebung = Record<string, string | undefined>;
type Abruf = typeof fetch;

/** Einstellungen für den Anmeldedienst (Code-Ablauf mit PKCE); Voreinstellungen passen zu `make auth-up`. */
export function oidcEinstellungen(env: Umgebung, ursprung: string): UserManagerSettings {
  return {
    authority: env["VITE_OIDC_AUTHORITY"] ?? "http://localhost:18081/realms/pflanzendex",
    client_id: env["VITE_OIDC_CLIENT_ID"] ?? "pflanzendex-web",
    redirect_uri: `${ursprung}/`,
    post_logout_redirect_uri: `${ursprung}/`,
    response_type: "code",
    scope: "openid profile email",
    ui_locales: "de",
    automaticSilentRenew: true,
  };
}

export const apiUrl = (env: Umgebung): string => env["VITE_API_URL"] ?? "http://localhost:3000";

export async function holeKonto(api: string, token: string, abruf: Abruf = fetch): Promise<Konto> {
  const res = await abruf(`${api}/konto`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) throw new Error("nicht_angemeldet");
  if (!res.ok) throw new Error("konto_nicht_ladbar");
  return (await res.json()) as Konto;
}

/** „Auf allen Geräten abmelden“: beendet beim Anmeldedienst alle Sitzungen des Kontos (Account-API). */
export async function abmeldenUeberall(
  authority: string,
  token: string,
  abruf: Abruf = fetch,
): Promise<void> {
  const res = await abruf(`${authority}/account/sessions`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error("abmelden_fehlgeschlagen");
}
