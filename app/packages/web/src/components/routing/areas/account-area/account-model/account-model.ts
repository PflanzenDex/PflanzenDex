import {
  ACCOUNT_SECTIONS,
  PATHS,
  type AccountSection,
} from "@/components/shared/navigation/nav-model/navigation/navigation";

/** The sections of "Konto" in the order of the index (US-QS-17): key, name and the loading text. */
export const SECTIONS: readonly { key: AccountSection; title: string; loading: string }[] = [
  { key: "profile", title: "Profil", loading: "Profil wird geladen …" },
  { key: "settings", title: "Einstellungen", loading: "Einstellungen werden geladen …" },
  { key: "achievements", title: "Erfolge", loading: "Erfolge werden geladen …" },
  { key: "reminders", title: "Erinnerungen", loading: "Erinnerungen werden geladen …" },
  { key: "aiClients", title: "KI-Clients", loading: "KI-Clients werden geladen …" },
  { key: "measured", title: "Was wird gemessen?", loading: "Wird geladen …" },
  { key: "functions", title: "Was die App kann", loading: "Funktionen werden geladen …" },
  { key: "data", title: "Meine Daten", loading: "Meine Daten werden geladen …" },
];

/**
 * The state of the address: `undefined` is the index, a key a section, `"unknown"` a segment that is no section.
 * `/account/settings` and `/account/settings/` are the same.
 */
export function sectionOf(pathname: string): AccountSection | "unknown" | undefined {
  const rest = pathname.slice(PATHS.account.length).replace(/^\/+|\/+$/g, "");
  if (rest === "") return undefined;
  const found = (Object.keys(ACCOUNT_SECTIONS) as AccountSection[]).find(
    (k) => ACCOUNT_SECTIONS[k] === rest,
  );
  return found ?? "unknown";
}

/** The id of the row of a section in the index: the target of the focus when Back returns to the index. */
export const rowId = (key: AccountSection) => `konto-row-${ACCOUNT_SECTIONS[key]}`;
