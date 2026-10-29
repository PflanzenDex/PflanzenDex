// German texts of the lock states (US-ONB-05, FR-QG-11): the API sends reasons and ways as data, the words live here.
// No countdown pressure: every line is a plain fact (FR-ONB-08).
import type { UnlockFunctionId, UnlockReason, UnlockWay } from "@pflanzendex/core";
import {
  PATHS,
  CATALOG_ADDRESS,
  EXCHANGE_PATH,
  MANAGE_ADDRESS,
  SPECIES_MODE_ADDRESS,
  WISHLIST_MODE_ADDRESS,
  accountAddress,
  todayAddress,
} from "../../../components/shared/navigation/nav-model/navigation/navigation";
import type { UnlockEntry } from "./unlock-api";

/** The mark next to a locked entry: text, never colour or an icon alone (NFR-13). */
export type LockMark = "Bald" | "Noch gesperrt";

export const FUNCTION_NAMES: Record<UnlockFunctionId, string> = {
  today: "Heute",
  collection: "Sammlung",
  species_catalog: "Artenkatalog",
  light_zones: "Standorte und Licht",
  measuring: "Messen",
  photos: "Fotos",
  growth: "Wachstum",
  treatments: "Behandlungen",
  pokedex: "Pokédex",
  wishlist: "Wunschliste",
  discover: "Vorschläge entdecken",
  equipment: "Ausrüstung",
  friends: "Freunde",
  swapping: "Tauschen",
  ai_access: "KI-Zugang",
  care_rhythm: "Pflegerhythmus",
  anniversaries: "Jahrestage",
  year_in_review: "Jahresrückblick",
};

/** What may still be empty once the keeper opens the function early (US-ONB-05): one sentence each. */
export const FUNCTION_EMPTY: Record<UnlockFunctionId, string> = {
  today: "Es steht noch nichts an.",
  collection: "Du hast noch keine Pflanzen.",
  species_catalog: "Der Katalog ist für alle offen.",
  light_zones: "Du hast noch keine Standorte angelegt.",
  measuring: "Du hast noch keine Messungen.",
  photos: "Du hast noch keine Fotos.",
  growth: "Es gibt noch keinen Verlauf.",
  treatments: "Du hast noch keine Behandlungen geplant.",
  pokedex: "Dein Pokédex ist noch leer.",
  wishlist: "Deine Wunschliste ist noch leer.",
  discover: "Die Vorschläge kennen noch wenig von dir.",
  equipment: "Du hast noch keine Ausrüstung eingetragen.",
  friends: "Du hast noch keine Freunde: Freunde einladen.",
  swapping: "Du hast noch keine Freunde zum Tauschen: Freunde einladen.",
  ai_access: "Du hast noch keinen KI-Zugang eingerichtet.",
  care_rhythm: "Dein Verlauf ist noch kurz.",
  anniversaries: "Es gibt noch keine Jahrestage.",
  year_in_review: "Es gibt noch keinen Rückblick.",
};

const ADDRESSES: Record<UnlockFunctionId, string> = {
  today: PATHS.today,
  collection: PATHS.collection,
  species_catalog: CATALOG_ADDRESS,
  light_zones: MANAGE_ADDRESS,
  measuring: PATHS.collection,
  photos: PATHS.collection,
  growth: PATHS.collection,
  treatments: todayAddress("treatments"),
  pokedex: SPECIES_MODE_ADDRESS,
  wishlist: WISHLIST_MODE_ADDRESS,
  discover: PATHS.discover,
  equipment: `${PATHS.collection}?view=equipment`,
  friends: PATHS.friends,
  swapping: EXCHANGE_PATH,
  ai_access: accountAddress("aiClients"),
  care_rhythm: accountAddress("achievements"),
  anniversaries: accountAddress("achievements"),
  year_in_review: accountAddress("achievements"),
};

/** The address of the lock page of a function: it opens for bookmarks and links, never blank (FR-ONB-02). */
export const lockAddress = (id: string) => `/unlock/${encodeURIComponent(id)}`;

const lookup = (table: Readonly<Record<string, string>>, id: string, fallback: string): string =>
  (Object.hasOwn(table, id) ? table[id] : undefined) ?? fallback;

export const functionName = (id: string): string => lookup(FUNCTION_NAMES, id, "Diese Funktion");
export const functionAddress = (id: string): string => lookup(ADDRESSES, id, PATHS.today);
export const functionEmpty = (id: string): string => lookup(FUNCTION_EMPTY, id, "");

const plants = (n: number) => `${n} ${n === 1 ? "Pflanze" : "Pflanzen"}`;

/** One way as a plain fact: "noch 112 Tage", "lege 3 Pflanzen an" (the reason says how many plants exist). */
function wayText(way: UnlockWay, reason: UnlockReason | undefined): string {
  if (way.kind === "add_first_specimen") return "lege deine erste Pflanze an";
  if (way.kind === "add_specimens") {
    const some = reason?.kind === "specimens" && reason.have > 0;
    return `lege ${some ? "noch " : ""}${plants(way.missing)} an`;
  }
  return way.days <= 0 ? "ab morgen" : `noch ${way.days} ${way.days === 1 ? "Tag" : "Tage"}`;
}

/** The way: all ways, any one opens the function ("noch 28 Tage oder lege 5 Pflanzen an"). */
export function waysText(entry: UnlockEntry): string {
  return entry.ways.map((w, i) => wayText(w, entry.reasons[i])).join(" oder ");
}

/** "Tauschen: lege 3 Pflanzen an" / "Jahresrückblick: noch 112 Tage" (US-ONB-05). */
export const lockLine = (entry: UnlockEntry): string =>
  `${functionName(entry.id)}: ${waysText(entry)}`;

/** "Bald" when only time is missing, "Noch gesperrt" when plants are needed. */
export const lockMark = (entry: UnlockEntry): LockMark =>
  entry.ways.length > 0 && entry.ways.every((w) => w.kind === "wait") ? "Bald" : "Noch gesperrt";

/** Announced and locked: the only entries the navigation, the start page and the overview mark (calm mode hides ACH). */
export const isShownLocked = (e: UnlockEntry): boolean => e.state === "locked" && e.announced;
