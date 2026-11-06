import { texts } from "@/shared/lib/text-rules/texts";
import { PATHS, type AccountSection } from "@/shared/patterns/navigation/navigation/navigation";
import table from "../whats-new/whats-new.de.json";

const t = texts(table);

/** The path segment of each section (US-QS-17); `accountAddress` derives the same segments. */
export const ACCOUNT_SECTIONS = {
  profile: "profile",
  settings: "settings",
  achievements: "achievements",
  reminders: "reminders",
  aiClients: "ai-clients",
  measured: "measured",
  functions: "functions",
  news: "news",
  data: "data",
} as const;

/** The former anchors of the stacked "Konto" (`/account#erfolge`): old links and bookmarks lead to the matching section (US-QS-17). */
export const LEGACY_ACCOUNT_ANCHORS: Readonly<Record<string, AccountSection>> = {
  profil: "profile",
  einstellungen: "settings",
  erfolge: "achievements",
  erinnerungen: "reminders",
  "ki-clients": "aiClients",
  gemessen: "measured",
  funktionen: "functions",
  daten: "data",
};

/** The sections of "Konto" in the order of the index (US-QS-17): key, name and the loading text. */
export const SECTIONS: readonly { key: AccountSection; title: string; loading: string }[] = [
  { key: "profile", title: "Profil", loading: "Profil wird geladen …" },
  { key: "settings", title: "Einstellungen", loading: "Einstellungen werden geladen …" },
  { key: "achievements", title: "Erfolge", loading: "Erfolge werden geladen …" },
  { key: "reminders", title: "Erinnerungen", loading: "Erinnerungen werden geladen …" },
  { key: "aiClients", title: "KI-Clients", loading: "KI-Clients werden geladen …" },
  { key: "measured", title: "Was wird gemessen?", loading: "Wird geladen …" },
  { key: "functions", title: "Was die App kann", loading: "Funktionen werden geladen …" },
  { key: "news", title: t("section.title"), loading: t("section.loading") },
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

/**
 * Whether a section is off for the keeper, so its address leads to the index (US-QS-17): AI access without the AI
 * function, "Erfolge" while the keeper's switch of the achievements is off (US-ONB-09), "Was die App kann" without its
 * overview.
 */
export function isOff(
  open: AccountSection | undefined,
  ai: boolean | undefined,
  achievements: boolean,
  hasOverview: boolean,
): boolean {
  return (
    (open === "aiClients" && !ai) ||
    (open === "achievements" && !achievements) ||
    (open === "functions" && !hasOverview)
  );
}
